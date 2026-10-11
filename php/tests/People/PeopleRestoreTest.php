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
use Anotoki\Lib\Support\AfterResponse;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\LogLines;
use Anotoki\Lib\Tests\Support\SiteShapes;
use Anotoki\Lib\Tests\Support\TestDatabase;
use Closure;
use LogicException;
use PDO;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;

/**
 * A person's delete and their feedback in one transaction (People::delete()), and what a restore does again
 * (People::afterRestore()): the deletes the audit log holds from the backup's time on - a person's, a feedback
 * message's - and the scrub of the IAM's deleted accounts, reported and retried when the IAM is out of reach.
 * Piano Academy's shape, with the admin tools' tables, restored for real.
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

    protected function setUp(): void
    {
        parent::setUp();
        $this->iam = TestIam::create($this->path('iam'), 'https://iam.test', 'piano-academy');
        $this->iam->anonymized([]);
        SiteShapes::create($this->pdo, 'piano');
        self::assertNull($this->siteMigrator($this->pdo)->apply()['error']);
        $this->people = new People(SiteShapes::table('piano'), fn (): PDO => $this->pdo, $this->iam->client());
        $this->audit = new AuditLog(fn (): PDO => $this->pdo);
        $settings = TestDatabase::settings();
        $this->connection = Copy::connect(sprintf('pgsql:host=%s;port=%d;dbname=%s', $settings['host'], $settings['port'], $this->database), $settings['username'], $settings['password']);

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
        $failing = function (PDO $pdo, int $sub) {
            ($this->hook())($pdo, $sub, null);

            throw new RuntimeException('the copy of their data could not be written');
        };
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

        // A hook of before 0.4.2, with a transaction of its own, is told what to change.
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
        Feedback::deleteOn($this->pdo, $bob);
        $this->audit->record(null, 1, 'feedback.deleted', 'feedback', $bob, ['kind' => 'bug', 'status' => 'new']);
        self::assertSame([7], $this->deleted);

        $result = $backups->restore($backup['id'], 1);

        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertNull($result['after_restore_error']);
        self::assertSame([7, 7], $this->deleted, 'alice\'s delete done again - and only hers');
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM progress WHERE user_id = 7'), 'her progress is gone again');
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM progress WHERE user_id = 8'), 'bob\'s, never deleted, came back with the backup');
        self::assertSame([null, null, 'The quiz is great'], $this->feedbackOf($alice), 'her feedback forgotten again');
        self::assertSame(0, (int) $this->value("SELECT count(*) FROM anotoki_feedback WHERE id = $bob"), 'bob\'s message deleted again');
        self::assertSame([], $this->later, 'the scrub went through: nothing put off');
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
        self::assertNotNull(\Anotoki\Lib\People\Scrubber::status($this->pdo)['ok_at']);
    }

    public function testTheSitesOwnWorkRunsAfterAndItsFailureIsSaidToo(): void
    {
        $backups = $this->backups($this->people->afterRestore(
            delete: $this->hook(),
            defer: function (callable $work): void {
                $this->later[] = $work;
            },
            then: static function (array $manifest, PDO $pdo): void {
                throw new RuntimeException('Not every progress took a new generation.');
            },
        ));
        $backup = $backups->create(Backups::MANUAL, null, 1);
        $this->iam->anonymized(null);

        $result = $backups->restore($backup['id'], 1);

        self::assertIsArray($result);
        self::assertStringStartsWith('The accounts the IAM deleted were not checked again (', (string) $result['after_restore_error']);
        self::assertStringEndsWith('on the People page. Not every progress took a new generation.', (string) $result['after_restore_error'], 'the scrub\'s, then the site\'s own');
    }

    /** The site's delete hook: their progress, by the page's label; null for nobody here. */
    private function hook(): Closure
    {
        return function (PDO $pdo, int $sub, ?ServerRequestInterface $request = null): ?array {
            $this->deleted[] = $sub;
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

    private function backups(?Closure $afterRestore = null): Backups
    {
        $connection = $this->connection;

        return new Backups(static fn (): PDO => $connection, $this->path('storage') . '/backups', [
            'site' => 'piano',
            'migrator' => fn (PDO $pdo): Migrator => $this->siteMigrator($pdo),
            'audit' => new AuditLog(static fn (): PDO => $connection),
            'afterRestore' => $afterRestore ?? $this->people->afterRestore(delete: $this->hook(), defer: function (callable $work): void {
                $this->later[] = $work;
            }),
            'onError' => static function (): void {
            },
        ]);
    }

    private function siteMigrator(PDO $pdo): Migrator
    {
        return new Migrator($pdo, [AdminSchema::migrationSet(), $this->set('site'), Schema::migrationSet()]);
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

    /** @return array{?string, ?string, string} the message's address, browser and words */
    private function feedbackOf(int $id): array
    {
        $row = $this->pdo->query("SELECT contact_email, user_agent, message FROM anotoki_feedback WHERE id = $id")->fetch(PDO::FETCH_NUM);

        return [$row[0], $row[1], $row[2]];
    }
}
