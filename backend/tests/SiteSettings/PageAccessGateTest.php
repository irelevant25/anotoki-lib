<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\SiteSettings;

use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Auth\SignInRule;
use Anotoki\Lib\Auth\Testing\TestIam;
use Anotoki\Lib\SiteSettings\Http\PageAccessGate;
use Anotoki\Lib\SiteSettings\SiteSettings;
use Anotoki\Lib\Support\JsonResponse;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\LogLines;
use Anotoki\Lib\Tests\Support\TempFolder;
use LogicException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Page access on the server: the API paths a page's row refuses with it, on a real Slim app with Identify and the
 * IAM's tokens - who is refused, who never is, and the ways round it that do not work.
 */
final class PageAccessGateTest extends DatabaseTestCase
{
    use TempFolder;

    private TestIam $iam;
    private SiteSettings $settings;

    protected function setUp(): void
    {
        parent::setUp();
        $this->iam = TestIam::create($this->folder('iam'));
        $this->iam->signInRule(false);
        self::assertNull($this->migrator([Schema::migrationSet()])->apply()['error']);
        $this->settings = new SiteSettings(fn() => $this->pdo, SiteSettings::PARTS, ['/api/me', '/api/auth/config']);
    }

    protected function tearDown(): void
    {
        $this->removeFolder();
        LogLines::take();
        parent::tearDown();
    }

    public function testAPageForPeopleSignedInTakesItsDataFromEverybodyElse(): void
    {
        $this->settings->addPage('/progress', 'USER', false, ['/api/progress'], 7);
        $app = $this->app();

        $refused = $this->send($app, '/api/progress');
        self::assertSame(423, $refused->getStatusCode());
        self::assertSame(['code' => 'page_locked', 'message' => 'That part of the site is not available.'], $this->json($refused));
        self::assertSame('no-store', $refused->getHeaderLine('Cache-Control'));
        self::assertSame(200, $this->send($app, '/api/progress', $this->iam->token(8))->getStatusCode());
        self::assertSame(200, $this->send($app, '/api/characters')->getStatusCode(), 'what no row claims is anybody\'s');
    }

    public function testEditorsAdministratorsAndSwitchedOff(): void
    {
        $page = $this->settings->addPage('/drafts', 'EDITOR', false, ['/api/drafts'], 7);
        $app = $this->app();
        $member = $this->iam->token(8);
        $editor = $this->iam->token(9, ['MEMBER', 'EDITOR']);
        $admin = $this->iam->token(10, ['MEMBER', 'ADMIN']);

        self::assertSame([423, 423, 200, 200], $this->statuses($app, '/api/drafts', [null, $member, $editor, $admin]));
        $this->settings->savePages([['id' => $page['id'], 'visibility' => 'ADMIN']], 7);
        self::assertSame([423, 423, 423, 200], $this->statuses($app, '/api/drafts', [null, $member, $editor, $admin]));
        $this->settings->savePages([['id' => $page['id'], 'visibility' => 'PUBLIC', 'blocked' => true]], 7);
        self::assertSame([423, 423, 423, 200], $this->statuses($app, '/api/drafts', [null, $member, $editor, $admin]), 'switched off: everybody but the administrators - never them');
        $this->settings->savePages([['id' => $page['id'], 'blocked' => false]], 7);
        self::assertSame([200, 200, 200, 200], $this->statuses($app, '/api/drafts', [null, $member, $editor, $admin]));
    }

    public function testSpelledOtherwiseThePathIsTheRoutersAndStillRefused(): void
    {
        $this->settings->addPage('/progress', 'ADMIN', false, ['/api/progress'], 7);
        $app = $this->app();

        foreach (['/%61pi/progress', '/api/%70rogress', '/api/progress/', '/api/progress/7', '/api/progressive', '/api/progress?page=/api/me'] as $path) {
            self::assertSame(423, $this->send($app, $path)->getStatusCode(), $path);
        }
    }

    public function testNoTokenOtherThanAVerifiedAdministratorsIsAWayRound(): void
    {
        $this->settings->addPage('/progress', 'ADMIN', false, ['/api/progress'], 7);
        $app = $this->app();
        $other = TestIam::create($this->folder('forger'), 'https://iam.test', 'test-site', $this->iam->kid);
        $claims = $this->iam->claims(7, ['ADMIN']);

        self::assertSame(401, $this->send($app, '/api/progress', $other->token(7, ['ADMIN']))->getStatusCode(), 'a forged token is Identify\'s 401, never through');
        self::assertSame(401, $this->send($app, '/api/progress', $this->iam->sign(['exp' => time() - 3600] + $claims))->getStatusCode());
        self::assertSame(423, $this->send($app, '/api/progress', null, ['Cookie' => 'role=ADMIN', 'X-Admin' => 'yes'])->getStatusCode());
        self::assertSame(200, $this->send($app, '/api/progress', $this->iam->token(7, ['ADMIN']))->getStatusCode());
    }

