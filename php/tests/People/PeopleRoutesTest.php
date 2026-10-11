<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\People;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Audit\AuditRecorder;
use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Auth\Http\RequireRole;
use Anotoki\Lib\Auth\SignInRule;
use Anotoki\Lib\Auth\Testing\TestIam;
use Anotoki\Lib\People\Http\PeopleRoutes;
use Anotoki\Lib\People\Http\PeopleUpkeep;
use Anotoki\Lib\People\Http\RecordPerson;
use Anotoki\Lib\People\People;
use Anotoki\Lib\People\PeopleColumn;
use Anotoki\Lib\People\Schema;
use Anotoki\Lib\People\Scrubber;
use Anotoki\Lib\Support\AfterResponse;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\LogLines;
use Anotoki\Lib\Tests\Support\SiteShapes;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Interfaces\RouteCollectorProxyInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

/** The People API on a real Slim app (Piano Academy's shape), recording on the site's routes, and the upkeep after the answer. */
final class PeopleRoutesTest extends DatabaseTestCase
{
    private const BASE = '/api/admin/people';

    private TestIam $iam;
    private People $people;

    /** @var list<int> whom the site's delete hook was asked to delete */
    private array $deleted = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->iam = TestIam::create($this->path('iam'), 'https://iam.test', 'piano-academy');
        $this->iam->signInRule(true);
        SiteShapes::create($this->pdo, 'piano');
        self::assertNull($this->migrator([$this->set('site'), Schema::migrationSet()])->apply()['error']);
        $this->people = new People(SiteShapes::table('piano'), fn (): PDO => $this->pdo, $this->iam->client());
    }

    protected function tearDown(): void
    {
        AfterResponse::shared()->clear();
        LogLines::take();
        parent::tearDown();
    }

    public function testTheListNewestSeenFirstWithTheSitesColumns(): void
    {
        $this->person(7, 'alice', '2 days');
        $this->person(8, 'Bob', '1 hour');
        $this->person(9, null, '3 days');
        $this->pdo->exec("UPDATE users SET anonymized_at = '2026-11-06T10:00:00Z', preferred_username = 'deleted-9' WHERE id = 9");
        $this->pdo->exec("INSERT INTO progress (user_id, notes) VALUES (7, '{\"60\": {}, \"61\": {}}')");
        SiteShapes::visitor($this->pdo, 'piano', -1);

        $response = $this->send('GET', self::BASE, $this->admin());

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        $body = $this->json($response);
        self::assertSame(['8', '7', '9'], array_column($body['people'], 'sub'), 'newest seen first; a visitor is no person');
        self::assertSame(['Bob', 'alice', 'deleted-9'], array_column($body['people'], 'name'));
        self::assertSame([null, null, '2026-11-06T10:00:00Z'], array_column($body['people'], 'anonymized_at'));
        self::assertSame(['https://iam.test/admin/users/8', 'https://iam.test/admin/users/7', 'https://iam.test/admin/users/9'], array_column($body['people'], 'iam_url'));
        self::assertSame([null, 2, null], array_column($body['people'], 'notes'));
        self::assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $body['people'][0]['last_seen_at']);
        self::assertSame([['key' => 'notes', 'label' => 'Notes', 'kind' => 'count']], $body['columns']);
        self::assertSame([3, 1, 50], [$body['total'], $body['page'], $body['page_size']]);
        self::assertSame(['count' => 1], $body['visitors']);
        self::assertSame(['since' => null, 'checked_at' => null, 'ok_at' => null, 'error' => null, 'scrubbed' => 0], $body['sync']);
        self::assertSame([true, []], [$body['ready'], $body['problems']]);
    }

    public function testSearchingAndPaging(): void
    {
        foreach (range(1, 55) as $sub) {
            $this->person($sub, "person $sub", "$sub minutes");
        }
        $this->person(1000, 'Ľudmila Nováková', '1 year');

        $first = $this->json($this->send('GET', self::BASE, $this->admin()));
        self::assertSame([56, 50], [$first['total'], count($first['people'])]);
        self::assertSame('1', $first['people'][0]['sub'], 'seen a minute ago');
        $second = $this->json($this->send('GET', self::BASE . '?page=2', $this->admin()));
        self::assertSame(['51', '52', '53', '54', '55', '1000'], array_column($second['people'], 'sub'));
        self::assertSame([], $this->json($this->send('GET', self::BASE . '?page=9', $this->admin()))['people']);

        self::assertSame(['1000'], array_column($this->json($this->send('GET', self::BASE . '?q=' . rawurlencode('ľudmila'), $this->admin()))['people'], 'sub'), 'any case, anywhere in the name');
        $fives = $this->json($this->send('GET', self::BASE . '?q=5', $this->admin()));
        self::assertSame(11, $fives['total'], 'person 5, 15, 25, 35, 45, 50 to 55 - and id 5 among them');
        self::assertSame([], array_filter(array_column($fives['people'], 'name'), static fn (string $name): bool => !str_contains($name, '5')));
        $byId = array_column($this->json($this->send('GET', self::BASE . '?q=1000', $this->admin()))['people'], 'sub');
        self::assertSame(['1000'], $byId, 'an id');
        self::assertSame([], $this->json($this->send('GET', self::BASE . '?q=' . rawurlencode("' OR 1=1 --"), $this->admin()))['people']);
        self::assertSame(422, $this->send('GET', self::BASE . '?q=' . str_repeat('a', 201), $this->admin())->getStatusCode());
        self::assertSame(1, $this->json($this->send('GET', self::BASE . '?page=-3', $this->admin()))['page'], 'a page that is none is the first');
    }

    public function testDeletingIsTheSitesAndTheScrubCanBeAskedNow(): void
    {
        $this->person(7, 'alice', '1 hour');
        $this->iam->anonymized(['7' => '2026-11-06T10:00:00Z']);

        $deleted = $this->send('DELETE', self::BASE . '/7', $this->admin());
        self::assertSame(200, $deleted->getStatusCode());
        self::assertSame(['deleted' => ['Progress' => 0], 'note' => 'Their row stays: the IAM keeps the person.'], $this->json($deleted));
        self::assertSame([7], $this->deleted);
        foreach (['/8', '/0', '/-7', '/abc', '/1234567890123456789'] as $path) {
            $response = $this->send('DELETE', self::BASE . $path, $this->admin());
            self::assertSame(404, $response->getStatusCode(), $path);
            self::assertSame(['code' => 'not_found', 'message' => 'There is nobody with that id here.'], $this->json($response), $path);
        }
        self::assertSame([7, 8], $this->deleted, 'the hook decides who is there; a path that is no id never reaches it');

        $sync = $this->json($this->send('POST', self::BASE . '/sync', $this->admin()));
        self::assertSame('done', $sync['run']['state']);
        self::assertSame(1, $sync['sync']['scrubbed']);
        self::assertSame('deleted-7', $this->value('SELECT preferred_username FROM users WHERE id = 7'));
    }

    public function testOnlyTheSitesAdmin(): void
    {
        self::assertSame(401, $this->send('GET', self::BASE)->getStatusCode());
        self::assertSame(403, $this->send('GET', self::BASE, $this->iam->token(7, ['MEMBER', 'EDITOR']))->getStatusCode());
        self::assertSame(403, $this->send('POST', self::BASE . '/sync', $this->iam->token(7, ['MEMBER', 'EDITOR']))->getStatusCode());
        self::assertSame([], $this->deleted);
    }

    public function testTheGroupGuardsItselfWhereTheSiteForgotItsCheckOrLetsEditorsIn(): void
    {
        $this->person(7, 'alice', '1 hour');
        $this->iam->anonymized(['7' => '2026-11-06T10:00:00Z']);
        $routes = [['GET', self::BASE], ['DELETE', self::BASE . '/7'], ['POST', self::BASE . '/sync']];

        foreach (['no check of the site\'s' => $this->app(siteCheck: null), 'inside a group for ADMIN and EDITOR' => $this->app(siteCheck: null, inStaffGroup: true)] as $case => $app) {
            foreach ($routes as [$method, $path]) {
                $nobody = $this->sendTo($app, $method, $path);
                self::assertSame(401, $nobody->getStatusCode(), "$case: $method $path, no token");
                self::assertSame('sign_in_required', $this->json($nobody)['code'], "$case: $method $path");
                foreach (['a MEMBER' => ['MEMBER'], 'an EDITOR' => ['MEMBER', 'EDITOR']] as $who => $roles) {
                    $refused = $this->sendTo($app, $method, $path, $this->iam->token(9, $roles));
                    self::assertSame(403, $refused->getStatusCode(), "$case: $method $path, $who");
                    self::assertSame('forbidden', $this->json($refused)['code'], "$case: $method $path, $who");
                }
                // The EDITOR the site's group let in is refused by the group's own check.
                self::assertSame(
                    ['code' => 'forbidden', 'message' => 'Only an administrator of this site may do this.'],
                    $this->json($this->sendTo($app, $method, $path, $this->iam->token(9, ['MEMBER', 'EDITOR']))),
                    "$case: $method $path",
                );
            }
            self::assertSame([], $this->deleted, "$case: the delete hook is never asked");
            self::assertSame('alice', $this->value('SELECT preferred_username FROM users WHERE id = 7'), "$case: nobody else's scrub runs");
            self::assertNull(Scrubber::status($this->pdo)['checked_at'], $case);

            self::assertSame(200, $this->sendTo($app, 'GET', self::BASE, $this->admin())->getStatusCode(), "$case: the ADMIN");
        }

        // A site's own check still answers first, in its own words.
        $own = $this->app(siteCheck: RequireRole::admin()->refusing('admin_only', 'For administrators.'));
        self::assertSame(['code' => 'admin_only', 'message' => 'For administrators.'], $this->json($this->sendTo($own, 'DELETE', self::BASE . '/7', $this->iam->token(9, ['MEMBER', 'EDITOR']))));
        self::assertSame([], $this->deleted);
    }

    public function testADeleteAndAnAskedForScrubAreAudited(): void
    {
        $this->person(7, 'alice', '1 hour');
        $this->iam->anonymized(['7' => '2026-11-06T10:00:00Z']);
        $audit = new class () implements AuditRecorder {
            /** @var list<array{int|string|null, string, ?string, int|string|null, array<string, mixed>}> */
            public array $entries = [];

            public function record(?ServerRequestInterface $request, int|string|null $actorId, string $action, ?string $targetType = null, int|string|null $targetId = null, array $details = [], ?array $scope = null, ?string $session = null): void
            {
                $this->entries[] = [$actorId, $action, $targetType, $targetId, $details];
            }
        };

        $app = $this->app(audit: $audit);
        self::assertSame(404, $this->sendTo($app, 'DELETE', self::BASE . '/8', $this->admin())->getStatusCode());
        self::assertSame(200, $this->sendTo($app, 'DELETE', self::BASE . '/7', $this->admin())->getStatusCode());
        self::assertSame(200, $this->sendTo($app, 'POST', self::BASE . '/sync', $this->admin())->getStatusCode());
        self::assertSame([
            [1, 'person.data_deleted', 'user', '7', ['deleted' => ['Progress' => 0]]],
            [1, 'people.synced', null, null, ['state' => 'done', 'handled' => 1, 'scrubbed' => 1]],
        ], $audit->entries, 'who acted - the token\'s sub - and what went; nobody found is nothing done');

        // The site's AdminContext names who acts, where it gives one.
        $audit->entries = [];
        $withContext = $this->app(audit: $audit, context: new AdminContext(static fn (): string => 'admin-1'));
        $this->sendTo($withContext, 'POST', self::BASE . '/sync', $this->admin());
        self::assertSame('admin-1', $audit->entries[0][0]);
        self::assertSame('people.synced', $audit->entries[0][1]);
    }

    public function testASearchThatIsNoTextIsRefusedNotAnError(): void
    {
        $this->person(7, 'alice', '1 hour');

        foreach (['not UTF-8' => "\xC3\x28", 'cut in a character' => "Ľ\xC5", 'a NUL inside' => "ali\0ce"] as $case => $search) {
            $response = $this->send('GET', self::BASE . '?q=' . rawurlencode($search), $this->admin());
            self::assertSame(422, $response->getStatusCode(), $case);
            self::assertSame(['code' => 'invalid_query', 'message' => 'That search is not text a name could hold.'], $this->json($response), $case);
        }
        self::assertSame(['7'], array_column($this->json($this->send('GET', self::BASE . '?q=' . rawurlencode("\0ALI "), $this->admin()))['people'], 'sub'), 'a NUL at an end is trimmed, as a space is');
    }

    public function testWithoutTheTableOrTheColumn(): void
    {
        $this->pdo->exec('ALTER TABLE users DROP COLUMN anonymized_at');
        $body = $this->json($this->send('GET', self::BASE, $this->admin()));
        self::assertSame([false, ['users has no column anonymized_at yet: the site\'s own migration adds it.']], [$body['ready'], $body['problems']]);

        $this->pdo->exec('DROP TABLE users CASCADE');
        $this->people->table->forget();
        $response = $this->send('GET', self::BASE, $this->admin());
        self::assertSame(503, $response->getStatusCode());
        self::assertSame('60', $response->getHeaderLine('Retry-After'));
        self::assertSame('people_unavailable', $this->json($response)['code']);
    }

    public function testThePersonIsRecordedOnTheSitesRoutes(): void
    {
        $app = $this->app();

        $this->sendTo($app, 'GET', '/api/progress', $this->iam->token(42, ['MEMBER'], ['preferred_username' => 'zoe']));
        self::assertSame('zoe', $this->value('SELECT preferred_username FROM users WHERE id = 42'));
        $this->sendTo($app, 'GET', '/api/admin/migrations', $this->iam->token(43, ['ADMIN']));
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM users WHERE id = 43'), 'never on the Migrations routes');
        $this->sendTo($app, 'GET', '/api/progress');
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM users WHERE id > 0'), 'nobody is nobody\'s row');
    }

    public function testTheScrubRunsAfterTheAnswerAtMostHourly(): void
    {
        $this->person(7, 'alice', '1 hour');
        $this->iam->anonymized(['7' => '2026-11-06T10:00:00Z']);
        $ready = true;
        $upkeep = new PeopleUpkeep($this->people, function () use (&$ready): bool {
            return $ready;
        });
        $stamp = $this->iam->dir . '/cache/' . PeopleUpkeep::STAMP;

        $ready = false;
        self::assertFalse($upkeep->soon(), 'not while the site is not ready');
        self::assertFileDoesNotExist($stamp);

        $ready = true;
        self::assertTrue($upkeep->soon());
        self::assertFileExists($stamp, 'the hour claimed before the work');
        self::assertSame(1, AfterResponse::shared()->pending());
        self::assertSame('alice', $this->value('SELECT preferred_username FROM users WHERE id = 7'), 'nothing before the answer');
        self::assertFalse($upkeep->soon(), 'the hour is taken');
        AfterResponse::shared()->run();
        self::assertSame('deleted-7', $this->value('SELECT preferred_username FROM users WHERE id = 7'));

        touch($stamp, time() - 3601);
        self::assertTrue($upkeep->soon(), 'an hour later');
        AfterResponse::shared()->clear();

        // A stamp later than now - a clock set back - holds nothing off.
        touch($stamp, time() + 7200);
        self::assertTrue($upkeep->soon(), 'a stamp from the future is none');
        self::assertFalse($upkeep->soon(), 'and the hour is claimed anew');
        AfterResponse::shared()->clear();

        $app = $this->app(upkeep: $upkeep);
        touch($stamp, time() - 3601);
        self::assertSame(200, $this->sendTo($app, 'GET', '/api/progress', $this->iam->token(8))->getStatusCode());
        self::assertSame(1, AfterResponse::shared()->pending(), 'ordinary traffic carries it');

        // A site's own runner, given as `defer`, gets the work instead.
        AfterResponse::shared()->clear();
        $own = [];
        $withOwn = new PeopleUpkeep($this->people, static fn (): bool => true, function (callable $work) use (&$own): void {
            $own[] = $work;
        });
        touch($stamp, time() - 3601);
        self::assertTrue($withOwn->soon());
        self::assertCount(1, $own);
        self::assertSame(0, AfterResponse::shared()->pending());

        $noCache = new People(SiteShapes::table('piano'), fn (): PDO => $this->pdo, $this->iam->client(['cache_dir' => null]));
        self::assertFalse((new PeopleUpkeep($noCache, static fn (): bool => true))->soon(), 'no cache folder, no stamp, no run');
    }

    public function testAPieceOfWorkAfterTheAnswerThatFailsStopsNothing(): void
    {
        $done = [];
        $after = AfterResponse::shared();
        $after->defer(static function (): void {
            throw new \RuntimeException('a sweep failed');
        });
        $after->defer(static function () use (&$done): void {
            $done[] = 'the next';
        });

        $after->run();

        self::assertSame(['the next'], $done);
        self::assertSame(['[anotoki] after the answer: RuntimeException: a sweep failed'], LogLines::take());
        self::assertSame(0, $after->pending());

        // What the log is told is redacted: a message that holds an address or a token says neither.
        $after->defer(static function (): void {
            throw new \RuntimeException('no answer for alice@example.test from 203.0.113.7');
        });
        $after->run();
        self::assertSame(['[anotoki] after the answer: RuntimeException: no answer for {email} from {ip}'], LogLines::take());
    }

    /**
     * The site: Identify, its routes recording the person, the Migrations route not, the People API for its ADMIN.
     *
     * @param ?RequireRole $siteCheck  the site's own check on the group (none: the group's own alone)
     * @param bool $inStaffGroup  mounted inside the site's admin group, which lets EDITORs in
     */
    private function app(?PeopleUpkeep $upkeep = null, ?RequireRole $siteCheck = new RequireRole(['ADMIN']), bool $inStaffGroup = false, ?AuditRecorder $audit = null, ?AdminContext $context = null): App
    {
        $app = AppFactory::create();
        $client = $this->iam->client();
        $echo = static function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            $response->getBody()->write('{}');

            return $response;
        };
        $app->group('/api', function ($group) use ($echo): void {
            $group->get('/progress', $echo);
        })->add(new RecordPerson($this->people));
        $app->get('/api/admin/migrations', $echo)->add(RequireRole::admin());
        $mount = function (RouteCollectorProxyInterface $where, string $base) use ($siteCheck, $audit, $context): void {
            $group = PeopleRoutes::admin(
                $where,
                $base,
                $this->people,
                columns: [new PeopleColumn('notes', 'Notes', 'count', static fn (PDO $pdo, array $subs): array => $pdo->query(
                    'SELECT user_id, (SELECT count(*) FROM jsonb_object_keys(notes)) FROM progress WHERE user_id IN (' . implode(',', array_map('intval', $subs)) . ')'
                )->fetchAll(PDO::FETCH_KEY_PAIR))],
                visitors: static fn (PDO $pdo): array => ['count' => (int) $pdo->query('SELECT count(*) FROM users WHERE id < 0')->fetchColumn()],
                delete: function (PDO $pdo, int $sub): ?array {
                    $this->deleted[] = $sub;
                    $known = (bool) $pdo->query("SELECT count(*) FROM users WHERE id = $sub")->fetchColumn();
                    if (!$known) {
                        return null;
                    }
                    $progress = $pdo->exec("DELETE FROM progress WHERE user_id = $sub");

                    return ['deleted' => ['Progress' => $progress], 'note' => 'Their row stays: the IAM keeps the person.'];
                },
                error: static function (ResponseInterface $response, Refusal $refusal): ResponseInterface {
                    $response->getBody()->write((string) json_encode($refusal->body()));

                    return $response->withHeader('Content-Type', 'application/json');
                },
                audit: $audit,
                context: $context,
            );
            if ($siteCheck !== null) {
                $group->add($siteCheck);
            }
        };
        if ($inStaffGroup) {
            $app->group('/api/admin', function (RouteCollectorProxyInterface $admin) use ($mount): void {
                $mount($admin, substr(self::BASE, strlen('/api/admin')));
            })->add(RequireRole::any('ADMIN', 'EDITOR'));
        } else {
            $mount($app, self::BASE);
        }
        if ($upkeep !== null) {
            $app->add($upkeep);
        }
        $app->add(new Identify(new AccessTokens($client), new SignInRule($client), $app->getResponseFactory()));

        return $app;
    }

    private function admin(): string
    {
        return $this->iam->token(1, ['MEMBER', 'ADMIN']);
    }

    private function person(int $sub, ?string $name, string $seenAgo): void
    {
        $this->pdo->prepare("INSERT INTO users (id, preferred_username, last_seen_at, created_at) VALUES (?, ?, now() - CAST(? AS interval), now() - interval '1 year')")
            ->execute([$sub, $name, $seenAgo]);
    }

    private function send(string $method, string $path, ?string $token = null): ResponseInterface
    {
        return $this->sendTo($this->app(), $method, $path, $token);
    }

    private function sendTo(App $app, string $method, string $path, ?string $token = null): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path);
        parse_str((string) parse_url($path, PHP_URL_QUERY), $query);
        $request = $request->withQueryParams($query);
        if ($token !== null) {
            $request = $request->withHeader('Authorization', 'Bearer ' . $token);
        }

        return $app->handle($request);
    }

    /** @return array<string, mixed> */
    private function json(ResponseInterface $response): array
    {
        $body = json_decode((string) $response->getBody(), true);
        self::assertIsArray($body, (string) $response->getBody());

        return $body;
    }
}
