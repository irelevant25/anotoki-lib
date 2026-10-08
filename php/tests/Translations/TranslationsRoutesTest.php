<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Translations;

use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\LanguageUsage;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Schema;
use Anotoki\Lib\Translations\Translations;
use Anotoki\Lib\Translations\TranslationsConfig;
use PDO;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Handlers\Strategies\RequestResponseArgs;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

/** The routes on a real Slim app, driven in-process: every route, every code, and the site's closures. */
final class TranslationsRoutesTest extends DatabaseTestCase
{
    /** @var list<array{string, ?string, ?string, array<string, mixed>, string}> what $audit was told: action, type, id, details, the request's id */
    private array $audited = [];

    private int $built = 0;

    private bool $tablesGone = false;

    protected function setUp(): void
    {
        parent::setUp();
        self::assertNull($this->migrator([$this->set('site'), Schema::migrationSet()])->apply()['error']);
        $this->pdo->exec("INSERT INTO translation_keys (name, description) VALUES ('common.save', 'A button.'), ('mail.reset.subject', 'A subject.')");
        $this->pdo->exec("INSERT INTO translations (key_name, language_code, value) VALUES
            ('common.save', 'en', 'Save'), ('common.save', 'sk', 'Uložiť'), ('mail.reset.subject', 'en', 'Reset your password')");
    }

    // ─── The bundle ─────────────────────────────────────────────────────────

    public function testTheBundleWithItsTagAnd304(): void
    {
        $app = $this->app();

        $response = $this->request($app, 'GET', '/api/translations/sk');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame('application/json; charset=utf-8', $response->getHeaderLine('Content-Type'));
        self::assertSame('no-cache', $response->getHeaderLine('Cache-Control'));
        $body = (string) $response->getBody();
        $etag = $response->getHeaderLine('ETag');
        self::assertSame('"' . md5($body) . '"', $etag);
        $bundle = json_decode($body, true);
        self::assertSame('sk', $bundle['language']);
        self::assertSame('Uložiť', $bundle['values']['common.save']);
        self::assertArrayNotHasKey('mail.reset.subject', $bundle['values']);
        self::assertSame(json_encode((new Translations($this->pdo, $this->config()))->bundle('sk'), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $body, 'the bytes the IAM answers with');

        $inner = substr($etag, 1, -1);
        foreach ([$etag, "W/$etag", "\"$inner-gzip\"", "W/\"$inner-br\", \"x\"", '*'] as $tag) {
            $notModified = $this->request($app, 'GET', '/api/translations/sk', ['If-None-Match' => $tag]);
            self::assertSame(304, $notModified->getStatusCode(), $tag);
            self::assertSame('', (string) $notModified->getBody());
            self::assertSame([$etag, 'no-cache'], [$notModified->getHeaderLine('ETag'), $notModified->getHeaderLine('Cache-Control')]);
        }
        self::assertSame(200, $this->request($app, 'GET', '/api/translations/sk', ['If-None-Match' => '"other"'])->getStatusCode());

        $regional = $this->request($app, 'GET', '/api/translations/sk-sk');
        self::assertSame([$body, $etag], [(string) $regional->getBody(), $regional->getHeaderLine('ETag')], 'sk-sk: the very answer of sk');
    }

    public function testANonCodeIs404BeforeAnyQuery(): void
    {
        $app = $this->app();

        foreach (['EN', 'en-GB', 'en_gb', 'english', '%C3%28'] as $code) {
            $response = $this->request($app, 'GET', "/api/translations/$code");
            self::assertSame(404, $response->getStatusCode(), $code);
            self::assertSame(['code' => 'not_found', 'message' => 'There is no such language'], $this->json($response));
        }
        self::assertSame(0, $this->built, 'the translations were never even built');
    }

    public function testNoTablesOrNoDatabaseIs503WithRetryAfter(): void
    {
        $app = $this->app();
        $this->tablesGone = true;

        $response = $this->request($app, 'GET', '/api/translations/sk');
        self::assertSame(503, $response->getStatusCode());
        self::assertSame('60', $response->getHeaderLine('Retry-After'));
        self::assertSame('translations_unavailable', $this->json($response)['code']);

        $dead = AppFactory::create();
        TranslationsRoutes::bundle($dead, static function (): Translations {
            throw new PDOException('SQLSTATE[08006] could not connect to server');
        });
        $response = $this->request($dead, 'GET', '/api/translations/sk');
        self::assertSame([503, 'translations_unavailable', '60'], [$response->getStatusCode(), $this->json($response)['code'], $response->getHeaderLine('Retry-After')]);
    }

    public function testTheSitesOwnErrorBody(): void
    {
        $app = AppFactory::create();
        $iamError = static function (ResponseInterface $response, Refusal $refusal): ResponseInterface {
            $response->getBody()->write((string) json_encode(['error' => $refusal->message, 'code' => $refusal->code] + $refusal->extra, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

            return $response->withStatus($refusal->status)->withHeader('Content-Type', 'application/json');
        };
        TranslationsRoutes::bundle($app, fn (): Translations => new Translations($this->pdo), $iamError);
        TranslationsRoutes::strings($app, '/api/admin', fn (): Translations => new Translations($this->pdo), static fn (): ?int => 1, $iamError);

        self::assertSame('{"error":"There is no such language","code":"not_found"}', (string) $this->request($app, 'GET', '/api/translations/EN')->getBody());
        $refused = $this->request($app, 'PUT', '/api/admin/translations', [], ['values' => ['no.such' => ['en' => 'x']]]);
        self::assertSame(422, $refused->getStatusCode());
        self::assertSame(['error' => 'The site has no key "no.such". Keys are made by the code, never here.', 'code' => 'unknown_key', 'key' => 'no.such', 'keys' => ['no.such']], $this->json($refused));
    }

    public function testThereIsNothingElseUnderTheBundlesPath(): void
    {
        $app = $this->app();
        $app->addErrorMiddleware(false, false, false);

        self::assertSame(405, $this->request($app, 'PUT', '/api/translations/sk', [], ['x' => 1])->getStatusCode());
        self::assertSame(404, $this->request($app, 'GET', '/api/translations')->getStatusCode());
        self::assertSame(404, $this->request($app, 'GET', '/api/translations/sk/more')->getStatusCode());
    }

    // ─── The strings ────────────────────────────────────────────────────────

    public function testTheLanguagesAndTheGrid(): void
    {
        $app = $this->app();

        $languages = $this->request($app, 'GET', '/api/admin/languages');
        self::assertSame('no-store', $languages->getHeaderLine('Cache-Control'));
        self::assertSame(
            ['code' => 'en', 'name' => 'English', 'native_name' => 'English', 'enabled' => true, 'sort_order' => 1, 'seeded' => true, 'strings' => 2 + count(LibraryWords::keys()), 'accounts' => 4],
            $this->json($languages)['languages'][0]
        );
        $grid = $this->json($this->request($app, 'GET', '/api/admin/translations'));
        self::assertSame(['languages', 'keys'], array_keys($grid));
        self::assertContains(['name' => 'common.save', 'description' => 'A button.', 'values' => ['en' => 'Save', 'sk' => 'Uložiť']], $grid['keys']);
    }

    public function testASaveAnswersTheGridAndIsAuditedWithWhoSavedIt(): void
    {
        $app = $this->app();

        $response = $this->request($app, 'PUT', '/api/admin/translations', ['X-Request-Id' => 'r1'], ['values' => ['common.save' => ['sk' => 'Ulož'], 'mail.reset.subject' => ['sk' => 'Obnov si heslo']]]);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['languages', 'keys'], array_keys($this->json($response)));
        self::assertSame('42', $this->value("SELECT updated_by::text FROM translations WHERE key_name = 'common.save' AND language_code = 'sk'"));
        self::assertSame([[
            'translations.saved', null, null,
            ['languages' => ['sk'], 'count' => 2, 'keys' => ['common.save', 'mail.reset.subject'], 'mail' => [['key' => 'mail.reset.subject', 'language' => 'sk', 'old' => null, 'new' => 'Obnov si heslo']]],
            'r1',
        ]], $this->audited);

        $this->request($app, 'PUT', '/api/admin/translations', [], ['values' => ['common.save' => ['sk' => 'Ulož']]]);
        self::assertCount(1, $this->audited, 'nothing changed: nothing audited');
    }

    public function testTheBodyIsReadByTheLibraryJsonOnly(): void
    {
        $app = $this->app();
        $put = fn (string $body, array $headers = []): ResponseInterface => $this->raw($app, 'PUT', '/api/admin/translations', $body, $headers);

        foreach ([
            [$put('{"values": {}}', ['Content-Type' => 'application/x-www-form-urlencoded']), 415, 'unsupported_media_type'],
            [$put('{"values": {}}', ['Content-Type' => '']), 415, 'unsupported_media_type'],
            [$put('{"values": {}}', ['Content-Length' => (string) (2 * 1024 * 1024)]), 413, 'too_large'],
            [$put('{"values": {"common.save": {"sk": "' . str_repeat('a', 1024 * 1024) . '"}}}', ['Content-Length' => '']), 413, 'too_large'],
            [$put(''), 422, 'empty_body'],
            [$put('{"values": '), 400, 'invalid_json'],
            [$put('{"values": []}'), 422, 'invalid_value'],
            [$put('[]'), 422, 'invalid_value'],
            [$put('{"values": {"common.save": []}}'), 422, 'invalid_value'],
            [$put('{"values": {"common.save": "Save"}}'), 422, 'invalid_value'],
        ] as $index => [$response, $status, $code]) {
            self::assertSame([$status, $code], [$response->getStatusCode(), $this->json($response)['code'] ?? null], "case $index: " . $response->getBody());
        }
        self::assertSame(200, $put('{"values": {}}')->getStatusCode(), '{} is a map: nothing to save');
        self::assertSame(200, $put('{"values": {"common.save": {}}}')->getStatusCode());
        self::assertSame([], $this->audited);
    }

    public function testTheOrderIs404ThenTheBodyThen503(): void
    {
        $app = $this->app();
        $this->tablesGone = true;

        self::assertSame(404, $this->raw($app, 'PUT', '/api/admin/translations/EN/import', '', ['Content-Length' => (string) (5 * 1024 * 1024)])->getStatusCode());
        self::assertSame(413, $this->raw($app, 'PUT', '/api/admin/translations/sk/import', '{}', ['Content-Length' => (string) (5 * 1024 * 1024)])->getStatusCode());
        self::assertSame(415, $this->raw($app, 'POST', '/api/admin/languages', 'code=de', ['Content-Type' => 'application/x-www-form-urlencoded'])->getStatusCode());
        $unavailable = $this->raw($app, 'PUT', '/api/admin/translations/sk/import', '{}');
        self::assertSame([503, '60'], [$unavailable->getStatusCode(), $unavailable->getHeaderLine('Retry-After')]);
        foreach ([['GET', '/api/admin/languages'], ['GET', '/api/admin/translations'], ['GET', '/api/admin/translations/sk/export'], ['DELETE', '/api/admin/languages/de']] as [$method, $path]) {
            self::assertSame(503, $this->request($app, $method, $path)->getStatusCode(), "$method $path");
        }
    }

    public function testExportIsADownloadInTheFilesFormatAndImportIsAudited(): void
    {
        $app = $this->app();

        $export = $this->request($app, 'GET', '/api/admin/translations/sk/export');
        self::assertSame(200, $export->getStatusCode());
        self::assertSame('attachment; filename="translations-sk.json"', $export->getHeaderLine('Content-Disposition'));
        self::assertSame('no-store', $export->getHeaderLine('Cache-Control'));
        self::assertStringStartsWith("{\n    \"anotoki.language.button\": \"Jazyk: {name} ({code})\",\n", (string) $export->getBody());
        self::assertStringEndsWith("}\n", (string) $export->getBody());
        self::assertSame(404, $this->request($app, 'GET', '/api/admin/translations/de/export')->getStatusCode());
        self::assertSame(404, $this->request($app, 'GET', '/api/admin/translations/DE/export')->getStatusCode());

        $import = $this->request($app, 'PUT', '/api/admin/translations/sk/import', [], ['common.save' => 'Ulož', 'mail.reset.subject' => '']);
        self::assertSame(200, $import->getStatusCode());
        self::assertSame([['translations.imported', 'language', 'sk', ['languages' => ['sk'], 'count' => 1, 'keys' => ['common.save']], '']], $this->audited);
        self::assertSame(422, $this->request($app, 'PUT', '/api/admin/translations/sk/import', [], ['no.such' => 'x'])->getStatusCode());
        self::assertSame(404, $this->request($app, 'PUT', '/api/admin/translations/de/import', [], ['common.save' => 'x'])->getStatusCode());
    }

    // ─── The languages ──────────────────────────────────────────────────────

    public function testALanguageMadeChangedAndDeletedEachAudited(): void
    {
        $app = $this->app();

        $made = $this->request($app, 'POST', '/api/admin/languages', [], ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch', 'enabled' => false]);
        self::assertSame(201, $made->getStatusCode(), (string) $made->getBody());
        self::assertSame(['language' => ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch', 'enabled' => false, 'sort_order' => 3, 'seeded' => false, 'strings' => 0, 'accounts' => 0]], $this->json($made));
        self::assertSame(409, $this->request($app, 'POST', '/api/admin/languages', [], ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'])->getStatusCode());

        $changed = $this->request($app, 'PUT', '/api/admin/languages/de', [], ['enabled' => true, 'sort_order' => 3]);
        self::assertSame(['de', true], [$this->json($changed)['language']['code'], $this->json($changed)['language']['enabled']]);
        $this->request($app, 'PUT', '/api/admin/languages/de', [], ['name' => 'German']);
        self::assertSame(409, $this->request($app, 'PUT', '/api/admin/languages/en', [], ['enabled' => false])->getStatusCode());
        self::assertSame(404, $this->request($app, 'PUT', '/api/admin/languages/xx', [], ['enabled' => false])->getStatusCode());

        $this->request($app, 'PUT', '/api/admin/translations', [], ['values' => ['common.save' => ['de' => 'Speichern']]]);
        $deleted = $this->request($app, 'DELETE', '/api/admin/languages/de');
        self::assertSame(['strings' => 1, 'accounts' => 0], $this->json($deleted));
        self::assertSame(409, $this->request($app, 'DELETE', '/api/admin/languages/sk')->getStatusCode());
        self::assertSame(404, $this->request($app, 'DELETE', '/api/admin/languages/de')->getStatusCode());

        self::assertSame([
            ['language.created', 'language', 'de', ['name' => 'German', 'native_name' => 'Deutsch', 'enabled' => false], ''],
            ['language.updated', 'language', 'de', ['enabled' => true], ''],
            ['translations.saved', null, null, ['languages' => ['de'], 'count' => 1, 'keys' => ['common.save']], ''],
            ['language.deleted', 'language', 'de', ['name' => 'German', 'strings' => 1, 'accounts' => 0], ''],
        ], $this->audited);
    }

    public function testTheSitesChecksStandBeforeEveryRouteOfItsGroup(): void
    {
        $app = $this->app();

        foreach ([
            ['GET', '/api/admin/languages', 'editor'], ['GET', '/api/admin/translations', 'editor'], ['PUT', '/api/admin/translations', 'editor'],
            ['GET', '/api/admin/translations/sk/export', 'editor'], ['PUT', '/api/admin/translations/sk/import', 'editor'],
            ['POST', '/api/admin/languages', 'admin'], ['PUT', '/api/admin/languages/sk', 'admin'], ['DELETE', '/api/admin/languages/de', 'admin'],
        ] as [$method, $path, $needs]) {
            self::assertSame(403, $this->request($app, $method, $path, ['X-Role' => 'nobody'], ['x' => 1])->getStatusCode(), "$method $path");
            if ($needs === 'admin') {
                self::assertSame(403, $this->request($app, $method, $path, ['X-Role' => 'editor'], ['x' => 1])->getStatusCode(), "an editor: $method $path");
            }
        }
        self::assertSame(200, $this->request($app, 'GET', '/api/translations/sk', ['X-Role' => 'nobody'])->getStatusCode(), 'the bundle is public');
        self::assertSame(200, $this->request($app, 'GET', '/api/admin/languages', ['X-Role' => 'editor'])->getStatusCode());
        self::assertSame([], $this->audited);
    }

    public function testTheRoutesWorkWithTheSitesOwnStrategyAndInsideItsGroup(): void
    {
        $app = AppFactory::create();
        $app->getRouteCollector()->setDefaultInvocationStrategy(new RequestResponseArgs());
        $words = fn (): Translations => new Translations($this->pdo, $this->config());
        $app->group('/api/admin', function ($group) use ($words): void {
            TranslationsRoutes::strings($group, '', $words, static fn (): ?int => 5);
            TranslationsRoutes::languages($group, '', $words);
        });
        TranslationsRoutes::bundle($app, $words);

        self::assertSame(200, $this->request($app, 'GET', '/api/translations/en')->getStatusCode());
        self::assertSame(200, $this->request($app, 'GET', '/api/admin/translations/sk/export')->getStatusCode());
        self::assertSame(201, $this->request($app, 'POST', '/api/admin/languages', [], ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'])->getStatusCode());
        self::assertSame(200, $this->request($app, 'DELETE', '/api/admin/languages/de')->getStatusCode());
    }

    // ─── The gate's open path ───────────────────────────────────────────────

    public function testTheBundlePassesTheGateWhileAnUpdateWaitsAndNothingDressedUpAsItDoes(): void
    {
        self::assertSame('~^/api/translations/[^/]+$~D', TranslationsRoutes::openPath());
        self::assertSame('~^/words\.d/[^/]+$~D', TranslationsRoutes::openPath('/words.d'));

        $this->set('site', ['001_waiting.sql' => 'CREATE TABLE waiting (id int);']);
        $state = new SiteState(static fn (): ?string => null, static fn (): bool => true, fn (): Migrator => $this->migrator([$this->set('site'), Schema::migrationSet()]));
        self::assertSame(SiteState::UPDATE_PENDING, $state->state());
        $app = AppFactory::create();
        $app->add(new SiteGate($state, new ResponseFactory(), [TranslationsRoutes::openPath()]));
        TranslationsRoutes::bundle($app, fn (): Translations => new Translations($this->pdo));
        $app->get('/api/translations/{code}/more', static fn ($request, $response) => $response);
        $app->get('/api/translationsx/{code}', static fn ($request, $response) => $response);

        self::assertSame(200, $this->request($app, 'GET', '/api/translations/sk')->getStatusCode());
        foreach (['/api/translations/sk/more', '/api/translationsx/sk', '/api/translations/sk%2Fmore', '/api/translations/', '/x/api/translations/sk'] as $path) {
            self::assertSame(503, $this->request($app, 'GET', $path)->getStatusCode(), $path);
        }
        // One segment of anything passes the gate - the bundle's own check of the code answers it, before any query.
        self::assertSame(404, $this->request($app, 'GET', '/api/translations/sk%0A')->getStatusCode());
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private function config(): TranslationsConfig
    {
        return new TranslationsConfig(serverNamespaces: ['mail'], usage: new class () implements LanguageUsage {
            public function extras(PDO $pdo, array $codes): array
            {
                return array_intersect_key(['en' => ['accounts' => 4]], array_flip($codes)) + array_fill_keys($codes, ['accounts' => 0]);
            }

            public function refuseDelete(PDO $pdo, string $code): ?Refusal
            {
                return null;
            }

            public function beforeDelete(PDO $pdo, string $code, array $strings): array
            {
                return [];
            }
        });
    }

    /** The site: the bundle, the strings for an editor, the languages for an admin (a header stands for the token). */
    private function app(): App
    {
        $app = AppFactory::create();
        $words = function (): Translations {
            $this->built++;
            if ($this->tablesGone) {
                $this->pdo->exec('DROP TABLE IF EXISTS translations, translation_keys, languages CASCADE');
            }

            return new Translations($this->pdo, $this->config());
        };
        $audit = function (ServerRequestInterface $request, string $action, ?string $type, ?string $id, array $details): void {
            $this->audited[] = [$action, $type, $id, $details, $request->getHeaderLine('X-Request-Id')];
        };
        $role = static fn (string ...$roles) => static function (ServerRequestInterface $request, RequestHandlerInterface $handler) use ($roles): ResponseInterface {
            return in_array($request->getHeaderLine('X-Role') ?: 'admin', $roles, true) ? $handler->handle($request) : (new ResponseFactory())->createResponse(403);
        };

        TranslationsRoutes::bundle($app, $words);
        TranslationsRoutes::strings($app, '/api/admin', $words, static fn (ServerRequestInterface $request): ?int => 42, null, $audit)->add($role('admin', 'editor'));
        TranslationsRoutes::languages($app, '/api/admin', $words, null, $audit)->add($role('admin'));

        return $app;
    }

    /** @param array<string, string> $headers */
    private function request(App $app, string $method, string $target, array $headers = [], mixed $json = null): ResponseInterface
    {
        return $this->raw($app, $method, $target, $json === null ? '' : (string) json_encode($json), $headers + ($json === null ? [] : ['Content-Type' => 'application/json']));
    }

    /** @param array<string, string> $headers */
    private function raw(App $app, string $method, string $target, string $body, array $headers = []): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://site.example' . $target)
            ->withBody((new StreamFactory())->createStream($body));
        foreach ($headers + ['Content-Type' => 'application/json', 'Content-Length' => (string) strlen($body)] as $name => $value) {
            $request = $value === '' ? $request->withoutHeader($name) : $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /** @return array<string, mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