    public function testAReservedPathIsNeverRefusedWhateverARowPutInByHandSays(): void
    {
        $this->pdo->exec(
            "INSERT INTO anotoki_page_access (path, visibility, blocked, api_paths) VALUES ('/everything', 'ADMIN', TRUE, '{/api,/api/,/api/me,/api/auth/config,/api/site-status,/api/translations,/api/site-settings,/api/admin/site-settings}')",
        );
        $app = $this->app();

        foreach (['/api/me', '/api/me/x', '/api/auth/config', '/api/site-status', '/api/translations/sk', '/api/site-settings', '/api/admin/site-settings'] as $path) {
            self::assertNotSame(423, $this->send($app, $path)->getStatusCode(), $path);
        }
        self::assertSame(200, $this->send($app, '/api/characters')->getStatusCode(), 'a claim a rule refuses is passed over whole: its "/api" claims nothing');
    }

    public function testWhereTwoPagesClaimOnePathTheMoreOpenWins(): void
    {
        $daily = $this->settings->addPage('/daily', 'USER', false, ['/api/quiz'], 7);
        $quizzes = $this->settings->addPage('/quizzes', 'PUBLIC', false, ['/api/quiz'], 7);
        $app = $this->app();

        self::assertSame(200, $this->send($app, '/api/quiz')->getStatusCode(), 'switching /daily to members only takes nothing from /quizzes');
        $this->settings->savePages([['id' => $quizzes['id'], 'blocked' => true]], 7);
        self::assertSame(423, $this->send($app, '/api/quiz')->getStatusCode());
        self::assertSame(200, $this->send($app, '/api/quiz', $this->iam->token(8))->getStatusCode(), '/daily still lets members in');
        $this->settings->deletePage($daily['id']);
        self::assertSame(423, $this->send($app, '/api/quiz', $this->iam->token(8))->getStatusCode());
    }

    public function testTheSitesOwnErrorBodyAndNoGateWithoutIdentify(): void
    {
        $this->settings->addPage('/progress', 'USER', false, ['/api/progress'], 7);
        $app = $this->app(
            static fn(ResponseInterface $response, Refusal $refusal): ResponseInterface => JsonResponse::write($response, $refusal->status, ['error' => $refusal->message, 'code' => $refusal->code]),
        );
        self::assertSame(['error' => 'That part of the site is not available.', 'code' => 'page_locked'], $this->json($this->send($app, '/api/progress')), 'the site\'s shape, through its Identify');

        // A gate outside Identify would take an administrator for nobody: it says so loudly instead.
        $outside = AppFactory::create();
        $outside->get('/api/progress', static fn(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response);
        $outside->add(new PageAccessGate($this->settings, $outside->getResponseFactory()));
        $this->expectException(LogicException::class);
        $this->send($outside, '/api/progress', $this->iam->token(7, ['ADMIN']));
    }

    public function testASiteWithoutPageAccessIsNeverAskedAndAPathOutsideTheApiNever(): void
    {
        $this->pdo->exec("INSERT INTO anotoki_page_access (path, visibility, blocked, api_paths) VALUES ('/progress', 'ADMIN', TRUE, '{/api/progress}')");
        $iam = new SiteSettings(fn() => $this->pdo, [SiteSettings::ANNOUNCEMENT]);
        $app = AppFactory::create();
        $app->get('/api/progress', static fn(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response);
        $app->add(new PageAccessGate($iam, $app->getResponseFactory()));
        self::assertSame(200, $this->send($app, '/api/progress')->getStatusCode(), 'the IAM offers the announcement alone');
    }

    private function app(?\Closure $responder = null): App
    {
        $client = $this->iam->client();
        $app = AppFactory::create();
        $ok = static function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            $response->getBody()->write('{"ok":true}');

            return $response->withHeader('Content-Type', 'application/json');
        };
        foreach (
            [
                '/api/progress',
                '/api/progress/',
                '/api/progress/{id}',
                '/api/progressive',
                '/api/drafts',
                '/api/characters',
                '/api/quiz',
                '/api/me',
                '/api/me/x',
                '/api/auth/config',
                '/api/site-status',
                '/api/translations/{code}',
                '/api/site-settings',
                '/api/admin/site-settings',
            ]
            as $path
        ) {
            $app->get($path, $ok);
        }
        $app->add(new PageAccessGate($this->settings, $app->getResponseFactory()));
        $app->add(new Identify(new AccessTokens($client), new SignInRule($client), $app->getResponseFactory(), responder: $responder));

        return $app;
    }

    /**
     * @param list<?string> $tokens
     * @return list<int>
     */
    private function statuses(App $app, string $path, array $tokens): array
    {
        return array_map(fn(?string $token): int => $this->send($app, $path, $token)->getStatusCode(), $tokens);
    }

    /** @param array<string, string> $headers */
    private function send(App $app, string $path, ?string $token = null, array $headers = []): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('GET', 'https://site.example' . $path);
        if ($token !== null) {
            $request = $request->withHeader('Authorization', 'Bearer ' . $token);
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /** @return array<mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
