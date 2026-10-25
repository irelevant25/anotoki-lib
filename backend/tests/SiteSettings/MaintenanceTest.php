<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\SiteSettings;

use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\Testing\TestIam;
use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\SiteSettings\SiteSettings;
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
 * Getting in: maintenance mode in the family's site gate and status, on a real Slim app, database and tokens - who
 * is shut out, who is never shut out, and the attacks the rules stop.
 */
final class MaintenanceTest extends DatabaseTestCase
{
    use TempFolder;

    private TestIam $iam;

    /** The paths the site keeps open while an update waits - open while it is closed too. */
    private const OPEN = ['/api/auth/config', '~^/api/admin/migrations(/file|/apply)?$~D'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->iam = TestIam::create($this->folder('iam'));
        self::assertNull($this->migrator([Schema::migrationSet()])->apply()['error']);
    }

    protected function tearDown(): void
    {
        $this->removeFolder();
        LogLines::take();
        parent::tearDown();
    }

    public function testWhileTheSiteIsOpenNothingChanges(): void
    {
        $app = $this->app();

        self::assertSame(200, $this->send($app, '/api/quiz')->getStatusCode());
        self::assertSame(['state' => 'ready', 'installed' => true], $this->json($this->send($app, '/api/site-status')), 'the status says what it always said');
    }

    public function testClosedEverybodyButTheAdministratorsIsToldSoAndTheMessageComesWithIt(): void
    {
        $settings = $this->settings();
        $settings->save(['maintenance_mode' => true, 'maintenance_message' => ['en' => 'Back at six', 'sk' => 'Späť o šiestej']], 7);
        $app = $this->app($settings);

        foreach ([null, $this->iam->token(8), $this->iam->token(9, ['MEMBER', 'EDITOR'])] as $token) {
            $refused = $this->send($app, '/api/quiz', $token);
            self::assertSame(503, $refused->getStatusCode());
            self::assertSame(
                '{"code":"maintenance","message":"The site is closed for maintenance. Try again later.","maintenance_message":{"en":"Back at six","sk":"Späť o šiestej"}}',
                (string) $refused->getBody(),
            );
            self::assertSame('300', $refused->getHeaderLine('Retry-After'));
            self::assertSame('no-store', $refused->getHeaderLine('Cache-Control'));
        }

        self::assertSame(200, $this->send($app, '/api/quiz', $this->iam->token(7, ['MEMBER', 'ADMIN']))->getStatusCode(), 'the site\'s ADMIN sees the site as it is');
        self::assertSame(200, $this->send($app, '/api/admin/settings', $this->iam->token(7, ['ADMIN']))->getStatusCode(), 'and can open it again');

        $status = $this->send($app, '/api/site-status');
        self::assertSame(200, $status->getStatusCode());
        self::assertSame('{"state":"maintenance","installed":true,"maintenance_message":{"en":"Back at six","sk":"Späť o šiestej"}}', (string) $status->getBody());
        self::assertSame(SiteState::READY, $this->state($settings)->state(), 'the database is fine: what runs while the site is ready runs on');
    }

    public function testClosedWithoutAWordTheMessageIsAnEmptyObject(): void
    {
        $settings = $this->settings();
        $settings->save(['maintenance_mode' => true], 7);
        $app = $this->app($settings);

        self::assertSame('{"state":"maintenance","installed":true,"maintenance_message":{}}', (string) $this->send($app, '/api/site-status')->getBody());
        self::assertSame('{}', json_encode($this->json($this->send($app, '/api/quiz'))['maintenance_message'] ?: new \stdClass()));
    }

