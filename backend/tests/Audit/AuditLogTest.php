<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Audit;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Audit\AuditContextMiddleware;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Audit\Http\AuditRoutes;
use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\LogLines;
use LogicException;
use PDO;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RuntimeException;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/** The audit log against a real database: written whatever happens, read with every filter, scrubbed as the IAM scrubs. */
final class AuditLogTest extends DatabaseTestCase
{
    /** @var list<string> */
    private array $errors = [];

    public function testAnEntryKeepsWhatTheSiteGivesIt(): void
    {
        $this->applyAdminSet();
        $audit = $this->audit(['recordAddress' => true, 'address' => static fn(ServerRequestInterface $request): string => $request->getHeaderLine('CF-Connecting-IP')]);

        $audit->record($this->request(), 42, 'user.roles_set', 'user', 7, ['roles' => ['ADMIN'], 'name' => 'Ana'], ['application', 'genshin'], 'session-1');

        $row = $this->rows('SELECT actor_id, actor_session, action, target_type, target_id, scope_type, scope_id, details, ip FROM anotoki_audit_log')[0];
        self::assertSame(
            [42, 'session-1', 'user.roles_set', 'user', '7', 'application', 'genshin', '198.51.100.20'],
            [$row['actor_id'], $row['actor_session'], $row['action'], $row['target_type'], $row['target_id'], $row['scope_type'], $row['scope_id'], $row['ip']],
        );
        self::assertSame(['name' => 'Ana', 'roles' => ['ADMIN']], json_decode($row['details'], true));

        $site = $this->audit();
        $site->record($this->request(), '1234', 'content.update', 'characters', 3);
        $row = $this->rows("SELECT actor_id, ip, details FROM anotoki_audit_log WHERE action = 'content.update'")[0];
        self::assertSame([1234, null, null], [$row['actor_id'], $row['ip'], $row['details']], 'a site keeps no address unless it says so; an IAM sub as text is an id');
    }

    public function testTheAddressKeptIsTheVisitorsOnlyThroughTheOwnersZone(): void
    {
        $this->applyAdminSet();
        $secret = str_repeat('zone-secret-', 4);
        $audit = $this->audit(['recordAddress' => true, 'trustedProxies' => ['10.0.0.0/8'], 'originSecret' => $secret]);

        $audit->record($this->request(), 1, 'user.signed_in', 'user', 1);
        $audit->record($this->request()->withHeader('X-Anotoki-Origin', $secret), 1, 'user.signed_out', 'user', 1);

        self::assertSame(
            ['user.signed_in' => '10.0.0.1', 'user.signed_out' => '198.51.100.20'],
            array_column($this->rows("SELECT action, ip FROM anotoki_audit_log WHERE action LIKE 'user.%'"), 'ip', 'action'),
            'without the zone\'s secret the proxy\'s own address; with it the visitor\'s',
        );
    }

    public function testWithoutAnOnErrorWhyAnEntryWasNotWrittenIsTheLibrarysLogLine(): void
    {
        LogLines::take();
        $audit = new AuditLog(fn(): PDO => $this->pdo);

        $audit->record(null, 1, 'Not An Action', 'thing', 1);

        self::assertSame(['[audit] not recorded: "Not An Action" is no action name (area.verb, small letters)'], LogLines::take());
    }

