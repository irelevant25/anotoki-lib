<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\People;

use Anotoki\Lib\Admin\Schema as AdminSchema;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Auth\Testing\TestIam;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\Copy;
use Anotoki\Lib\Feedback\Feedback;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\People\Http\PeopleUpkeep;
use Anotoki\Lib\People\People;
use Anotoki\Lib\People\Schema;
use Anotoki\Lib\People\Scrubber;
use Anotoki\Lib\Support\AfterResponse;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\LogLines;
use Anotoki\Lib\Tests\Support\SiteShapes;
use Anotoki\Lib\Tests\Support\TestDatabase;
use Closure;
use LogicException;
use PDO;
use PDOException;
use Psr\Http\Message\ServerRequestInterface;
use ReflectionProperty;
use RuntimeException;

/**
 * A person's delete and their feedback in one transaction (People::delete()), and what a restore does again:
 * inside its transaction, before anybody sees its rows, the deletes the audit log holds from the backup's
 * snapshot on - a person's, a feedback message's (People::replay(), Backups' beforeCommit) - and after it the
 * scrub of the IAM's deleted accounts, reported and retried when it does not go through (People::afterRestore()).
 * A hook that waits on another connection ends the restore, never the site. Piano Academy's shape, with the
 * admin tools' tables, restored for real.
 */
final class PeopleRestoreTest extends DatabaseTestCase
{
    private TestIam $iam;
    private People $people;
    private AuditLog $audit;

    /** The backups' own connection, as a site gives them one. */
    private PDO $connection;

    /** @var list<int> whom the site's delete hook was asked to delete */
    private array $deleted = [];

    /** @var list<callable> what was put off till after the answer */
    private array $later = [];

    /** What the delete hook does besides, while a restore does it again. */
    private ?Closure $during = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->iam = TestIam::create($this->path('iam'), 'https://iam.test', 'piano-academy');
        $this->iam->anonymized([]);
        SiteShapes::create($this->pdo, 'piano');
        self::assertNull($this->siteMigrator($this->pdo)->apply()['error']);
        $this->people = new People(SiteShapes::table('piano'), fn (): PDO => $this->pdo, $this->iam->client());
        $this->audit = new AuditLog(fn (): PDO => $this->pdo);
        $this->connection = $this->backupsConnection();