    public function testTheWayInTheWordsAndTheSettingsKeepAnsweringEveryOneOfThemWhileClosed(): void
    {
        $settings = $this->settings(['/api/me']);
        $settings->save(['maintenance_mode' => true], 7);
        $app = $this->app($settings);

        foreach (
            [
                '/api/site-status', // whether the site is there at all
                '/api/me', // who the reader is - the site's own reserved path
                '/api/me/avatar', // and everything under it
                '/api/auth/config', // the sign-in's configuration: an open path
                '/api/translations/sk', // the words of the page saying so
                '/api/site-settings', // the announcement and the pages
                '/api/admin/site-settings', // the settings that would undo it - behind their own ADMIN check
                '/api/admin/migrations', // an open path while an update waits is open while closed
            ]
            as $path
        ) {
            self::assertSame(200, $this->send($app, $path)->getStatusCode(), $path);
        }
        foreach (['/api/media', '/api/menu', '/api/translationsx', '/api/admin/migrations/x', '/api/site-settingsx'] as $path) {
            self::assertSame(503, $this->send($app, $path)->getStatusCode(), "$path merely begins with the same letters");
        }
    }

    public function testNoForgedEncodedOrStaleWayPastTheClosedSign(): void
    {
        $settings = $this->settings();
        $settings->save(['maintenance_mode' => true], 7);
        $app = $this->app($settings);
        $other = TestIam::create($this->folder('forger'), 'https://iam.test', 'test-site', $this->iam->kid);
        $claims = $this->iam->claims(7, ['MEMBER', 'ADMIN']);

        foreach (
            [
                'forged: another key, the same kid' => ['Authorization' => 'Bearer ' . $other->token(7, ['ADMIN'])],
                'expired' => ['Authorization' => 'Bearer ' . $this->iam->sign(['exp' => time() - 3600] + $claims)],
                'an ID token' => ['Authorization' => 'Bearer ' . $this->iam->sign($claims, 'JWT')],
                'another client\'s' => ['Authorization' => 'Bearer ' . $this->iam->sign(['aud' => 'other-site'] + $claims)],
                'a Basic header' => ['Authorization' => 'Basic ' . base64_encode('admin:admin')],
                'a cookie' => ['Cookie' => 'anotoki_signed_in=Qm9vdHN0cmFwLWhpbnQtMTI; role=ADMIN'],
                'a header of its own' => ['X-Role' => 'ADMIN', 'X-Admin' => '1'],
            ]
            as $case => $headers
        ) {
            self::assertSame(503, $this->send($app, '/api/quiz', null, $headers)->getStatusCode(), $case);
        }

        // Spelled otherwise, the path is the router's - and refused as the router would route it.
        foreach (['/%61pi/quiz', '/api/%71uiz', '/api/quiz/', '/api/quiz?x=/api/site-status'] as $path) {
            self::assertSame(503, $this->send($app, $path)->getStatusCode(), $path);
        }
        // Under a reserved path, dot segments are no way out of it: the gate and the router read the one decoded path,
        // and the router routes it as written - to no route, never to /api/quiz.
        try {
            $this->send($app, '/api/site-settings%2F..%2F..%2Fquiz');
            self::fail('A path under a reserved one reached a route.');
        } catch (\Slim\Exception\HttpNotFoundException) {
            $this->addToAssertionCount(1);
        }
    }

    public function testAnUpdateWaitingOutranksTheClosedSignAndASiteNotSetUpIsNotSetUp(): void
    {
        $settings = $this->settings();
        $settings->save(['maintenance_mode' => true], 7);

        $pending = $this->app($settings, $this->set('site', ['001_init.sql' => 'SELECT 1;']));
        $refused = $this->send($pending, '/api/quiz', $this->iam->token(7, ['ADMIN']));
        self::assertSame([503, 'update_pending'], [$refused->getStatusCode(), $this->json($refused)['code']], 'the update first: the ADMIN goes to Migrations');
        self::assertSame(['state' => 'update_pending', 'installed' => true], $this->json($this->send($pending, '/api/site-status')));

        $notSetUp = new SiteState(fn(): string => 'no database settings', fn(): bool => false, fn(): Migrator => throw new LogicException('not asked'), settings: $settings);
        self::assertSame(['state' => 'not_set_up', 'installed' => false], $notSetUp->status());
    }

