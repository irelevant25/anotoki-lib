<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\SiteSettings;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\SiteSettings\Http\SiteSettingsRoutes;
use Anotoki\Lib\SiteSettings\SiteSettings;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

/** The site settings' routes on a real Slim app and database: what every page is told, and the admin page's API. */
final class SiteSettingsRoutesTest extends DatabaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::assertNull($this->migrator([Schema::migrationSet()])->apply()['error']);
    }

    public function testEveryPageIsToldTheAnnouncementAndWhoSeesEachPageAndNothingElse(): void
    {
        $app = $this->app();
        $this->send($app, 'PUT', '/api/admin/site-settings', [
            'settings' => ['announcement_enabled' => true, 'announcement_level' => 'danger', 'announcement_message' => ['en' => 'Down tonight', 'sk' => 'Dnes v noci mimo']],
        ]);
        $this->send($app, 'POST', '/api/admin/site-settings/pages', ['path' => '/quizzes', 'visibility' => 'USER', 'api_paths' => ['/api/quiz']]);

        $response = $this->send($app, 'GET', '/api/site-settings', admin: null);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        self::assertSame(
            '{"maintenance":false,"announcement":{"level":"danger","message":{"en":"Down tonight","sk":"Dnes v noci mimo"}},"pages":[{"path":"/quizzes","visibility":"USER","blocked":false}]}',
            (string) $response->getBody(),
            'no API path, nobody\'s name, no history - getting in only as whether the site is closed (the gate reads the status path)',
        );
    }

    public function testTheAdminRoutesAreTheSitesAdministratorsAlone(): void
    {
        $app = $this->app();
        foreach (
            [
                ['GET', '/api/admin/site-settings'],
                ['PUT', '/api/admin/site-settings'],
                ['POST', '/api/admin/site-settings/pages'],
                ['PUT', '/api/admin/site-settings/pages'],
                ['DELETE', '/api/admin/site-settings/pages/1'],
            ]
            as [$method, $path]
        ) {
            self::assertSame(401, $this->send($app, $method, $path, [], admin: null)->getStatusCode(), "$method $path: nobody");
            self::assertSame(403, $this->send($app, $method, $path, [], admin: 'no')->getStatusCode(), "$method $path: somebody else");
        }
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM anotoki_site_settings') + (int) $this->value('SELECT count(*) FROM anotoki_page_access'));
    }

    public function testThePageGetsWhatItDrawsAndASaveIsAudited(): void
    {
        $audit = new AuditLog(fn() => $this->pdo);
        $app = $this->app($audit);

        $whole = $this->json($this->send($app, 'GET', '/api/admin/site-settings'));
        self::assertSame(['getting_in', 'announcement', 'page_access'], $whole['parts']);
        self::assertSame(['value' => false, 'updated_at' => null, 'updated_by' => null, 'updated_by_name' => null], $whole['settings']['maintenance_mode']);
        self::assertSame([], $whole['settings']['maintenance_message']['value']);
        self::assertSame(
            '{}',
            json_encode(json_decode((string) $this->send($app, 'GET', '/api/admin/site-settings')->getBody())->settings->maintenance_message->value),
            'a message is an object on the wire',
        );
        self::assertSame(['info', 'warning', 'danger'], $whole['levels']);
        self::assertSame(['PUBLIC', 'USER', 'EDITOR', 'ADMIN'], $whole['visibilities']);
        self::assertContains('/staff', $whole['reserved']['pages']);
        self::assertContains('/api/me', $whole['reserved']['api_paths']);
        self::assertSame(2000, $whole['limits']['message']);

        $saved = $this->send($app, 'PUT', '/api/admin/site-settings', ['settings' => ['maintenance_mode' => true, 'maintenance_message' => ['en' => 'Back soon']]]);
        self::assertSame(200, $saved->getStatusCode());
        $after = $this->json($saved);
        self::assertSame(
            [true, 7, 'Bo'],
            [$after['settings']['maintenance_mode']['value'], $after['settings']['maintenance_mode']['updated_by'], $after['settings']['maintenance_mode']['updated_by_name']],
        );
        $entry = $this->rows("SELECT actor_id, action, target_type, details FROM anotoki_audit_log WHERE action = 'site_settings.changed'");
        self::assertCount(1, $entry);
        self::assertEquals(
            ['maintenance_mode' => ['old' => false, 'new' => true], 'maintenance_message' => ['old' => [], 'new' => ['en' => 'Back soon']]],
            json_decode((string) $entry[0]['details'], true),
            'each switch before and after, as the audit page reads it (JSONB keeps its keys in an order of its own)',
        );

        $this->send($app, 'PUT', '/api/admin/site-settings', ['settings' => ['maintenance_mode' => true]]);
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM anotoki_audit_log WHERE action = 'site_settings.changed'"), 'no change, no entry');
    }

    public function testARefusedSaveSaysWhyAndWritesNothing(): void
    {
        $app = $this->app();
        foreach (
            [
                [['settings' => ['maintenance_mode' => 'yes']], 'invalid_setting'],
                [['settings' => ['nonsense' => true]], 'unknown_setting'],
                [['settings' => [true, false]], 'invalid_body'],
                [['switches' => []], 'invalid_body'],
            ]
            as [$body, $code]
        ) {
            $refused = $this->send($app, 'PUT', '/api/admin/site-settings', $body);
            self::assertSame([422, $code], [$refused->getStatusCode(), $this->json($refused)['code']], $code);
        }
        self::assertSame(415, $this->send($app, 'PUT', '/api/admin/site-settings', 'settings=1', contentType: 'application/x-www-form-urlencoded')->getStatusCode());
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM anotoki_site_settings'));
    }

    public function testPagesThroughTheRoutesEachChangeAudited(): void
    {
        $audit = new AuditLog(fn() => $this->pdo);
        $app = $this->app($audit);

        $added = $this->send($app, 'POST', '/api/admin/site-settings/pages', ['path' => '/quizzes', 'api_paths' => ['/api/quiz']]);
        self::assertSame(201, $added->getStatusCode());
        $page = $this->json($added)['pages'][0];
        self::assertSame(
            ['/quizzes', 'ADMIN', false, ['/api/quiz'], 'Bo', null],
            [$page['path'], $page['visibility'], $page['blocked'], $page['api_paths'], $page['updated_by_name'], $page['refused']],
            'administrators only, unless said: the safe answer',
        );

        self::assertSame([409, 'page_exists'], $this->codeOf($this->send($app, 'POST', '/api/admin/site-settings/pages', ['path' => '/quizzes'])));
        self::assertSame([422, 'invalid_page'], $this->codeOf($this->send($app, 'POST', '/api/admin/site-settings/pages', ['path' => '/staff'])));
        self::assertSame([422, 'invalid_api_path'], $this->codeOf($this->send($app, 'POST', '/api/admin/site-settings/pages', ['path' => '/x', 'api_paths' => ['/api/']])));
        self::assertSame([422, 'invalid_body'], $this->codeOf($this->send($app, 'POST', '/api/admin/site-settings/pages', ['path' => 5])));

        $saved = $this->send($app, 'PUT', '/api/admin/site-settings/pages', ['pages' => [['id' => $page['id'], 'visibility' => 'PUBLIC', 'blocked' => true]]]);
        self::assertSame(200, $saved->getStatusCode());
        self::assertSame([true, 'PUBLIC'], [$this->json($saved)['pages'][0]['blocked'], $this->json($saved)['pages'][0]['visibility']]);
        self::assertSame([422, 'invalid_body'], $this->codeOf($this->send($app, 'PUT', '/api/admin/site-settings/pages', ['pages' => ['a' => 1]])));

        self::assertSame(200, $this->send($app, 'DELETE', '/api/admin/site-settings/pages/' . $page['id'])->getStatusCode());
        self::assertSame([404, 'not_found'], $this->codeOf($this->send($app, 'DELETE', '/api/admin/site-settings/pages/' . $page['id'])));

        self::assertSame(
            ['page_access.added', 'page_access.changed', 'page_access.removed'],
            $this->pdo->query("SELECT action FROM anotoki_audit_log WHERE action LIKE 'page_access.%' ORDER BY id")->fetchAll(\PDO::FETCH_COLUMN),
        );
        self::assertEquals(
            ['path' => '/quizzes', 'visibility' => ['old' => 'ADMIN', 'new' => 'PUBLIC'], 'blocked' => ['old' => false, 'new' => true]],
            json_decode((string) $this->value("SELECT details FROM anotoki_audit_log WHERE action = 'page_access.changed'"), true),
        );
        self::assertSame((string) $page['id'], (string) $this->value("SELECT target_id FROM anotoki_audit_log WHERE action = 'page_access.removed'"));
    }

    public function testWhileTheTablesWaitTheAdminRoutesSaySoAndThePublicOneDoesWithout(): void
    {
        $this->pdo->exec('DROP TABLE anotoki_site_settings, anotoki_page_access');
        $app = $this->app();

        self::assertSame([503, 'feature_unavailable'], $this->codeOf($this->send($app, 'GET', '/api/admin/site-settings')));
        self::assertSame('60', $this->send($app, 'GET', '/api/admin/site-settings')->getHeaderLine('Retry-After'));
        self::assertSame([503, 'feature_unavailable'], $this->codeOf($this->send($app, 'PUT', '/api/admin/site-settings', ['settings' => ['maintenance_mode' => true]])));
        self::assertSame([503, 'feature_unavailable'], $this->codeOf($this->send($app, 'DELETE', '/api/admin/site-settings/pages/1')));
        self::assertSame('{"maintenance":false,"announcement":null,"pages":[]}', (string) $this->send($app, 'GET', '/api/site-settings', admin: null)->getBody());
    }

    private function app(?AuditLog $audit = null): App
    {
        $settings = new SiteSettings(fn() => $this->pdo, SiteSettings::PARTS, ['/api/me']);
        $context = new AdminContext(
            // X-Test-Admin: yes is the site's ADMIN (7); any other value somebody else (9); none, nobody.
            static fn(ServerRequestInterface $request): ?int => $request->hasHeader('X-Test-Admin') ? ($request->getHeaderLine('X-Test-Admin') === 'yes' ? 7 : 9) : null,
            isAdmin: static fn(ServerRequestInterface $request): bool => $request->getHeaderLine('X-Test-Admin') === 'yes',
            names: static fn(array $ids): array => array_intersect_key([7 => 'Bo'], array_flip($ids)),
        );
        $app = AppFactory::create();
        SiteSettingsRoutes::public($app, $settings);
        SiteSettingsRoutes::admin($app, $settings, $context, $audit);

        return $app;
    }

    /** @param array<mixed>|string $body */
    private function send(App $app, string $method, string $path, array|string $body = [], ?string $admin = 'yes', string $contentType = 'application/json'): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://site.example' . $path);
        if ($method !== 'GET' && $method !== 'DELETE') {
            $request = $request->withBody((new StreamFactory())->createStream(is_string($body) ? $body : (string) json_encode($body)))->withHeader('Content-Type', $contentType);
        }
        if ($admin !== null) {
            $request = $request->withHeader('X-Test-Admin', $admin);
        }

        return $app->handle($request);
    }

    /** @return array{int, string} */
    private function codeOf(ResponseInterface $response): array
    {
        return [$response->getStatusCode(), (string) ($this->json($response)['code'] ?? '')];
    }

    /** @return array<mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