        foreach ([7 => 'alice', 8 => 'bob'] as $sub => $name) {
            $this->pdo->prepare('INSERT INTO users (id, preferred_username) VALUES (?, ?)')->execute([$sub, $name]);
            $this->pdo->prepare("INSERT INTO progress (user_id, notes) VALUES (?, '{\"60\": {}}')")->execute([$sub]);
        }
    }

    protected function tearDown(): void
    {
        AfterResponse::shared()->clear();
        LogLines::take();
        unset($this->connection);
        parent::tearDown();
    }

    public function testADeleteForgetsThePersonsFeedbackInItsTransaction(): void
    {
        $alice = $this->message(7, 'alice@example.test');
        $bob = $this->message(8, 'bob@example.test');

        self::assertSame(['deleted' => ['Progress' => 1]], $this->people->delete($this->pdo, 7, $this->hook()));
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM progress WHERE user_id = 7'));
        self::assertSame([null, null, 'The quiz is great'], $this->feedbackOf($alice), 'the address and browser go; the words stay');
        self::assertSame(['bob@example.test', 'Firefox', 'The quiz is great'], $this->feedbackOf($bob), 'nobody else\'s');

        // A hook that fails takes nothing with it: neither its deletes nor the feedback's forgetting.
        $failing = $this->failing();
        try {
            $this->people->delete($this->pdo, 8, $failing);
            self::fail('the hook\'s failure was swallowed');
        } catch (RuntimeException $e) {
            self::assertSame('the copy of their data could not be written', $e->getMessage());
        }
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM progress WHERE user_id = 8'), 'rolled back');
        self::assertSame(['bob@example.test', 'Firefox', 'The quiz is great'], $this->feedbackOf($bob));
        self::assertFalse($this->pdo->inTransaction());

        // Nobody with that id: nothing forgotten either.
        $nobody = $this->message(9, 'carol@example.test');
        self::assertNull($this->people->delete($this->pdo, 9, $this->hook()));
        self::assertSame(['carol@example.test', 'Firefox', 'The quiz is great'], $this->feedbackOf($nobody));

        // A hook of before 0.5.0, with a transaction of its own, is told what to change.
        $own = static function (PDO $pdo): array {
            $pdo->beginTransaction();

            return [];
        };
        try {
            $this->people->delete($this->pdo, 8, $own);
            self::fail('a transaction inside the library\'s was taken');
        } catch (LogicException $e) {
            self::assertStringContainsString('runs inside the library\'s transaction', $e->getMessage());
        }
        self::assertFalse($this->pdo->inTransaction());

        // One that ends the transaction it was given and begins another - which passes for it still open - is
        // found by the library's savepoint being gone.
        try {
            $this->people->delete($this->pdo, 8, $this->ending());
            self::fail('a transaction ended inside the hook passed');
        } catch (LogicException $e) {
            self::assertStringContainsString('the delete hook ended the library\'s transaction', $e->getMessage());
        }
        self::assertFalse($this->pdo->inTransaction());

        // Inside a caller's transaction (a restore's), a hook that fails takes back its own work, and only that.
        $this->pdo->beginTransaction();
        $this->pdo->exec("INSERT INTO users (id, preferred_username) VALUES (20, 'dora')");
        try {
            $this->people->delete($this->pdo, 8, $failing);
            self::fail('the hook\'s failure was swallowed');
        } catch (RuntimeException) {
        }
        self::assertTrue($this->pdo->inTransaction(), 'the caller\'s transaction stays');
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM progress WHERE user_id = 8'), 'the hook\'s delete undone');
        self::assertSame('dora', $this->value('SELECT preferred_username FROM users WHERE id = 20'), 'the caller\'s own work kept, its transaction usable');
        $this->pdo->rollBack();
    }

    public function testARestoreDeletesAgainWhatWasDeletedSinceTheBackupWasMade(): void
    {
        $alice = $this->message(7, 'alice@example.test');
        $bob = $this->message(8, 'bob@example.test');
        // Done before the backup was made: in the backup already, and never done again.
        $this->audit->record(null, 1, 'person.data_deleted', 'user', '8', ['deleted' => ['Progress' => 0]]);
        $this->pdo->exec("UPDATE anotoki_audit_log SET created_at = '2026-01-01T00:00:00Z' WHERE action = 'person.data_deleted'");
        $backups = $this->backups();
        $backup = $backups->create(Backups::MANUAL, 'Before the deletes', 1);
        self::assertIsArray($backup);

        // After it: alice's data deleted on the People page, bob's message on the Feedback page - as their routes record them.
        $this->people->delete($this->pdo, 7, $this->hook());
        $this->audit->record(null, 1, 'person.data_deleted', 'user', '7', ['deleted' => ['Progress' => 1]]);
        $this->deleteMessage($bob);
        self::assertSame([7], $this->deleted);

        // While the restore does her delete again, nobody has the rows it loaded: a backup of them is refused, a
        // read on another connection waits for the commit.
        $seen = [];
        $this->during = function () use ($backups, &$seen): void {
            $made = $backups->create(Backups::MANUAL, 'In the window', 1);
            $seen['backup'] = $made instanceof Refusal ? $made->code : 'made';
            $this->pdo->exec("SET lock_timeout = '200ms'");
            try {
                $this->pdo->query('SELECT count(*) FROM progress')->fetchColumn();
                $seen['read'] = 'read';
            } catch (PDOException $e) {
                $seen['read'] = (string) $e->getCode();
            } finally {
                $this->pdo->exec('SET lock_timeout = 0');
            }
        };

        $result = $backups->restore($backup['id'], 1);
        $this->during = null;

        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertNull($result['after_restore_error']);
        self::assertSame(['backup' => 'busy', 'read' => '55P03'], $seen, 'inside the restore\'s transaction, its locks held');
        self::assertSame([7, 7], $this->deleted, 'alice\'s delete done again - and only hers');
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM progress WHERE user_id = 7'), 'her progress is gone again');
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM progress WHERE user_id = 8'), 'bob\'s, never deleted, came back with the backup');
        self::assertSame([null, null, 'The quiz is great'], $this->feedbackOf($alice), 'her feedback forgotten again');
        self::assertSame(0, (int) $this->value("SELECT count(*) FROM anotoki_feedback WHERE id = $bob"), 'bob\'s message deleted again');
        self::assertSame([], $this->later, 'the scrub went through: nothing put off');
        self::assertCount(2, $backups->list(), 'the backup and the one made before the restore - none in the window');
    }

    public function testAFailureInTheReplayRollsTheWholeRestoreBack(): void
    {
        $backups = $this->backups($this->people->restoreHooks(delete: $this->failing(), defer: $this->defer()));
        $backup = $backups->create(Backups::MANUAL, null, 1);
        self::assertIsArray($backup);
        $this->people->delete($this->pdo, 7, $this->hook());
        $this->audit->record(null, 1, 'person.data_deleted', 'user', '7', ['deleted' => ['Progress' => 1]]);
        $this->pdo->exec("INSERT INTO users (id, preferred_username) VALUES (9, 'carol')");
        $before = $this->state();

        $result = $backups->restore($backup['id'], 1);

        self::assertInstanceOf(Refusal::class, $result);
        self::assertSame([500, 'restore_failed'], [$result->status, $result->code]);
        self::assertSame(
            'The restore failed and nothing of it stayed: What was deleted of person 7 since this backup was made could not be deleted again (the copy of their data could not be written).',
            $result->message,
        );
        self::assertSame($before, $this->state(), 'nothing of the restore stayed: carol is there, alice\'s progress still gone');
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM anotoki_audit_log WHERE action = 'backup.restore_failed'"));
        self::assertSame([], $this->later, 'no work after a restore that did not happen');
    }

    public function testAHookThatEndsTheRestoresTransactionIsSaidToHaveDoneSo(): void
    {
        $backups = $this->backups($this->people->restoreHooks(delete: $this->ending(), defer: $this->defer()));
        $backup = $backups->create(Backups::MANUAL, null, 1);
        self::assertIsArray($backup);
        $this->people->delete($this->pdo, 7, $this->hook());
        $this->audit->record(null, 1, 'person.data_deleted', 'user', '7', ['deleted' => ['Progress' => 1]]);

        $result = $backups->restore($backup['id'], 1);

        self::assertInstanceOf(Refusal::class, $result);
        self::assertSame('restore_failed', $result->code);
        $beforeRestore = array_values(array_filter($backups->list(), static fn (array $made): bool => $made['kind'] === Backups::BEFORE_RESTORE))[0]['id'];
        self::assertStringStartsWith("The restore did not finish, and what it had loaded may have stayed ($beforeRestore holds the data as it was): ", $result->message);
        self::assertStringContainsString('the delete hook ended the library\'s transaction', $result->message);
        self::assertFalse($this->connection->inTransaction());
    }

    public function testAHookOnTheSitesOwnConnectionEndsTheRestoreInsteadOfHangingTheSite(): void
    {
        // A delete hook of before: it works on the site's own connection (db()), not on the $pdo it is given. In a
        // restore that connection waits on the restore's locks while the restore waits on the hook - for ever, and
        // every request to those tables behind both. The database ends the restore's connection once it waited
        // past its limit (a minute; a second here), and the restore with it: rolled back, its locks let go.
        $own = function (PDO $pdo, int $sub): ?array {
            $this->deleted[] = $sub;
            $progress = $this->pdo->prepare('DELETE FROM progress WHERE user_id = ?');
            $progress->execute([$sub]);

            return ['deleted' => ['Progress' => $progress->rowCount()]];
        };
        $backups = $this->backups($this->people->restoreHooks(delete: $own, defer: $this->defer()));
        (new ReflectionProperty(Backups::class, 'idleMilliseconds'))->setValue($backups, 1000);
        $backup = $backups->create(Backups::MANUAL, null, 1);
        self::assertIsArray($backup);
        $this->people->delete($this->pdo, 7, $this->hook());
        $this->audit->record(null, 1, 'person.data_deleted', 'user', '7', ['deleted' => ['Progress' => 1]]);
        $this->pdo->exec("INSERT INTO users (id, preferred_username) VALUES (9, 'carol')");
        $before = $this->state();
        // Should the restore never be ended, the hook's statement gives up instead: a failure, never a hung test.
        $this->pdo->exec("SET lock_timeout = '20s'");

        $started = microtime(true);
        $result = $backups->restore($backup['id'], 1);
        $took = microtime(true) - $started;
        $this->pdo->exec('SET lock_timeout = 0');

        self::assertInstanceOf(Refusal::class, $result);
        self::assertSame([500, 'restore_failed'], [$result->status, $result->code]);
        self::assertStringStartsWith('The restore failed and nothing of it stayed: the database ended its connection, and its transaction with it - as it ends a restore that waits more than a second between two of its statements', $result->message);
        self::assertStringContainsString('a delete hook works on the $pdo it is given, never on the site\'s own connection', $result->message);
        self::assertLessThan(15.0, $took, 'ended by the database after its wait - not by the hook\'s statement giving up');
        self::assertSame([7, 7], $this->deleted, 'the hook\'s statement went through once the restore was gone');
        self::assertSame($before, $this->state(), 'nothing of the restore stayed: carol is there, alice\'s progress still gone');
        self::assertSame([], $this->later, 'no work after a restore that did not happen');

        // Nothing of it holds the site: the same restore, with a hook on the $pdo it is given, goes through.
        $this->connection = $this->backupsConnection();
        $restored = $this->backups()->restore($backup['id'], 1);
        self::assertIsArray($restored, $restored instanceof Refusal ? $restored->message : '');
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM users WHERE id = 9'), 'restored');
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM progress WHERE user_id = 7'), 'her delete done again');
    }

    public function testAnEntryInsideTheDeletesTransactionIsMatchedToTheBackupByThatTransaction(): void
    {
        // The People page writes its entry inside the delete's transaction (AuditLog::recordInside()), so the
        // entry's time is when that transaction began - not when it committed.
        $entry = fn (string $sub): Closure => function (PDO $pdo, array $deleted) use ($sub): void {
            $this->audit->recordInside($pdo, null, 1, 'person.data_deleted', 'user', $sub, ['deleted' => $deleted['deleted']]);
        };
        $backups = $this->backups();
        // bob's delete committed before the backup was made: it is in the backup, and never done again.
        $this->people->delete($this->pdo, 8, $this->hook(), null, $entry('8'));
        // alice's begins before the backup and commits after its snapshot: the backup still has her progress.
        $this->pdo->beginTransaction();
        $this->people->delete($this->pdo, 7, $this->hook(), null, $entry('7'));
        $backup = $backups->create(Backups::MANUAL, null, 1);
        self::assertIsArray($backup);
        $this->pdo->commit();
        $began = $this->pdo->prepare("SELECT target_id, created_at < CAST(? AS timestamptz) FROM anotoki_audit_log WHERE action = 'person.data_deleted' ORDER BY target_id");
        $began->execute([$backups->manifest($backup['id'])['snapshot_at']]);
        self::assertSame([['7', true], ['8', true]], $began->fetchAll(PDO::FETCH_NUM), 'both begun before the backup: by the time alone, neither would be done again');

        $result = $backups->restore($backup['id'], 1);

        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertSame([8, 7, 7], $this->deleted, 'alice\'s delete done again - its transaction is not in the backup\'s snapshot; bob\'s is');
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM progress WHERE user_id IN (7, 8)'), 'neither person\'s progress came back');
        self::assertSame(2, (int) $this->value("SELECT count(*) FROM anotoki_audit_log WHERE action = 'person.data_deleted'"), 'a replay writes no entry of its own');
    }

    public function testAnEntrysTransactionIsAskedOnlyWithinTheHourBeforeTheBackup(): void
    {
        // A database moved to another cluster by pg_dump counts its transactions anew: an entry of before the move
        // names an id no later snapshot sees. Its transaction is asked only within the hour before the backup - the
        // race it is for: a delete begun before the snapshot, committed after it.
        $entry = $this->pdo->prepare(
            "INSERT INTO anotoki_audit_log (created_at, actor_id, action, target_type, target_id, details)
             VALUES (CAST(? AS timestamptz), 1, 'person.data_deleted', 'user', ?, CAST(? AS jsonb))"
        );
        // Hours before the backup, under an id its snapshot does not see: alice came back since, and keeps what she has.
        $entry->execute(['2026-10-11T07:00:00Z', '7', '{"deleted": {"Progress": 1}, "_txid": "5000000"}']);
        // Minutes before it, not seen: begun before the snapshot, committed after it.
        $entry->execute(['2026-10-11T09:55:00Z', '8', '{"deleted": {"Progress": 1}, "_txid": "5000000"}']);
        // Minutes before it, seen: in the backup already.
        $entry->execute(['2026-10-11T09:58:00Z', '9', '{"deleted": {"Progress": 1}, "_txid": "50"}']);
        $replay = $this->people->replay(delete: $this->hook());

        $this->connection->beginTransaction();
        $replay(['snapshot_at' => '2026-10-11T10:00:00.000000Z', 'txid_snapshot' => '100:100:'], $this->connection);
        $this->connection->rollBack();

        self::assertSame([8], $this->deleted, 'bob\'s alone: alice\'s entry is hours before the backup - in it by its time, whatever its id - and the third one\'s transaction is in the snapshot');
    }

    public function testWhatAfterRestoreThrowsKeepsItsFirstFailure(): void
    {
        $this->pdo->exec(<<<'SQL'
CREATE FUNCTION refuse_sync() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'the scrub''s table is read-only today'; END $$;
CREATE TRIGGER refuse_sync BEFORE INSERT OR UPDATE ON anotoki_people_sync FOR EACH ROW EXECUTE FUNCTION refuse_sync();
SQL);
        $own = new RuntimeException('Not every progress took a new generation.');
        $after = $this->people->afterRestore($this->defer(), static function () use ($own): void {
            throw $own;
        });

        try {
            $after([], $this->pdo);
            self::fail('nothing thrown');
        } catch (RuntimeException $e) {
            self::assertInstanceOf(PDOException::class, $e->getPrevious(), 'the scrub\'s failure, the first: its class, file, line and trace kept');
            self::assertStringContainsString('read-only today', $e->getPrevious()->getMessage());
        }

        $this->pdo->exec('DROP TRIGGER refuse_sync ON anotoki_people_sync');
        try {
            $after([], $this->pdo);
            self::fail('nothing thrown');
        } catch (RuntimeException $e) {
            self::assertSame($own, $e->getPrevious(), 'the scrub went through: the site\'s own failure is the first');
            self::assertSame('Not every progress took a new generation.', $e->getMessage());
        }
    }

    public function testAnIamOutOfReachIsTheRestoresErrorAndTheNextRequestScrubsAgain(): void
    {
        $backups = $this->backups();
        $backup = $backups->create(Backups::MANUAL, null, 1);
        self::assertIsArray($backup);
        $this->people->delete($this->pdo, 7, $this->hook());
        $this->audit->record(null, 1, 'person.data_deleted', 'user', '7', ['deleted' => ['Progress' => 1]]);
        $stamp = $this->iam->client()->cacheDirectory() . '/' . PeopleUpkeep::STAMP;
        touch($stamp);
        $this->iam->anonymized(null);

        $result = $backups->restore($backup['id'], 1);

        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertStringStartsWith('The accounts the IAM deleted were not checked again (', (string) $result['after_restore_error']);
        self::assertStringContainsString('the check runs again with the next request', (string) $result['after_restore_error']);
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM progress WHERE user_id = 7'), 'the deletes are done again all the same');

        // The hour's stamp goes after the answer - not before: this request's own upkeep would claim it again at once.
        self::assertFileExists($stamp);
        self::assertCount(1, $this->later);
        ($this->later[0])();
        self::assertFileDoesNotExist($stamp);
        $this->iam->anonymized([]);
        $upkeep = new PeopleUpkeep($this->people, static fn (): bool => true, static function (callable $work): void {
            $work();
        });
        self::assertTrue($upkeep->soon(), 'the next request runs the scrub again');
        self::assertNotNull(Scrubber::status($this->pdo)['ok_at']);
    }

    public function testTheSitesOwnWorkRunsWhateverTheScrubDid(): void
    {
        // The scrub's own table refuses it today: a failure of the scrub itself, not an answer of the IAM's.
        $this->pdo->exec(<<<'SQL'
CREATE FUNCTION refuse_sync() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'the scrub''s table is read-only today'; END $$;
CREATE TRIGGER refuse_sync BEFORE INSERT OR UPDATE ON anotoki_people_sync FOR EACH ROW EXECUTE FUNCTION refuse_sync();
SQL);
        $ran = false;
        $backups = $this->backups($this->people->restoreHooks(
            delete: $this->hook(),
            defer: $this->defer(),
            then: static function (array $manifest, PDO $pdo) use (&$ran): void {
                $ran = true;

                throw new RuntimeException('Not every progress took a new generation.');
            },
        ));
        $backup = $backups->create(Backups::MANUAL, null, 1);
        self::assertIsArray($backup);
        $stamp = $this->iam->client()->cacheDirectory() . '/' . PeopleUpkeep::STAMP;
        touch($stamp);

        $result = $backups->restore($backup['id'], 1);

        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertTrue($ran, 'the site\'s own work ran all the same');
        $error = (string) $result['after_restore_error'];
        self::assertStringStartsWith('The accounts the IAM deleted were not checked again (it failed: ', $error);
        self::assertStringContainsString('the scrub\'s table is read-only today', $error);
        self::assertStringEndsWith('on the People page. Not every progress took a new generation.', $error, 'the scrub\'s, then the site\'s own');
        self::assertCount(1, $this->later, 'the hour\'s stamp goes after the answer on a failure too');
        ($this->later[0])();
        self::assertFileDoesNotExist($stamp);
    }

    public function testWithSomethingToDoAgainNoTimeOrNoAuditLogIsAFailure(): void
    {
        $replay = $this->people->replay(delete: $this->hook());
        $this->connection->beginTransaction();
        try {
            $replay(['id' => 'x', 'created_at' => 'yesterday'], $this->connection);
            self::fail('a backup without a time passed');
        } catch (RuntimeException $e) {
            self::assertSame('This backup says no time it was made at, so what was deleted since cannot be done again.', $e->getMessage());
        } finally {
            $this->connection->rollBack();
        }

        $this->connection->beginTransaction();
        try {
            $replay(['snapshot_at' => '2026-10-11T10:00:00.000000Z', 'txid_snapshot' => '10:20:1x'], $this->connection);
            self::fail('a snapshot that cannot be read passed');
        } catch (RuntimeException $e) {
            self::assertSame('This backup\'s snapshot cannot be read, so what was deleted since cannot be told.', $e->getMessage());
        } finally {
            $this->connection->rollBack();
        }

        $this->pdo->exec('DROP TABLE anotoki_audit_log');
        $this->connection->beginTransaction();
        try {
            $replay(['snapshot_at' => '2026-10-11T10:00:00.000000Z'], $this->connection);
            self::fail('a database without an audit log passed');
        } catch (RuntimeException $e) {
            self::assertSame('There is no audit log here to say what was deleted since this backup was made.', $e->getMessage());
        } finally {
            $this->connection->rollBack();
        }
        self::assertSame([], $this->deleted);

        // With nothing to do again - no delete hook, no feedback - there is nothing to fail.
        $this->pdo->exec('DROP TABLE anotoki_feedback');
        $this->connection->beginTransaction();
        ($this->people->replay())([], $this->connection);
        $this->connection->rollBack();
    }

    public function testARunningCheckOfTheIamsListKeepsTheRestoreBack(): void
    {
        $backups = $this->backups();
        $backup = $backups->create(Backups::MANUAL, null, 1);
        self::assertIsArray($backup);
        $this->pdo->exec("INSERT INTO users (id, preferred_username) VALUES (9, 'carol')");
        // A check under way on another connection: it would keep its own place in the IAM's list over the restored one.
        $this->pdo->query('SELECT pg_advisory_lock(' . Scrubber::LOCK . ')');

        $refused = $backups->restore($backup['id'], 1);

        self::assertInstanceOf(Refusal::class, $refused);
        self::assertStringContainsString('A check of the accounts the IAM deleted was running', $refused->message);
        self::assertSame('carol', $this->value('SELECT preferred_username FROM users WHERE id = 9'), 'nothing restored');

        $this->pdo->query('SELECT pg_advisory_unlock(' . Scrubber::LOCK . ')');
        $result = $backups->restore($backup['id'], 1);
        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM users WHERE id = 9'), 'restored once the check was done');
    }

    public function testAFeedbackDeleteIsDoneAgainOnlyOnTheSameMessage(): void
    {
        $a = $this->message(7, 'alice@example.test');
        $backups = $this->backups();
        $first = $backups->create(Backups::MANUAL, 'First', 1);
        self::assertIsArray($first);
        $c = $this->message(8, 'bob@example.test');
        $restored = $backups->restore($first['id'], 1);
        self::assertIsArray($restored, $restored instanceof Refusal ? $restored->message : '');
        self::assertSame([$a], $this->feedbackIds(), 'c is gone with the restore - and kept in the backup made before it');

        // A message after the restore: never c's id again - a restore moves no sequence back - and deleted.
        $d = $this->message(8, 'bob@example.test');
        self::assertGreaterThan($c, $d);
        $this->deleteMessage($d);
        // An entry that names c's id with another time - c's id handed out again, had a sequence gone back - and
        // one of before 0.5.0 that names a's id with no time.
        $this->audit->record(null, 1, 'feedback.deleted', 'feedback', $c, ['kind' => 'bug', 'status' => 'new', 'created_at' => '2020-01-01T00:00:00.000Z']);
        $this->audit->record(null, 1, 'feedback.deleted', 'feedback', $a, ['kind' => 'bug', 'status' => 'new']);

        $result = $backups->restore($restored['before_restore'], 1);

        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertSame([$a, $c], $this->feedbackIds(), 'd was never in it; neither entry deleted another message');
    }

    public function testTheBackupsTimeIsTheDatabasesOwn(): void
    {
        $backups = $this->backups();
        $before = $this->databaseNow();
        $backup = $backups->create(Backups::MANUAL, null, 1);
        $after = $this->databaseNow();
        self::assertIsArray($backup);
        $snapshotAt = $backups->manifest($backup['id'])['snapshot_at'] ?? null;
        self::assertIsString($snapshotAt);
        self::assertMatchesRegularExpression('/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/D', $snapshotAt);
        $within = $this->pdo->prepare('SELECT CAST(? AS timestamptz) BETWEEN CAST(? AS timestamptz) AND CAST(? AS timestamptz)');
        $within->execute([$snapshotAt, $before, $after]);
        self::assertTrue((bool) $within->fetchColumn(), 'the database\'s clock, while the backup was made');
        self::assertMatchesRegularExpression('/^[0-9]+:[0-9]+:(?:[0-9]+(?:,[0-9]+)*)?$/D', (string) ($backups->manifest($backup['id'])['txid_snapshot'] ?? ''), 'and the snapshot itself: the transactions it sees');

        // A replay goes by it, not by PHP's created_at: an entry between the two is done again.
        $this->audit->record(null, 1, 'person.data_deleted', 'user', '7', ['deleted' => ['Progress' => 1]]);
        $this->pdo->exec("UPDATE anotoki_audit_log SET created_at = '2026-10-11T10:00:01Z' WHERE action = 'person.data_deleted'");
        $replay = $this->people->replay(delete: $this->hook());
        $this->connection->beginTransaction();
        $replay(['snapshot_at' => '2026-10-11T10:00:00.000000Z', 'created_at' => '2026-10-11T10:00:02.000Z'], $this->connection);
        $this->connection->rollBack();
        self::assertSame([7], $this->deleted, 'from the snapshot on - PHP\'s clock said later');

        // A backup of before 0.5.0 says created_at alone.
        $this->connection->beginTransaction();
        $replay(['created_at' => '2026-10-11T10:00:02.000Z'], $this->connection);
        $this->connection->rollBack();
        self::assertSame([7], $this->deleted, 'from its created_at on: the entry before it is not done again');
    }

    /** The site's delete hook: their progress, by the page's label; null for nobody here. */
    private function hook(): Closure
    {
        return function (PDO $pdo, int $sub, ?ServerRequestInterface $request = null): ?array {
            $this->deleted[] = $sub;
            if ($this->during !== null) {
                ($this->during)();
            }
            $known = $pdo->prepare('SELECT count(*) FROM users WHERE id = ? AND id > 0');
            $known->execute([$sub]);
            if ((int) $known->fetchColumn() === 0) {
                return null;
            }
            $progress = $pdo->prepare('DELETE FROM progress WHERE user_id = ?');
            $progress->execute([$sub]);

            return ['deleted' => ['Progress' => $progress->rowCount()]];
        };
    }

    /** A hook that deletes, then cannot write the copy it keeps. */
    private function failing(): Closure
    {
        return function (PDO $pdo, int $sub, ?ServerRequestInterface $request = null): ?array {
            ($this->hook())($pdo, $sub, $request);

            throw new RuntimeException('the copy of their data could not be written');
        };
    }

    /** A hook that ends the transaction it was given, and begins another. */
    private function ending(): Closure
    {
        return static function (PDO $pdo): array {
            $pdo->commit();
            $pdo->beginTransaction();

            return ['deleted' => []];
        };
    }

    private function defer(): Closure
    {
        return function (callable $work): void {
            $this->later[] = $work;
        };
    }

    /** @param ?array<string, Closure> $hooks  the restore's hooks; the People's own by default */
    private function backups(?array $hooks = null): Backups
    {
        $connection = $this->connection;

        return new Backups(static fn (): PDO => $connection, $this->path('storage') . '/backups', [
            'site' => 'piano',
            'migrator' => fn (PDO $pdo): Migrator => $this->siteMigrator($pdo),
            'audit' => new AuditLog(static fn (): PDO => $connection),
            'onError' => static function (): void {
            },
            ...($hooks ?? $this->people->restoreHooks(delete: $this->hook(), defer: $this->defer())),
        ]);
    }

    private function siteMigrator(PDO $pdo): Migrator
    {
        return new Migrator($pdo, [AdminSchema::migrationSet(), $this->set('site'), Schema::migrationSet()]);
    }

    /** A connection of the backups' own, as a site opens one. */
    private function backupsConnection(): PDO
    {
        $settings = TestDatabase::settings();

        return Copy::connect(sprintf('pgsql:host=%s;port=%d;dbname=%s', $settings['host'], $settings['port'], $this->database), $settings['username'], $settings['password']);
    }

    /** A message from $sub, with the address they gave and their browser; its id. */
    private function message(int $sub, string $address): int
    {
        $statement = $this->pdo->prepare(
            "INSERT INTO anotoki_feedback (kind, message, contact_email, user_id, user_agent) VALUES ('bug', 'The quiz is great', ?, ?, 'Firefox') RETURNING id"
        );
        $statement->execute([$address, $sub]);

        return (int) $statement->fetchColumn();
    }

    /** A message deleted on the Feedback page, recorded as its route records it: by its id and the time it was sent. */
    private function deleteMessage(int $id): void
    {
        $sentAt = (string) $this->value('SELECT ' . AuditLog::isoColumn('created_at') . " FROM anotoki_feedback WHERE id = $id");
        self::assertTrue(Feedback::deleteOn($this->pdo, $id));
        $this->audit->record(null, 1, 'feedback.deleted', 'feedback', $id, ['kind' => 'bug', 'status' => 'new', 'created_at' => $sentAt]);
    }

    /** @return array{?string, ?string, string} the message's address, browser and words */
    private function feedbackOf(int $id): array
    {
        $row = $this->pdo->query("SELECT contact_email, user_agent, message FROM anotoki_feedback WHERE id = $id")->fetch(PDO::FETCH_NUM);

        return [$row[0], $row[1], $row[2]];
    }

    /** @return list<int> */
    private function feedbackIds(): array
    {
        return array_map('intval', $this->pdo->query('SELECT id FROM anotoki_feedback ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
    }

    /** @return array{list<array<string, mixed>>, list<array<string, mixed>>} the people and their progress */
    private function state(): array
    {
        return [$this->rows('SELECT id, preferred_username FROM users ORDER BY id'), $this->rows('SELECT user_id FROM progress ORDER BY user_id')];
    }

    private function databaseNow(): string
    {
        return (string) $this->value("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')");
    }
}