    public function testASiteThatCanBeClosedCannotBuildAGateThatShutsItsAdministratorsOut(): void
    {
        try {
            new SiteGate($this->state($this->settings()), $this->responses(), self::OPEN);
            self::fail('A gate without the ADMIN check was built.');
        } catch (LogicException $e) {
            self::assertStringContainsString('its administrators would be shut out', $e->getMessage());
        }
        // Without Getting in (the IAM), or without settings at all, there is nothing to shut anybody out of.
        new SiteGate($this->state($this->settings(parts: [SiteSettings::ANNOUNCEMENT])), $this->responses(), self::OPEN);
        new SiteGate(new SiteState(fn(): ?string => null, fn(): bool => true, fn(): Migrator => $this->migrator([])), $this->responses(), self::OPEN);
        $this->addToAssertionCount(2);
    }

    public function testAnAdministratorCheckThatFailsLetsNobodyIn(): void
    {
        $settings = $this->settings();
        $settings->save(['maintenance_mode' => true], 7);
        $gate = new SiteGate($this->state($settings), $this->responses(), [], exempt: static fn(): bool => throw new \RuntimeException('the IAM is down'));
        $app = $this->bare($gate);

        self::assertSame(503, $this->send($app, '/api/quiz', $this->iam->token(7, ['ADMIN']))->getStatusCode());

        $truthy = new SiteGate($this->state($settings), $this->responses(), [], exempt: static fn(): int => 1);
        self::assertSame(503, $this->send($this->bare($truthy), '/api/quiz')->getStatusCode(), 'only true lets somebody in');
    }

    public function testASwitchThatCannotBeReadClosesNothingAndTheIamCannotBeClosed(): void
    {
        $settings = $this->settings();
        $settings->save(['maintenance_mode' => true], 7);
        $broken = new SiteSettings(static fn(): \PDO => throw new \PDOException('gone'));
        self::assertNull($this->state($broken)->maintenance(), 'a table nobody can read never takes the site down');

        $iam = $this->settings(parts: [SiteSettings::ANNOUNCEMENT]);
        $app = $this->app($iam);
        self::assertSame(200, $this->send($app, '/api/quiz')->getStatusCode(), 'a row put in by hand closes nothing where getting in is not offered');
        self::assertSame(['state' => 'ready', 'installed' => true], $this->json($this->send($app, '/api/site-status')));
    }

    /** @param list<string> $reservedApiPaths */
    private function settings(array $reservedApiPaths = [], array $parts = SiteSettings::PARTS): SiteSettings
    {
        return new SiteSettings(fn() => $this->pdo, $parts, $reservedApiPaths);
    }

    private function state(SiteSettings $settings, ?\Anotoki\Lib\Migrations\MigrationSet $site = null): SiteState
    {
        return new SiteState(fn(): ?string => null, fn(): bool => true, fn(): Migrator => $this->migrator([Schema::migrationSet(), ...$site === null ? [] : [$site]]), settings: $settings);
    }

    private function app(?SiteSettings $settings = null, ?\Anotoki\Lib\Migrations\MigrationSet $site = null): App
    {
        $settings ??= $this->settings();
        $state = $this->state($settings, $site);
        $tokens = new AccessTokens($this->iam->client());
        $app = AppFactory::create();
        $ok = static function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            $response->getBody()->write('{"ok":true}');

            return $response->withHeader('Content-Type', 'application/json');
        };
        foreach (
            [
                '/api/quiz',
                '/api/quiz/',
                '/api/media',
                '/api/menu',
                '/api/me',
                '/api/me/avatar',
                '/api/auth/config',
                '/api/translations/{code}',
                '/api/translationsx',
                '/api/site-settings',
                '/api/site-settingsx',
                '/api/admin/site-settings',
                '/api/admin/settings',
                '/api/admin/migrations',
                '/api/admin/migrations/x',
            ]
            as $path
        ) {
            $app->get($path, $ok);
        }
        MigrationsRoutes::status($app, $state);
        $app->add(new SiteGate($state, $app->getResponseFactory(), self::OPEN, exempt: static fn(ServerRequestInterface $request): bool => $tokens->personOf($request)?->isAdmin() ?? false));

        return $app;
    }

    private function bare(SiteGate $gate): App
    {
        $app = AppFactory::create();
        $app->get('/api/quiz', static fn(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response);
        $app->add($gate);

        return $app;
    }

    private function responses(): \Psr\Http\Message\ResponseFactoryInterface
    {
        return new \Slim\Psr7\Factory\ResponseFactory();
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