    public function testAFailedEntryNeverUndoesTheChangeItRecords(): void
    {
        $this->applyAdminSet();
        $this->pdo->exec('CREATE TABLE things (id INT PRIMARY KEY)');
        // A table that refuses one entry, as a database may refuse anything.
        $this->pdo->exec("ALTER TABLE anotoki_audit_log ADD CONSTRAINT test_refuses CHECK (action <> 'thing.refused')");
        $audit = $this->audit();

        $this->pdo->beginTransaction();
        $this->pdo->exec('INSERT INTO things VALUES (1)');
        $audit->record(null, 1, 'thing.refused', 'thing', 1);
        $this->pdo->exec('INSERT INTO things VALUES (2)');
        $audit->record(null, 1, 'thing.created', 'thing', 2);
        $this->pdo->commit();

        self::assertSame([1, 2], array_map('intval', $this->pdo->query('SELECT id FROM things ORDER BY id')->fetchAll(PDO::FETCH_COLUMN)));
        self::assertSame(['thing.created'], $this->pdo->query('SELECT action FROM anotoki_audit_log')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame(['[audit] an entry could not be written (SQLSTATE 23514).'], $this->errors, 'a fixed sentence and a code: never the entry, nor the database\'s words');

        $audit->record(null, 1, 'Not An Action');
        self::assertStringContainsString('no action name', $this->errors[1]);
    }

    public function testAnEntryThatMustBeThereIsWrittenInsideItsChangesTransactionOrThrown(): void
    {
        $pending = $this->path('storage/logs/audit-pending.jsonl');
        $audit = $this->audit(['pendingFile' => $pending, 'recordAddress' => true, 'address' => static fn(ServerRequestInterface $request): string => $request->getHeaderLine('CF-Connecting-IP')]);

        try {
            $audit->recordInside($this->pdo, null, 1, 'person.data_deleted', 'user', 7);
            self::fail('written outside a transaction');
        } catch (LogicException $e) {
            self::assertStringContainsString('inside the transaction of the change it records', $e->getMessage());
        }
        // While the table waits it is thrown - never left in the file, its change made without it.
        $this->pdo->beginTransaction();
        try {
            $audit->recordInside($this->pdo, null, 1, 'person.data_deleted', 'user', 7);
            self::fail('an entry that must be there waited in the file');
        } catch (RuntimeException $e) {
            self::assertStringContainsString('The audit log is not there yet', $e->getMessage());
        } finally {
            $this->pdo->rollBack();
        }
        self::assertFileDoesNotExist($pending);

        $this->applyAdminSet();
        $this->pdo->exec('CREATE TABLE things (id INT PRIMARY KEY)');
        $this->pdo->beginTransaction();
        $this->pdo->exec('INSERT INTO things VALUES (1)');
        $transaction = (string) $this->value('SELECT txid_current()');
        $audit->recordInside($this->pdo, $this->request(), 42, 'person.data_deleted', 'user', 7, ['deleted' => ['Progress' => 1]]);
        self::assertTrue((bool) $this->value('SELECT created_at = now() FROM anotoki_audit_log'), 'its time is its transaction\'s: when it began');
        $this->pdo->commit();
        $row = $this->rows('SELECT actor_id, action, target_type, target_id, details, ip FROM anotoki_audit_log')[0];
        self::assertSame([42, 'person.data_deleted', 'user', '7', '198.51.100.20'], [$row['actor_id'], $row['action'], $row['target_type'], $row['target_id'], $row['ip']]);
        $details = json_decode((string) $row['details'], true);
        self::assertSame(['Progress' => 1], $details['deleted']);
        self::assertSame($transaction, $details['_txid'], 'it names the transaction it was written in');

        // Rolled back with its change: neither is there.
        $this->pdo->beginTransaction();
        $this->pdo->exec('INSERT INTO things VALUES (2)');
        $audit->recordInside($this->pdo, null, 1, 'person.data_deleted', 'user', 8);
        $this->pdo->rollBack();
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM anotoki_audit_log'));
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM things'));

        // An entry the table refuses is thrown as it is: the caller's change fails with it.
        $this->pdo->exec("ALTER TABLE anotoki_audit_log ADD CONSTRAINT test_refuses CHECK (target_id <> '9')");
        $this->pdo->beginTransaction();
        try {
            $audit->recordInside($this->pdo, null, 1, 'person.data_deleted', 'user', 9);
            self::fail('a refused entry passed');
        } catch (PDOException $e) {
            self::assertSame('23514', (string) $e->getCode());
        } finally {
            $this->pdo->rollBack();
        }

        // Details past their limit are cut - and still name their transaction.
        $this->pdo->beginTransaction();
        $audit->recordInside($this->pdo, null, 1, 'person.data_deleted', 'user', 10, ['note' => str_repeat('x', 70000)]);
        $this->pdo->commit();
        $details = json_decode((string) $this->value("SELECT details FROM anotoki_audit_log WHERE target_id = '10'"), true);
        self::assertTrue($details['_cut']);
        self::assertMatchesRegularExpression('/^[0-9]+$/D', $details['_txid']);
        self::assertSame([], $this->errors, 'nothing said to onError: the caller is told');
        self::assertFileDoesNotExist($pending);
    }

    public function testEntriesWaitWhileTheTableIsMissingAndGoInAfterApply(): void
    {
        $pending = $this->path('storage/logs/audit-pending.jsonl');
        $audit = $this->audit(['pendingFile' => $pending]);

        $audit->record($this->request(), 5, 'translations.saved', null, null, ['count' => 3]);
        $audit->record(null, null, 'migrations.applied');
        self::assertCount(2, file($pending, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: []);
        self::assertFileExists($this->path('storage/logs/.htaccess'));
        self::assertSame(0, $audit->flushPending(), 'still no table');
        self::assertFalse($audit->ready());

        $app = AppFactory::create();
        MigrationsRoutes::admin($app, '/api/admin/migrations', fn(): Migrator => $this->migrator([Schema::migrationSet()]), static function () use ($audit): void {
            $audit->flushPending();
        });
        $apply = $app->handle((new ServerRequestFactory())->createServerRequest('POST', 'https://site.example/api/admin/migrations/apply'));
        self::assertSame(200, $apply->getStatusCode());

        self::assertTrue($audit->ready());
        $rows = $this->rows('SELECT actor_id, action, details, created_at < now() AS earlier FROM anotoki_audit_log ORDER BY id');
        self::assertSame(['translations.saved', 'migrations.applied'], array_column($rows, 'action'));
        self::assertSame([5, null], array_column($rows, 'actor_id'));
        self::assertSame(['count' => 3], json_decode((string) $rows[0]['details'], true));
        self::assertTrue($rows[0]['earlier'], 'with the time it was recorded');
        self::assertSame('', file_get_contents($pending), 'put in, and the file emptied');
        self::assertSame([], $this->errors);
    }

    public function testAFlushKilledAfterItsCommitPutsNothingInTwice(): void
    {
        $this->applyAdminSet();
        $pending = $this->path('logs/audit-pending.jsonl');
        mkdir(dirname($pending), 0777, true);
        $lines = [
            ['created_at' => '2026-10-07T10:00:00.123456Z', 'actor_id' => 3, 'action' => 'first.entry', 'target_type' => 'user', 'target_id' => '9', 'details' => null],
            ['created_at' => '2026-10-07T10:00:01.000001Z', 'actor_id' => null, 'action' => 'second.entry', 'details' => '{"n":2}'],
        ];
        // A flush put both in and committed - and its process was killed before it emptied the file.
        file_put_contents($pending, implode("\n", array_map('json_encode', $lines)) . "\n");
        $audit = $this->audit(['pendingFile' => $pending]);
        foreach ($lines as $line) {
            $this->pdo
                ->prepare('INSERT INTO anotoki_audit_log (created_at, actor_id, action, target_type, target_id, details) VALUES (CAST(? AS timestamptz), ?, ?, ?, ?, CAST(? AS jsonb))')
                ->execute([$line['created_at'], $line['actor_id'], $line['action'], $line['target_type'] ?? null, $line['target_id'] ?? null, $line['details']]);
        }
        // Meanwhile a new entry waits after them.
        file_put_contents($pending, json_encode(['created_at' => '2026-10-07T10:05:00.000000Z', 'actor_id' => 4, 'action' => 'third.entry', 'details' => null]) . "\n", FILE_APPEND);

        self::assertSame(1, $audit->flushPending(), 'the two in already go in no second time; the new one goes in');
        self::assertSame(['first.entry', 'second.entry', 'third.entry'], $this->pdo->query('SELECT action FROM anotoki_audit_log ORDER BY created_at')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame('', file_get_contents($pending));
        self::assertSame(0, $audit->flushPending());
    }

    public function testAnEntryWrittenWhileAFlushRunsIsNeverLost(): void
    {
        $this->applyAdminSet();
        $pending = $this->path('logs/audit-pending.jsonl');
        mkdir(dirname($pending), 0777, true);
        file_put_contents($pending, json_encode(['created_at' => '2026-10-07T10:00:00.000000Z', 'actor_id' => 3, 'action' => 'first.entry', 'details' => null]) . "\n");
        $audit = $this->audit(['pendingFile' => $pending]);

        // A request opened the file to append to it just before the flush took its lock (keepPending: open, lock,
        // write) - it waits, and writes once the flush is done.
        $writer = fopen($pending, 'ab');
        self::assertIsResource($writer);
        self::assertSame(1, $audit->flushPending());
        flock($writer, LOCK_EX);
        fwrite($writer, json_encode(['created_at' => '2026-10-07T10:00:05.000000Z', 'actor_id' => 4, 'action' => 'late.entry', 'details' => null]) . "\n");
        flock($writer, LOCK_UN);
        fclose($writer);

        self::assertSame(1, $audit->flushPending(), 'written into the file the flush keeps - never into one set aside and gone');
        self::assertSame(['first.entry', 'late.entry'], $this->pdo->query('SELECT action FROM anotoki_audit_log ORDER BY created_at')->fetchAll(PDO::FETCH_COLUMN));
    }

    public function testAnEntryThatCameLateGoesInWithTheNextOneOutsideATransaction(): void
    {
        $this->applyAdminSet();
        $pending = $this->path('logs/audit-pending.jsonl');
        mkdir(dirname($pending), 0777, true);
        file_put_contents($pending, json_encode(['created_at' => '2026-10-07T10:00:00.000000Z', 'actor_id' => 3, 'action' => 'late.entry', 'details' => null]) . "\n");
        $audit = $this->audit(['pendingFile' => $pending]);

        $audit->record(null, 4, 'next.entry');

        self::assertSame(['late.entry', 'next.entry'], $this->pdo->query('SELECT action FROM anotoki_audit_log ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame('', file_get_contents($pending));
    }

    public function testTheSiteMayKeepEntriesWaitingWhileItsOwnMoveIsPending(): void
    {
        $this->applyAdminSet();
        $moved = false;
        $pending = $this->path('audit-pending.jsonl');
        $audit = $this->audit([
            'pendingFile' => $pending,
            'ready' => static function () use (&$moved): bool {
                return $moved;
            },
        ]);

        $audit->record(null, 1, 'account.created');
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM anotoki_audit_log'), 'the IAM\'s 017 has not moved its rows yet');
        $moved = true;
        self::assertSame(1, $audit->flushPending());
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM anotoki_audit_log'));
    }

    public function testFiltersPagesAndFacets(): void
    {
        $this->applyAdminSet();
        $this->pdo->exec("INSERT INTO anotoki_audit_log (created_at, actor_id, action, target_type, target_id, scope_type, scope_id) VALUES
            ('2026-10-01T10:00:00Z', 1, 'account.created', 'user', '1', NULL, NULL),
            ('2026-10-02T10:00:00Z', 1, 'account.password_set', 'user', '1', NULL, NULL),
            ('2026-10-03T10:00:00Z', 2, 'content.update', 'talents', '9', 'characters', '42'),
            ('2026-10-04T10:00:00Z', 2, 'content.insert', 'characters', '42', 'characters', '42'),
            ('2026-10-05T10:00:00Z', NULL, 'catalogue.reconcile', 'files', 'sweep', NULL, NULL),
            ('2026-10-06T10:00:00Z', 3, 'accountx.created', 'user', '3', NULL, NULL)");
        $audit = $this->audit(['actorIds' => static fn(string $name): array => $name === 'ana' ? [1] : []]);

        $all = $audit->page();
        self::assertSame([6, 1, 50], [$all['total'], $all['page'], $all['pageSize']]);
        self::assertSame('accountx.created', $all['items'][0]['action'], 'newest first');
        self::assertSame('2026-10-06T10:00:00.000Z', $all['items'][0]['created_at']);
        self::assertSame(2, $audit->page(['actor' => '1'])['total']);
        self::assertSame(2, $audit->page(['actor' => 'ana'])['total'], 'a name, through the site');
        self::assertSame(0, $audit->page(['actor' => 'nobody'])['total']);
        self::assertSame(['account.password_set', 'account.created'], array_column($audit->page(['action' => 'account.'])['items'], 'action'), 'a beginning, its dot no wildcard');
        self::assertSame(0, $audit->page(['action' => 'account_%'])['total'], '% and _ are themselves');
        self::assertSame(2, $audit->page(['scope_type' => 'characters', 'scope_id' => '42'])['total'], 'everything about character 42');
        self::assertSame(1, $audit->page(['target_type' => 'talents', 'target_id' => '9'])['total']);
        self::assertSame(['content.update', 'account.password_set'], array_column($audit->page(['from' => '2026-10-02', 'to' => '2026-10-03'])['items'], 'action'), 'to is the whole of its day');
        self::assertSame(1, $audit->page(['from' => '2026-10-05T12:00:00+02:00', 'to' => '2026-10-06T00:00:00Z'])['total']);
        self::assertSame(6, $audit->page(['from' => 'yesterday-ish'])['total'], 'what is no time filters nothing');

        // The action's beginning with every other filter after it: the placeholders behind the LIKE (0.4.0's
        // ESCAPE '\' clause could hide them from PDO before PHP 8.4 - SqlLiteralsTest keeps any such clause out).
        $every = ['actor' => '1', 'action' => 'account.', 'target_type' => 'user', 'target_id' => '1', 'from' => '2026-10-02', 'to' => '2026-10-02'];
        self::assertSame(['account.password_set'], array_column($audit->page($every)['items'], 'action'));
        self::assertSame(1, $audit->page(['action' => 'content.', 'scope_type' => 'characters', 'scope_id' => '42', 'from' => '2026-10-04T00:00:00Z'])['total']);
        self::assertSame(0, $audit->page(['action' => 'account\\', 'from' => '2026-10-01'])['total'], 'a backslash is itself');
        self::assertSame(1, $audit->countSince(new \DateTimeImmutable('2026-10-06T00:00:00Z')));

        $paged = $audit->page([], 2, 4);
        self::assertSame([6, 2, 4], [$paged['total'], $paged['page'], $paged['pageSize']]);
        self::assertSame(['account.password_set', 'account.created'], array_column($paged['items'], 'action'));

        $facets = $audit->facets();
        self::assertSame(['account.created', 'account.password_set', 'accountx.created', 'catalogue.reconcile', 'content.insert', 'content.update'], $facets['actions']);
        self::assertSame(['characters', 'files', 'talents', 'user'], $facets['target_types']);
        self::assertSame(['characters'], $facets['scope_types']);
        self::assertSame([1, 2, 3], $facets['actor_ids']);
        self::assertSame(2, $audit->countSince(new \DateTimeImmutable('2026-10-05T00:00:00Z')));
        self::assertSame(['accountx.created', 'catalogue.reconcile'], array_column($audit->latest(2), 'action'));
    }

    public function testScrubbingPeopleFollowsTheIamsRules(): void
    {
        $this->applyAdminSet();
        $this->pdo->exec("INSERT INTO anotoki_audit_log (actor_id, action, target_type, target_id, details, ip) VALUES
            (5, 'account.username_changed', 'user', '5', '{\"from\": \"ana\", \"to\": \"ana2\"}', '203.0.113.5'),
            (NULL, 'account.created', 'user', '5', '{\"email\": \"ana@example.com\", \"username\": \"ana\", \"via\": \"register\"}', '203.0.113.6'),
            (1, 'user.roles_set', 'user', '5', '{\"name\": \"Ana\", \"roles\": [\"MEMBER\"]}', '203.0.113.1'),
            (5, 'translations.saved', NULL, NULL, '{\"count\": 2}', '203.0.113.5'),
            (1, 'user.roles_set', 'user', '6', '{\"name\": \"Bo\"}', '203.0.113.1')");

        $changed = $this->audit()->scrubPeople([5]);

        $rows = $this->rows('SELECT actor_id, action, target_id, details, ip FROM anotoki_audit_log ORDER BY id');
        self::assertSame([null, null, '203.0.113.1', null, '203.0.113.1'], array_column($rows, 'ip'), 'their own rows, and the rows about them nobody else did');
        self::assertSame([], json_decode($rows[0]['details'], true));
        self::assertSame(['via' => 'register'], json_decode($rows[1]['details'], true));
        self::assertSame(['roles' => ['MEMBER']], json_decode($rows[2]['details'], true), 'another\'s action about them keeps its address, loses their name');
        self::assertSame(['count' => 2], json_decode($rows[3]['details'], true));
        self::assertSame(['name' => 'Bo'], json_decode($rows[4]['details'], true), 'somebody else is untouched');
        self::assertSame(6, $changed);
        self::assertSame(0, $this->audit()->scrubPeople(['x', -1]));
    }

    public function testDeepCodeRecordsForWhoeverTheRequestIsFrom(): void
    {
        $this->applyAdminSet();
        $audit = $this->audit();
        $app = AppFactory::create();
        $app->post('/api/characters/{id}', function (ServerRequestInterface $request, ResponseInterface $response) use ($audit): ResponseInterface {
            $audit->withScope('characters', (string) $request->getAttribute('id'), static function () use ($audit): void {
                $audit->recordHere('content.update', 'characters', 42, ['name' => ['old' => 'A', 'new' => 'B']]);
                $audit->withScope('talents', 7, static function () use ($audit): void {
                    $audit->recordHere('content.insert', 'talent_levels', 1);
                });
                $audit->recordHere('content.update', 'skills', 3, [], ['characters', '99']);
            });
            $audit->recordHere('content.delete', 'weapons', 5);

            return $response;
        })
            ->add(
                AuditContextMiddleware::fromRequest(
                    $audit,
                    static fn(ServerRequestInterface $request): array => ['actor' => $request->getAttribute('user_id'), 'session' => $request->getAttribute('sid')],
                ),
            )
            ->add(
                static fn(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface => $handler->handle(
                    $request->withAttribute('user_id', 77)->withAttribute('sid', 'sid-77'),
                ),
            );

        $app->handle((new ServerRequestFactory())->createServerRequest('POST', 'https://site.example/api/characters/42'));

        self::assertSame(
            [
                ['content.update', 77, 'sid-77', 'characters', '42'],
                ['content.insert', 77, 'sid-77', 'talents', '7'],
                ['content.update', 77, 'sid-77', 'characters', '99'],
                ['content.delete', 77, 'sid-77', null, null],
            ],
            array_map(static fn(array $row): array => array_values($row), $this->rows('SELECT action, actor_id, actor_session, scope_type, scope_id FROM anotoki_audit_log ORDER BY id')),
        );
        self::assertNull($audit->current(), 'held for the request only');

        $context = $audit->begin(null, 'cli', null);
        $audit->recordHere('translations.imported');
        $audit->end($context);
        self::assertNull($this->value("SELECT actor_id FROM anotoki_audit_log WHERE action = 'translations.imported'"), 'a name is no id');
    }

    public function testDetailsAreCutToTheirLimit(): void
    {
        $this->applyAdminSet();
        $audit = $this->audit();

        $audit->record(null, 1, 'translations.saved', null, null, ['huge' => str_repeat('ž', 80000), 'small' => 'kept']);
        $audit->record(null, 1, 'translations.imported', null, null, array_fill_keys(array_map(static fn(int $n): string => "k$n", range(1, 400)), str_repeat('a', 300)));
        $audit->record(null, 1, 'translations.listed', null, null, ['languages' => ['sk' => ['strings' => range(1, 30000), 'by' => 'ana']], 'note' => 'x']);
        $audit->record(
            null,
            1,
            'translations.dumped',
            null,
            null,
            array_fill_keys(array_map(static fn(int $n): string => "key$n", range(1, 600)), ['old' => str_repeat('o', 40), 'new' => str_repeat('n', 40), 'list' => range(1, 50)]),
        );
        $audit->record(
            null,
            1,
            'translations.flooded',
            null,
            null,
            array_fill_keys(array_map(static fn(int $n): string => "key$n", range(1, 3000)), ['old' => str_repeat('o', 40), 'new' => str_repeat('n', 40), 'list' => range(1, 50)]),
        );

        $details = json_decode((string) $this->value("SELECT details FROM anotoki_audit_log WHERE action = 'translations.saved'"), true);
        self::assertSame('kept', $details['small']);
        self::assertStringEndsWith('…[cut]', $details['huge']);
        self::assertLessThanOrEqual(AuditLog::DETAILS_LIMIT, strlen((string) json_encode($details, JSON_UNESCAPED_UNICODE)));

        // Cut, every key is kept: the texts shorter, the lists to their first items, each cut saying so.
        $many = json_decode((string) $this->value("SELECT details FROM anotoki_audit_log WHERE action = 'translations.imported'"), true);
        self::assertTrue($many['_cut']);
        self::assertCount(401, $many, 'every one of the 400 keys, and the mark');
        self::assertStringEndsWith('…[cut]', $many['k400']);
        $listed = json_decode((string) $this->value("SELECT details FROM anotoki_audit_log WHERE action = 'translations.listed'"), true);
        self::assertSame(['by' => 'ana', 'note' => 'x'], ['by' => $listed['languages']['sk']['by'], 'note' => $listed['note']]);
        self::assertContains('…[29800 more]', $listed['languages']['sk']['strings']);

        // Too much even cut: what it held, as its keys - the shape of every map.
        $dumped = json_decode((string) $this->value("SELECT details FROM anotoki_audit_log WHERE action = 'translations.dumped'"), true);
        self::assertTrue($dumped['_cut']);
        self::assertCount(600, $dumped['keys'], 'every key');
        $shape = $dumped['keys']['key600'];
        ksort($shape);
        self::assertSame(['list' => '[50 items]', 'new' => null, 'old' => null], $shape, 'a map as its keys (JSONB keeps them in an order of its own)');
        // And past even that, its first keys, as many as fit - every one of them here.
        $flooded = json_decode((string) $this->value("SELECT details FROM anotoki_audit_log WHERE action = 'translations.flooded'"), true);
        self::assertTrue($flooded['_cut']);
        self::assertSame(array_map(static fn(int $n): string => "key$n", range(1, 3000)), $flooded['keys']);
        foreach (['translations.imported', 'translations.listed', 'translations.dumped', 'translations.flooded'] as $action) {
            self::assertLessThanOrEqual(AuditLog::DETAILS_LIMIT, strlen((string) $this->value("SELECT details::text FROM anotoki_audit_log WHERE action = '$action'")));
        }
    }

    public function testTheRoutesForTheAdminAlone(): void
    {
        $audit = $this->audit();
        $app = AppFactory::create();
        // No middleware of the site's at all: the group's own check keeps everybody but the ADMIN out.
        AuditRoutes::admin(
            $app,
            '/api/admin/audit',
            $audit,
            new AdminContext(
                static fn(ServerRequestInterface $request): ?int => $request->hasHeader('X-Test-Admin') ? 1 : null,
                isAdmin: static fn(ServerRequestInterface $request): bool => $request->getHeaderLine('X-Test-Admin') === 'yes',
            ),
            static fn(array $ids): array => array_intersect_key([1 => 'ana', 2 => 'bo'], array_flip($ids)),
        );

        $missing = $this->get($app, '/api/admin/audit');
        self::assertSame([503, 'feature_unavailable', '60'], [$missing->getStatusCode(), $this->json($missing)['code'], $missing->getHeaderLine('Retry-After')]);

        $this->applyAdminSet();
        $audit->record(null, 1, 'user.created', 'user', 9, ['username' => 'cid']);
        $audit->record(null, 3, 'user.updated', 'user', 9);
        foreach (['/api/admin/audit', '/api/admin/audit/facets'] as $path) {
            $bare = $this->get($app, $path, false);
            self::assertSame([401, 'sign_in_required'], [$bare->getStatusCode(), $this->json($bare)['code']], "a bare request to $path");
            $other = $app->handle((new ServerRequestFactory())->createServerRequest('GET', 'https://site.example' . $path)->withHeader('X-Test-Admin', 'no'));
            self::assertSame([403, 'forbidden'], [$other->getStatusCode(), $this->json($other)['code']], "somebody else at $path");
            self::assertStringNotContainsString('user.', (string) $other->getBody());
        }

        $page = $this->json($this->get($app, '/api/admin/audit?action=user.&page=1&actor[]=x'));
        self::assertSame(2, $page['total']);
        self::assertSame(['user.updated', 'user.created'], array_column($page['items'], 'action'));
        self::assertSame([null, 'ana'], array_column($page['items'], 'actor_username'), 'a name from the site, none for an id it does not know');
        self::assertSame(
            ['actor_username', 'id', 'created_at', 'actor_id', 'actor_session', 'action', 'target_type', 'target_id', 'scope_type', 'scope_id', 'details', 'ip'],
            array_keys($page['items'][0]),
            'the IAM\'s AuditEntry and the three more',
        );
        $facets = $this->json($this->get($app, '/api/admin/audit/facets'));
        self::assertSame([['id' => 1, 'username' => 'ana'], ['id' => 3, 'username' => null]], $facets['actors']);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function applyAdminSet(): void
    {
        self::assertNull($this->migrator([Schema::migrationSet()])->apply()['error']);
    }

    /** @param array<string, mixed> $options */
    private function audit(array $options = []): AuditLog
    {
        return new AuditLog(
            fn(): PDO => $this->pdo,
            $options + [
                'onError' => function (string $message): void {
                    $this->errors[] = $message;
                },
            ],
        );
    }

    private function request(): ServerRequestInterface
    {
        return (new ServerRequestFactory())->createServerRequest('POST', 'https://site.example/api/x', ['REMOTE_ADDR' => '10.0.0.1'])->withHeader('CF-Connecting-IP', '198.51.100.20');
    }

    private function get(App $app, string $target, bool $admin = true): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('GET', 'https://site.example' . $target);
        parse_str((string) parse_url($target, PHP_URL_QUERY), $query);
        $request = $request->withQueryParams($query);

        return $app->handle($admin ? $request->withHeader('X-Test-Admin', 'yes') : $request);
    }

    /** @return array<mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
