<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests;

use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RuntimeException;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Handlers\Strategies\RequestResponseArgs;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/** The routes on a real Slim app, driven in-process. */
final class MigrationsRoutesTest extends DatabaseTestCase
{
    private const BASE = '/api/admin/migrations';

    private MigrationSet $users;
    private MigrationSet $genshin;

    /** @var list<array{ServerRequestInterface, array<string, mixed>}> what afterApply was given */
    private array $after = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->users = $this->set('users', ['001_people.sql' => 'CREATE TABLE people (id int);']);
        $this->genshin = $this->set('genshin_impact', ['001_characters.sql' => "-- the characters\nCREATE TABLE characters (id int);"]);
    }

    public function testTheStatusSaysTheStateAndWhetherTheSiteWasInstalled(): void
    {
        $app = $this->app();

        $response = $this->request($app, 'GET', '/api/site-status');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('{"state":"update_pending","installed":false}', (string) $response->getBody());
        self::assertSame('application/json; charset=utf-8', $response->getHeaderLine('Content-Type'));
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));

        $this->migrator([$this->users, $this->genshin])->apply();
        self::assertSame(['state' => 'ready', 'installed' => false], $this->json($this->request($app, 'GET', '/api/site-status')));
    }

    public function testTheStatusPassesTheGateWhileTheSiteIsNotSetUp(): void
    {
        $state = new SiteState(fn (): ?string => 'No settings.', fn (): bool => true, fn (): Migrator => $this->sitesMigrator());
        $app = AppFactory::create();
        $app->add(new SiteGate($state, new ResponseFactory()));
        MigrationsRoutes::status($app, $state);
        MigrationsRoutes::admin($app, self::BASE, fn (): Migrator => $this->sitesMigrator());

        self::assertSame(['state' => 'not_set_up', 'installed' => true], $this->json($this->request($app, 'GET', '/api/site-status')));
        self::assertSame(503, $this->request($app, 'GET', self::BASE)->getStatusCode());
    }

    public function testTheListIsTheMigratorsStatus(): void
    {
        $this->migrator([$this->users, $this->genshin])->apply();
        $this->set('genshin_impact', ['002_weapons.sql' => 'CREATE TABLE weapons (id int);']);

        $response = $this->request($this->app(), 'GET', self::BASE);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        $list = $this->json($response);
        self::assertSame(['users', 'genshin_impact'], $list['sets']);
        self::assertSame(['users/001_people.sql', 'genshin_impact/001_characters.sql'], array_map(fn (array $file): string => $file['set'] . '/' . $file['name'], $list['applied']));
        self::assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $list['applied'][0]['applied_at']);
        self::assertSame([['set' => 'genshin_impact', 'name' => '002_weapons.sql', 'ready' => true, 'blocked' => false]], $list['pending']);
        self::assertSame([], $list['missing']);
    }

    public function testAFileIsShownOnlyWhenItIsOneOfTheSets(): void
    {
        $app = $this->app();

        $response = $this->request($app, 'GET', self::BASE . '/file?set=genshin_impact&name=001_characters.sql');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(
            ['set' => 'genshin_impact', 'name' => '001_characters.sql', 'sql' => "-- the characters\nCREATE TABLE characters (id int);"],
            $this->json($response)
        );

        foreach ([
            '/file?set=users&name=001_characters.sql',
            '/file?set=nobody&name=001_people.sql',
            '/file?set=users&name=..%2Fgenshin_impact%2F001_characters.sql',
            '/file?set=users',
            '/file?name=001_people.sql',
            '/file?set[]=users&name=001_people.sql',
            '/file',
        ] as $path) {
            $response = $this->request($app, 'GET', self::BASE . $path);
            self::assertSame(404, $response->getStatusCode(), $path);
            self::assertSame(['code' => 'not_found', 'message' => 'No such migration file.'], $this->json($response));
        }
    }

    public function testApplyAppliesAndTellsTheSite(): void
    {
        $response = $this->request($this->app(), 'POST', self::BASE . '/apply', ['X-Request-Id' => 'r1']);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame([
            'applied' => [['set' => 'users', 'name' => '001_people.sql'], ['set' => 'genshin_impact', 'name' => '001_characters.sql']],
            'failed' => null,
            'error' => null,
            'note' => null,
        ], $this->json($response));
        self::assertTrue($this->tableExists('characters'));

        self::assertCount(1, $this->after);
        [$request, $result] = $this->after[0];
        self::assertSame('r1', $request->getHeaderLine('X-Request-Id'));
        self::assertFalse($result['busy']);
        self::assertCount(2, $result['applied']);
    }

    public function testAFailedFileIsStillAnAnswerThePageShows(): void
    {
        $this->set('users', ['002_broken.sql' => 'SELECT 1/0;']);

        $response = $this->request($this->app(), 'POST', self::BASE . '/apply');

        self::assertSame(200, $response->getStatusCode());
        $body = $this->json($response);
        self::assertSame([['set' => 'users', 'name' => '001_people.sql']], $body['applied']);
        self::assertSame(['set' => 'users', 'name' => '002_broken.sql'], $body['failed']);
        self::assertStringStartsWith('statement 1 of 1: SQLSTATE[22012]', $body['error']);
        self::assertNull($body['note']);
        self::assertFalse($this->tableExists('characters'));
        self::assertCount(1, $this->after);
    }

    public function testBusyWhileAnotherUpdateRuns(): void
    {
        $other = $this->connect();
        $other->query('SELECT pg_advisory_lock(' . Migrator::DEFAULT_LOCK . ')');

        $response = $this->request($this->app(), 'POST', self::BASE . '/apply');

        self::assertSame(409, $response->getStatusCode());
        self::assertSame(
            ['code' => 'busy', 'message' => 'Another database update is running. Nothing was applied. Wait a moment, then look again.'],
            $this->json($response)
        );
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        self::assertSame([], $this->after, 'nothing happened to tell');
        self::assertFalse($this->tableExists('people'));
    }

    public function testTheSitesAdminCheckGuardsEveryRoute(): void
    {
        $app = $this->app();

        foreach ([['GET', self::BASE], ['GET', self::BASE . '/file?set=users&name=001_people.sql'], ['POST', self::BASE . '/apply']] as [$method, $path]) {
            self::assertSame(403, $this->request($app, $method, $path, [], admin: false)->getStatusCode(), $path);
        }
        self::assertFalse($this->tableExists('people'));
        self::assertSame(200, $this->request($app, 'GET', '/api/site-status', [], admin: false)->getStatusCode(), 'the status is public');
    }

    public function testTheRoutesWorkWithTheSitesOwnStrategyAndContainer(): void
    {
        $container = new class () implements ContainerInterface {
            public function get(string $id): mixed
            {
                throw new RuntimeException("No $id here.");
            }

            public function has(string $id): bool
            {
                return false;
            }
        };
        $app = AppFactory::create(null, $container);
        $app->getRouteCollector()->setDefaultInvocationStrategy(new RequestResponseArgs());
        $state = new SiteState(fn (): ?string => null, fn (): bool => false, fn (): Migrator => $this->sitesMigrator());
        MigrationsRoutes::status($app, $state);
        MigrationsRoutes::admin($app, self::BASE, fn (): Migrator => $this->sitesMigrator());

        self::assertSame('update_pending', $this->json($this->request($app, 'GET', '/api/site-status'))['state']);
        self::assertSame(['users', 'genshin_impact'], $this->json($this->request($app, 'GET', self::BASE))['sets']);
        self::assertCount(2, $this->json($this->request($app, 'POST', self::BASE . '/apply'))['applied']);
    }

    /** The site: the status, the admin routes behind its own check (a header standing for the token's ADMIN). */
    private function app(): App
    {
        $app = AppFactory::create();
        $state = new SiteState(fn (): ?string => null, fn (): bool => false, fn (): Migrator => $this->sitesMigrator());
        MigrationsRoutes::status($app, $state);
        MigrationsRoutes::admin($app, self::BASE, fn (): Migrator => $this->sitesMigrator(), function (ServerRequestInterface $request, array $result): void {
            $this->after[] = [$request, $result];
        })->add(function (ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface {
            if ($request->getHeaderLine('X-Test-Admin') !== 'yes') {
                return (new ResponseFactory())->createResponse(403);
            }

            return $handler->handle($request);
        });

        return $app;
    }

    private function sitesMigrator(): Migrator
    {
        return $this->migrator([$this->users, $this->genshin]);
    }

    /** @param array<string, string> $headers */
    private function request(App $app, string $method, string $target, array $headers = [], bool $admin = true): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://site.example' . $target);
        parse_str((string) parse_url($target, PHP_URL_QUERY), $query);
        $request = $request->withQueryParams($query);
        foreach ($headers + ($admin ? ['X-Test-Admin' => 'yes'] : []) as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /** @return array<string, mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
