<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\People;

use Anotoki\Lib\Auth\Testing\StandInIam;
use Anotoki\Lib\Auth\Testing\TestIam;
use Anotoki\Lib\People\AnonymizedAccounts;
use Anotoki\Lib\People\People;
use Anotoki\Lib\People\Schema;
use Anotoki\Lib\People\Scrubber;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\LogLines;
use Anotoki\Lib\Tests\Support\SiteShapes;
use PDO;
use RuntimeException;

/**
 * The scrub: every site's shape, ids never seen, an id seen twice, the same second as since, the hooks
 * and a hook that fails, an IAM that is down or answers garbage, the column missing, visitors never
 * touched, paging, the run's time, one run at a time, a restored backup - and never a DELETE.
 */
final class ScrubberTest extends DatabaseTestCase
{
    private TestIam $iam;

    /** @var list<array{int, ?array<string, mixed>}> what the hook was given */
    private array $hooked = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->iam = TestIam::create($this->path('iam'), 'https://iam.test', 'test-site');
    }

    protected function tearDown(): void
    {
        LogLines::take();
        parent::tearDown();
    }

    public function testEverySitesPeopleAreScrubbedAndTheirDataStays(): void
    {
        foreach (SiteShapes::SITES as $site) {
            $this->pdo->exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
            SiteShapes::create($this->pdo, $site);
            $this->applyPeopleSet();
            $this->people($site, 12, 'alice');
            $this->people($site, 30, 'bob');
            $this->people($site, 40, 'carol');
            SiteShapes::visitor($this->pdo, $site, -12);
            $visitors = $this->rows('SELECT * FROM users WHERE id < 0');
            $count = (int) $this->value('SELECT count(*) FROM users');
            $this->iam->anonymized(['12' => '2026-11-06T10:00:00Z', '30' => '2026-11-06T10:00:00Z', '99' => '2026-11-07T08:00:00Z']);

            $result = $this->scrubber($site)->run();

            self::assertSame(['state' => 'done', 'handled' => 3, 'scrubbed' => 2, 'error' => null, 'problems' => []], $result, $site);
            $name = SiteShapes::table($site)->name;
            self::assertSame([
                ['id' => 12, 'name' => 'deleted-12', 'at' => '2026-11-06 10:00:00'],
                ['id' => 30, 'name' => 'deleted-30', 'at' => '2026-11-06 10:00:00'],
                ['id' => 40, 'name' => 'carol', 'at' => null],
            ], $this->rows("SELECT id, $name AS name, to_char(anonymized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS at FROM users WHERE id IN (12, 30, 40) ORDER BY id"), $site);
            self::assertSame($visitors, $this->rows('SELECT * FROM users WHERE id < 0'), "$site: a visitor - even one whose id is minus a deleted one's - is never touched");
            self::assertSame($count, (int) $this->value('SELECT count(*) FROM users'), "$site: no row deleted");
            self::assertSame([
                ['sub' => 12, 'had_row' => true],
                ['sub' => 30, 'had_row' => true],
                ['sub' => 99, 'had_row' => false],
            ], $this->rows('SELECT sub, had_row FROM anotoki_people_anonymized ORDER BY sub'), "$site: every id the IAM listed, known here or not");
            $sync = Scrubber::status($this->pdo);
            self::assertSame('2026-11-07T08:00:00Z', $sync['since'], $site);
            self::assertSame(2, $sync['scrubbed'], $site);
            self::assertNull($sync['error'], $site);
            self::assertNotNull($sync['ok_at'], $site);
        }
    }

    public function testItIsIdempotentAndTheSameSecondComesAgain(): void
    {
        SiteShapes::create($this->pdo, 'piano');
        $this->applyPeopleSet();
        $this->people('piano', 12, 'alice');
        $this->people('piano', 30, 'bob');
        $this->iam->anonymized(['12' => '2026-11-06T10:00:00Z']);
        $hooks = [$this->hook(...)];

        self::assertSame(1, $this->scrubber('piano', $hooks)->run()['scrubbed']);
        self::assertSame([[12, ['name' => 'alice', 'anonymized_at' => null]]], $this->hooked, 'the hook gets the row as it was');

        // The IAM deletes 30 in the same second as since: since is inclusive, so it is found - and 12 comes again.
        $this->iam->anonymized(['12' => '2026-11-06T10:00:00Z', '30' => '2026-11-06T10:00:00Z']);
        $this->hooked = [];
        $again = $this->scrubber('piano', $hooks)->run();
        self::assertSame(['state' => 'done', 'handled' => 2, 'scrubbed' => 1, 'error' => null, 'problems' => []], $again);
        self::assertSame([
            [12, ['name' => 'deleted-12', 'anonymized_at' => '2026-11-06T10:00:00Z']],
            [30, ['name' => 'bob', 'anonymized_at' => null]],
        ], $this->hooked, 'an id seen twice: the hook again, with the row already scrubbed');
        self::assertSame(2, Scrubber::status($this->pdo)['scrubbed']);
        self::assertSame('2026-11-06T10:00:00Z', Scrubber::status($this->pdo)['since']);
        self::assertSame(['deleted-12', 'deleted-30'], $this->column('SELECT preferred_username FROM users ORDER BY id'));
    }

    public function testANameSomebodyTookIsNoReasonToStop(): void
    {
        // A site whose name column is UNIQUE (genshin's username, any case): somebody calls themselves deleted-12.
        SiteShapes::create($this->pdo, 'genshin');
        $this->pdo->exec('CREATE UNIQUE INDEX users_username_unique ON users (lower(username))');
        $this->applyPeopleSet();
        $this->people('genshin', 12, 'alice');
        $this->people('genshin', 13, 'DELETED-12');
        $this->people('genshin', 30, 'bob');
        $this->iam->anonymized(['12' => '2026-11-06T10:00:00Z', '30' => '2026-11-06T11:00:00Z']);
        $hooks = [$this->hook(...)];

        $result = $this->scrubber('genshin', $hooks)->run();

        self::assertSame(['state' => 'done', 'handled' => 2, 'scrubbed' => 2, 'error' => null, 'problems' => []], $result, 'the run goes on, past the name taken');
        [$twelve, $thirteen, $thirty] = $this->column('SELECT username FROM users WHERE id > 0 ORDER BY id');
        self::assertMatchesRegularExpression('/^deleted-12-[0-9a-f]{8}$/D', $twelve, 'the IAM\'s free form of the placeholder');
        self::assertSame(['DELETED-12', 'deleted-30'], [$thirteen, $thirty], 'the one who chose the name keeps it; the next account is as ever');
        self::assertNotNull($this->value('SELECT anonymized_at FROM users WHERE id = 12'));
        self::assertSame([12, 30], array_column($this->hooked, 0), 'the hooks ran once for each account');
        self::assertSame('2026-11-06T11:00:00Z', Scrubber::status($this->pdo)['since']);

        // Done once: the next run finds it scrubbed, and renames nothing again.
        self::assertSame(0, $this->scrubber('genshin', $hooks)->run()['scrubbed']);
        self::assertSame($twelve, $this->value('SELECT username FROM users WHERE id = 12'));
    }

    public function testAHookThatFailsRollsItsAccountBackAndStopsTheRun(): void
    {
        SiteShapes::create($this->pdo, 'genshin');
        $this->applyPeopleSet();
        foreach ([12 => 'alice', 30 => 'bob', 40 => 'carol'] as $sub => $name) {
            $this->people('genshin', $sub, $name);
            $this->pdo->prepare("INSERT INTO feedback (user_id, username, email, ip, user_agent, message) VALUES (?, ?, ?, '10.0.0.1', 'Firefox', 'The quiz is great')")
                ->execute([$sub, $name, "$name@example.test"]);
        }
        $this->iam->anonymized(['12' => '2026-11-06T10:00:00Z', '30' => '2026-11-06T11:00:00Z', '40' => '2026-11-06T12:00:00Z']);
        $broken = true;
        $feedback = function (PDO $pdo, int $sub, ?array $former) use (&$broken): void {
            $pdo->prepare('UPDATE feedback SET username = ?, email = NULL, ip = NULL, user_agent = NULL WHERE user_id = ?')->execute(["deleted-$sub", $sub]);
            if ($broken && $sub === 30) {
                throw new RuntimeException('the feedback table is busy');
            }
        };

        $result = $this->scrubber('genshin', [$feedback])->run();

        self::assertSame('stopped', $result['state']);
        self::assertSame(1, $result['handled']);
        self::assertSame('The scrub of account 30 failed: the feedback table is busy', $result['error']);
        self::assertSame(['deleted-12', 'bob', 'carol'], $this->column('SELECT username FROM users ORDER BY id'), 'account 30 rolled back whole');
        self::assertSame([
            ['user_id' => 12, 'username' => 'deleted-12', 'email' => null, 'ip' => null, 'user_agent' => null, 'message' => 'The quiz is great'],
            ['user_id' => 30, 'username' => 'bob', 'email' => 'bob@example.test', 'ip' => '10.0.0.1', 'user_agent' => 'Firefox', 'message' => 'The quiz is great'],
        ], $this->rows('SELECT user_id, username, email, ip, user_agent, message FROM feedback WHERE user_id IN (12, 30) ORDER BY user_id'), 'the words typed stay');
        self::assertSame([12], $this->column('SELECT sub FROM anotoki_people_anonymized'));
        $sync = Scrubber::status($this->pdo);
        self::assertSame('2026-11-06T10:00:00Z', $sync['since'], 'since stays before the account that failed');
        self::assertSame('The scrub of account 30 failed: the feedback table is busy', $sync['error'], 'kept for the People page');
        self::assertNull($sync['ok_at']);
        self::assertContains('[anotoki people] The scrub of account 30 failed: the feedback table is busy', LogLines::take());

        $broken = false;
        $next = $this->scrubber('genshin', [$feedback])->run();
        self::assertSame(['state' => 'done', 'handled' => 3, 'scrubbed' => 2, 'error' => null, 'problems' => []], $next, 'the next run takes it from there (12 again: the same second as since)');
        self::assertSame(['deleted-12', 'deleted-30', 'deleted-40'], $this->column('SELECT username FROM users ORDER BY id'));
        self::assertNull(Scrubber::status($this->pdo)['error']);
    }

    public function testAnIamThatIsDownOrAnswersGarbage(): void
    {
        SiteShapes::create($this->pdo, 'survey');
        $this->applyPeopleSet();
        $this->people('survey', 12, 'alice');
        $this->pdo->exec("UPDATE anotoki_people_sync SET since = '2026-11-01T00:00:00Z', ok_at = '2026-11-01T00:00:00Z'");
        $this->iam->anonymized(null);

        $down = $this->scrubber('survey')->run();

        self::assertSame(['state' => 'unreachable', 'handled' => 0, 'scrubbed' => 0, 'error' => 'The IAM could not be reached.', 'problems' => []], $down);
        $sync = Scrubber::status($this->pdo);
        self::assertSame(['2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', 'The IAM could not be reached.'], [$sync['since'], $sync['ok_at'], $sync['error']], 'since and ok_at kept');
        self::assertNotNull($sync['checked_at']);
        self::assertSame('alice', $this->value('SELECT preferred_username FROM users WHERE id = 12'));

        foreach ([
            'a 503' => [['status' => 503, 'body' => '{}'], 'The IAM answered 503.'],
            'a proxy\'s page' => [['status' => 200, 'body' => '<html></html>'], 'The IAM\'s answer could not be read.'],
            'an id that is none' => [['status' => 200, 'body' => '{"accounts": [{"sub": "-12", "anonymized_at": "2026-11-06T10:00:00Z"}], "next": null}'], 'The IAM\'s answer could not be read.'],
            'a time with a fraction' => [['status' => 200, 'body' => '{"accounts": [{"sub": "12", "anonymized_at": "2026-11-06T10:00:00.5Z"}], "next": null}'], 'The IAM\'s answer could not be read.'],
            'out of order' => [['status' => 200, 'body' => '{"accounts": [{"sub": "30", "anonymized_at": "2026-11-06T10:00:00Z"}, {"sub": "12", "anonymized_at": "2026-11-06T10:00:00Z"}], "next": null}'], 'The IAM\'s answer could not be read.'],
            'a next that does not move' => [['status' => 200, 'body' => '{"accounts": [{"sub": "12", "anonymized_at": "2026-11-01T00:00:00Z"}], "next": {"since": "2026-10-01T00:00:00Z", "after": "12"}}'], 'The IAM\'s answer could not be read.'],
        ] as $case => [$answer, $error]) {
            $scrubber = Scrubber::of($this->pdo, SiteShapes::table('survey'), $this->iam->client(['anonymized_file' => null]), [], static fn (): array => $answer);
            $result = $scrubber->run();
            self::assertSame(['unreachable', $error], [$result['state'], $result['error']], $case);
            self::assertSame('alice', $this->value('SELECT preferred_username FROM users WHERE id = 12'), $case);
        }
    }

    public function testIdleUntilTheColumnAndTheTablesAreThere(): void
    {
        SiteShapes::create($this->pdo, 'survey', adopted: false);
        $this->people('survey', 12, 'alice');
        $this->iam->anonymized(['12' => '2026-11-06T10:00:00Z']);

        $result = $this->scrubber('survey')->run();
        self::assertSame('not_ready', $result['state']);
        self::assertSame([
            'users has no column anonymized_at yet: the site\'s own migration adds it.',
            'The library\'s tables anotoki_people_sync and anotoki_people_anonymized are not there yet: the migration set anotoki_people makes them.',
        ], $result['problems']);
        self::assertNull(Scrubber::status($this->pdo));

        $this->applyPeopleSet();
        self::assertSame(['users has no column anonymized_at yet: the site\'s own migration adds it.'], $this->scrubber('survey')->run()['problems']);
        self::assertSame('alice', $this->value('SELECT preferred_username FROM users WHERE id = 12'));

        $this->pdo->exec('ALTER TABLE users ADD COLUMN anonymized_at TIMESTAMPTZ');
        self::assertSame('done', $this->scrubber('survey')->run()['state'], 'the catalog is asked on every run');
        self::assertSame('deleted-12', $this->value('SELECT preferred_username FROM users WHERE id = 12'));
    }

    public function testPagesAreFollowedWithinARunAndTheRunsTimeIsKept(): void
    {
        SiteShapes::create($this->pdo, 'build');
        $this->applyPeopleSet();
        foreach (range(1, 5) as $sub) {
            $this->people('build', $sub, "person $sub");
        }
        $standIn = StandInIam::start($this->path('stand-in'));
        try {
            $standIn->state(['anonymized_page' => 2, 'anonymized' => [
                ['sub' => '1', 'anonymized_at' => '2026-11-06T10:00:00Z'],
                ['sub' => '2', 'anonymized_at' => '2026-11-06T10:00:00Z'],
                ['sub' => '3', 'anonymized_at' => '2026-11-06T10:00:00Z'],
                ['sub' => '4', 'anonymized_at' => '2026-11-06T11:00:00Z'],
            ]]);
            $people = new People(SiteShapes::table('build'), fn (): PDO => $this->pdo, $standIn->client());

            $result = $people->scrubber()->run();
            self::assertSame(['state' => 'done', 'handled' => 4, 'scrubbed' => 4], array_slice($result, 0, 3));
            self::assertSame([
                'GET /api/public/anonymized-accounts',
                'GET /api/public/anonymized-accounts',
            ], array_values(array_filter($standIn->log(), static fn (string $line): bool => str_contains($line, 'anonymized'))), 'two pages, by next, in one run');
            self::assertSame(['deleted-1', 'deleted-2', 'deleted-3', 'deleted-4', 'person 5'], $this->column('SELECT name FROM users ORDER BY id'));
            self::assertSame(4, (int) $this->value("SELECT count(*) FROM users WHERE updated_at > now() - interval '1 minute' AND id < 5"), 'updated_at stamped');

            // A run with no time left stops after a page; the next goes on from since.
            $standIn->state(['anonymized' => [...$standIn->state()['anonymized'], ['sub' => '5', 'anonymized_at' => '2026-11-07T00:00:00Z'], ['sub' => '6', 'anonymized_at' => '2026-11-07T00:00:01Z'], ['sub' => '7', 'anonymized_at' => '2026-11-07T00:00:02Z']]]);
            $hurried = new Scrubber($this->pdo, SiteShapes::table('build'), new AnonymizedAccounts($standIn->client()), [], budget: 0.0);
            self::assertSame('more', $hurried->run()['state'], 'one page (4 again, and 5), then no time left');
            self::assertSame('2026-11-07T00:00:00Z', Scrubber::status($this->pdo)['since'], 'the newest of the page it handled');
            self::assertSame('deleted-5', $this->value('SELECT name FROM users WHERE id = 5'));
            self::assertSame('done', $people->scrubber()->run()['state']);
            self::assertSame('2026-11-07T00:00:02Z', Scrubber::status($this->pdo)['since']);
            self::assertSame([['sub' => 6, 'had_row' => false], ['sub' => 7, 'had_row' => false]], $this->rows('SELECT sub, had_row FROM anotoki_people_anonymized WHERE sub > 5 ORDER BY sub'), 'ids this site never knew');
        } finally {
            $standIn->stop();
        }
    }

    public function testOneRunAtATime(): void
    {
        SiteShapes::create($this->pdo, 'survey');
        $this->applyPeopleSet();
        $other = $this->connect();
        $other->query('SELECT pg_advisory_lock(' . Scrubber::LOCK . ')');

        self::assertSame('busy', $this->scrubber('survey')->run()['state']);
        $other->query('SELECT pg_advisory_unlock(' . Scrubber::LOCK . ')');
        $this->iam->anonymized([]);
        self::assertSame('done', $this->scrubber('survey')->run()['state']);
    }

    public function testARestoredBackupIsScrubbedAgain(): void
    {
        SiteShapes::create($this->pdo, 'japanese');
        $this->applyPeopleSet();
        $this->people('japanese', 12, 'alice');
        $this->pdo->exec("INSERT INTO exam_attempts (user_id, candidate, meta) VALUES (12, 'Alice Smith', '{\"candidate\": \"Alice Smith\", \"score\": 9}')");
        $this->iam->anonymized(['12' => '2026-11-06T10:00:00Z']);
        $exam = static function (PDO $pdo, int $sub): void {
            // Japanese Academy's: the name typed for the report is a name; the attempt stays.
            $pdo->prepare("UPDATE exam_attempts SET candidate = '', meta = meta - 'candidate' WHERE user_id = ? AND (candidate <> '' OR jsonb_exists(meta, 'candidate'))")->execute([$sub]);
        };

        $this->scrubber('japanese', [$exam])->run();
        self::assertSame([['candidate' => '', 'meta' => '{"score": 9}']], $this->rows('SELECT candidate, meta FROM exam_attempts'));

        // The database as a backup from before the scrub had it: the names, its own cursor, its own list.
        $this->pdo->exec("UPDATE users SET preferred_username = 'alice', anonymized_at = NULL WHERE id = 12");
        $this->pdo->exec("UPDATE exam_attempts SET candidate = 'Alice Smith', meta = '{\"candidate\": \"Alice Smith\", \"score\": 9}'");
        $this->pdo->exec('DELETE FROM anotoki_people_anonymized');
        $this->pdo->exec('UPDATE anotoki_people_sync SET since = NULL');

        self::assertSame(1, $this->scrubber('japanese', [$exam])->run()['scrubbed']);
        self::assertSame('deleted-12', $this->value('SELECT preferred_username FROM users WHERE id = 12'));
        self::assertSame([['candidate' => '', 'meta' => '{"score": 9}']], $this->rows('SELECT candidate, meta FROM exam_attempts'));
    }

    public function testNeverInsideACallersTransaction(): void
    {
        SiteShapes::create($this->pdo, 'survey');
        $this->applyPeopleSet();
        $this->pdo->beginTransaction();

        $this->expectException(\LogicException::class);
        $this->scrubber('survey')->run();
    }

    private function applyPeopleSet(): void
    {
        $result = $this->migrator([$this->set('site'), Schema::migrationSet()])->apply();
        self::assertNull($result['error'], (string) $result['error']);
    }

    /** @param list<\Closure> $hooks */
    private function scrubber(string $site, array $hooks = []): Scrubber
    {
        return (new People(SiteShapes::table($site), fn (): PDO => $this->pdo, $this->iam->client(), $hooks))->scrubber();
    }

    /** A person of the site, as its recorder would have made them. */
    private function people(string $site, int $sub, string $name): void
    {
        $table = SiteShapes::table($site);
        $this->pdo->prepare("INSERT INTO users (id, {$table->name}) VALUES (?, ?)")->execute([$sub, $name]);
    }

    /** @param ?array<string, mixed> $former */
    private function hook(PDO $pdo, int $sub, ?array $former): void
    {
        $this->hooked[] = [$sub, $former];
    }

    /** @return list<mixed> */
    private function column(string $sql): array
    {
        return $this->pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN);
    }
}
