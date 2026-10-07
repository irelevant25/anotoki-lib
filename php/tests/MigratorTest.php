<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests;

use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use InvalidArgumentException;
use LogicException;
use PDO;
use PDOException;
use RuntimeException;

final class MigratorTest extends DatabaseTestCase
{
    /** The IAM's, the survey's, Piano Academy's and the build analyzer's table, as their own code made it. */
    private const FILENAME_TABLE = 'CREATE TABLE migrations (
        id         SERIAL          PRIMARY KEY,
        filename   VARCHAR(255)    NOT NULL UNIQUE,
        applied_at TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
    )';

    /** The genshin site's: two sets, told apart by folder. */
    private const FOLDER_TABLE = 'CREATE TABLE migrations (
        id         SERIAL          PRIMARY KEY,
        folder     VARCHAR(64)     NOT NULL,
        filename   VARCHAR(255)    NOT NULL,
        applied_at TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (folder, filename)
    )';

    /** Japanese Academy's: the file in `name`, a TIMESTAMPTZ, no id. */
    private const NAME_TABLE = 'CREATE TABLE migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
    )';

    // ─── Construction and files ─────────────────────────────────────────────

    public function testRefusesAMisconfiguration(): void
    {
        $set = $this->set('site');
        $refused = function (callable $make, string $why): void {
            try {
                $make();
                self::fail("Not refused: $why");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        };

        $refused(fn () => new Migrator($this->pdo, []), 'no set');
        $refused(fn () => new Migrator($this->pdo, ['a' => $set]), 'not a list');
        $refused(fn () => new Migrator($this->pdo, [$set, new MigrationSet('site', $this->path('other'))]), 'two sets of one name');
        $refused(fn () => new Migrator($this->pdo, [new MigrationSet('', $this->path('x'))]), 'a set without a name');
        $refused(fn () => new Migrator($this->pdo, ['not a set']), 'not a MigrationSet');
        $refused(fn () => new Migrator($this->pdo, [$set], ['tabel' => 'migrations']), 'an unknown option');
        $refused(fn () => new Migrator($this->pdo, [$set], ['table' => 'migrations; DROP TABLE x']), 'a table name that is no name');
        $refused(fn () => new Migrator($this->pdo, [$set], ['lock' => '42']), 'a lock that is no integer');
        $refused(fn () => new Migrator($this->pdo, [$set], ['split' => 'no']), 'split that is no bool');
        $refused(fn () => new Migrator($this->pdo, [$set], ['ready' => 'no such function']), 'a hook that cannot be called');

        $silent = $this->connect();
        $silent->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);
        $refused(fn () => new Migrator($silent, [$set]), 'a connection that does not throw');
    }

    public function testFilesAreTheSqlFilesDirectlyInTheFolderInNaturalOrder(): void
    {
        $set = $this->set('site', [
            '10_ten.sql' => '',
            '2_two.sql' => '',
            '100_hundred.sql' => '',
            '1_one.sql' => '',
            'notes.txt' => '',
            '.hidden.sql' => '',
            'draft.sql.bak' => '',
        ]);
        mkdir($set->directory . '/sub');
        file_put_contents($set->directory . '/sub/3_three.sql', '');
        mkdir($set->directory . '/4_folder.sql');

        $migrator = $this->migrator([$set]);

        self::assertSame(['1_one.sql', '2_two.sql', '10_ten.sql', '100_hundred.sql'], $migrator->files($set));
        self::assertSame([], $migrator->files(new MigrationSet('gone', $this->path('no-such-folder'))));
    }

    // ─── A new table ────────────────────────────────────────────────────────

    public function testANewDatabaseGetsTheOneSetTableAndEveryFileInOrder(): void
    {
        $set = $this->set('iam', [
            '2_second.sql' => 'CREATE TABLE b (id int); INSERT INTO b VALUES (1);',
            '10_third.sql' => 'INSERT INTO b VALUES (2);',
            '1_first.sql' => "-- the first\nCREATE TABLE a (id int);",
        ]);
        $migrator = $this->migrator([$set]);

        self::assertSame(
            [['set' => 'iam', 'name' => '1_first.sql'], ['set' => 'iam', 'name' => '2_second.sql'], ['set' => 'iam', 'name' => '10_third.sql']],
            $migrator->applicable()
        );
        self::assertFalse($this->tableExists('migrations'), 'reading made nothing');

        self::assertSame([
            'applied' => [['set' => 'iam', 'name' => '1_first.sql'], ['set' => 'iam', 'name' => '2_second.sql'], ['set' => 'iam', 'name' => '10_third.sql']],
            'failed' => null,
            'error' => null,
            'busy' => false,
            'note' => null,
        ], $migrator->apply());

        // The shape the sites' own code made: theirs is what a new table must look like.
        self::assertSame($this->referenceShape(self::FILENAME_TABLE), $this->shapeOf('migrations'));
        self::assertSame(['migrations_filename_key UNIQUE (filename)', 'migrations_pkey PRIMARY KEY (id)'], $this->shapeOf('migrations')['constraints']);
        self::assertSame(['1_first.sql', '2_second.sql', '10_third.sql'], $this->pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame([1, 2], array_map('intval', $this->pdo->query('SELECT id FROM b ORDER BY id')->fetchAll(PDO::FETCH_COLUMN)));
        self::assertTrue($this->tableExists('a'));

        self::assertSame([], $migrator->applicable());
        self::assertSame(['applied' => [], 'failed' => null, 'error' => null, 'busy' => false, 'note' => null], $migrator->apply());
    }

    public function testANewDatabaseWithTwoSetsGetsTheFolderTable(): void
    {
        $users = $this->set('users', ['001_initial_schema.sql' => 'CREATE TABLE people (id int);']);
        $genshin = $this->set('genshin_impact', [
            '001_initial_schema.sql' => 'CREATE TABLE characters (id int);',
            '002_more.sql' => 'ALTER TABLE characters ADD COLUMN name text;',
        ]);

        $result = $this->migrator([$users, $genshin])->apply();

        self::assertSame([
            ['set' => 'users', 'name' => '001_initial_schema.sql'],
            ['set' => 'genshin_impact', 'name' => '001_initial_schema.sql'],
            ['set' => 'genshin_impact', 'name' => '002_more.sql'],
        ], $result['applied']);
        self::assertSame($this->referenceShape(self::FOLDER_TABLE), $this->shapeOf('migrations'));
        self::assertSame(['migrations_folder_filename_key UNIQUE (folder, filename)', 'migrations_pkey PRIMARY KEY (id)'], $this->shapeOf('migrations')['constraints']);
        self::assertSame(
            [['folder' => 'users', 'filename' => '001_initial_schema.sql'], ['folder' => 'genshin_impact', 'filename' => '001_initial_schema.sql'], ['folder' => 'genshin_impact', 'filename' => '002_more.sql']],
            $this->rows('SELECT folder, filename FROM migrations ORDER BY id')
        );
    }

    public function testATableOfAnotherName(): void
    {
        $set = $this->set('site', ['001_a.sql' => 'CREATE TABLE a (id int);']);

        $this->migrator([$set], ['table' => 'schema_migrations'])->apply();

        self::assertFalse($this->tableExists('migrations'));
        self::assertSame(['001_a.sql'], $this->pdo->query('SELECT filename FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN));
    }

    // ─── Every existing shape, read and written as it is ───────────────────

    public function testAdoptsTheFilenameShapeWithoutChangingIt(): void
    {
        $this->pdo->exec(self::FILENAME_TABLE);
        $this->pdo->exec("INSERT INTO migrations (filename, applied_at) VALUES ('001_initial.sql', '2026-09-28 10:00:00')");
        $before = $this->shapeOf('migrations');
        $set = $this->set('survey', ['001_initial.sql' => 'CREATE TABLE never (id int);', '002_next.sql' => 'CREATE TABLE next (id int);']);
        $migrator = $this->migrator([$set]);

        $status = $migrator->status();
        self::assertSame([['set' => 'survey', 'name' => '001_initial.sql', 'applied_at' => '2026-09-28T10:00:00Z']], $status['applied']);
        self::assertSame([['set' => 'survey', 'name' => '002_next.sql', 'ready' => true, 'blocked' => false]], $status['pending']);

        self::assertSame([['set' => 'survey', 'name' => '002_next.sql']], $migrator->apply()['applied']);
        self::assertSame($before, $this->shapeOf('migrations'));
        self::assertFalse($this->tableExists('never'), 'a recorded file never runs again');
        self::assertSame(['001_initial.sql', '002_next.sql'], $this->pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
    }

    public function testAdoptsTheFolderShapeWithoutChangingIt(): void
    {
        $this->pdo->exec(self::FOLDER_TABLE);
        $this->pdo->exec("INSERT INTO migrations (folder, filename) VALUES ('users', '001_initial_schema.sql'), ('genshin_impact', '001_initial_schema.sql')");
        $before = $this->shapeOf('migrations');
        $users = $this->set('users', ['001_initial_schema.sql' => 'SELECT 1/0;', '002_people.sql' => 'CREATE TABLE people (id int);']);
        $genshin = $this->set('genshin_impact', ['001_initial_schema.sql' => 'SELECT 1/0;', '002_characters.sql' => 'CREATE TABLE characters (id int);']);
        $migrator = $this->migrator([$users, $genshin]);

        self::assertSame(
            [['set' => 'users', 'name' => '002_people.sql'], ['set' => 'genshin_impact', 'name' => '002_characters.sql']],
            $migrator->applicable()
        );
        self::assertSame(
            [['set' => 'users', 'name' => '002_people.sql'], ['set' => 'genshin_impact', 'name' => '002_characters.sql']],
            $migrator->apply()['applied']
        );
        self::assertSame($before, $this->shapeOf('migrations'));
        self::assertSame(
            [
                ['folder' => 'users', 'filename' => '001_initial_schema.sql'],
                ['folder' => 'genshin_impact', 'filename' => '001_initial_schema.sql'],
                ['folder' => 'users', 'filename' => '002_people.sql'],
                ['folder' => 'genshin_impact', 'filename' => '002_characters.sql'],
            ],
            $this->rows('SELECT folder, filename FROM migrations ORDER BY id')
        );
    }

    public function testAdoptsTheNameShapeWithItsTimestamptzWithoutChangingIt(): void
    {
        $this->pdo->exec(self::NAME_TABLE);
        $this->pdo->exec(
            "INSERT INTO migrations (name, applied_at) VALUES
                ('002_b.sql', '2026-10-01 08:00:00+00'),
                ('001_a.sql', '2026-10-01 08:00:00+00'),
                ('000_init.sql', '2026-09-30 12:00:00+02')"
        );
        $before = $this->shapeOf('migrations');
        $set = $this->set('academy', [
            '000_init.sql' => '',
            '001_a.sql' => '',
            '002_b.sql' => '',
            '003_c.sql' => "CREATE TABLE c (id int);\n-- end of 003\n",
        ]);
        $migrator = $this->migrator([$set], ['split' => false]);

        // No id: in the order they ran, then by name.
        self::assertSame([
            ['set' => 'academy', 'name' => '000_init.sql', 'applied_at' => '2026-09-30T10:00:00Z'],
            ['set' => 'academy', 'name' => '001_a.sql', 'applied_at' => '2026-10-01T08:00:00Z'],
            ['set' => 'academy', 'name' => '002_b.sql', 'applied_at' => '2026-10-01T08:00:00Z'],
        ], $migrator->status()['applied']);

        self::assertSame([['set' => 'academy', 'name' => '003_c.sql']], $migrator->apply()['applied']);
        self::assertSame($before, $this->shapeOf('migrations'));
        self::assertTrue($this->tableExists('c'));
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM migrations WHERE name = '003_c.sql'"));
    }

    public function testATableWithoutFolderCannotKeepTwoSetsApart(): void
    {
        $this->pdo->exec(self::FILENAME_TABLE);
        $migrator = $this->migrator([$this->set('users'), $this->set('genshin_impact')]);

        try {
            $migrator->status();
            self::fail('status() read two sets from one list');
        } catch (LogicException $e) {
            self::assertStringContainsString('no folder column', $e->getMessage());
        }

        $this->expectException(LogicException::class);
        $migrator->apply();
    }

    public function testATableItCannotReadIsNothingAppliedUntilPrepareAdoptsIt(): void
    {
        // The build analyzer's first version was a Laravel application, with a `migrations` table of its own.
        $this->pdo->exec('CREATE TABLE migrations (id SERIAL PRIMARY KEY, migration VARCHAR(255) NOT NULL, batch INT NOT NULL)');
        $this->pdo->exec("INSERT INTO migrations (migration, batch) VALUES ('2024_01_01_000000_create_users_table', 1)");
        $set = $this->set('analyzer', ['001_adopt.sql' => 'CREATE TABLE adopted (id int);']);

        $status = $this->migrator([$set])->status();
        self::assertSame([], $status['applied']);
        self::assertSame([['set' => 'analyzer', 'name' => '001_adopt.sql', 'ready' => true, 'blocked' => false]], $status['pending']);
        self::assertSame([], $status['missing']);

        try {
            $this->migrator([$set])->apply();
            self::fail('applied over a table it cannot read');
        } catch (LogicException $e) {
            self::assertStringContainsString('neither a filename nor a name column', $e->getMessage());
        }

        $result = $this->migrator([$set], [
            'prepare' => function (PDO $pdo): void {
                $hasFilename = $pdo->query("SELECT count(*) FROM information_schema.columns WHERE table_name = 'migrations' AND column_name = 'filename'")->fetchColumn();
                if ((int) $hasFilename === 0) {
                    $pdo->exec('ALTER TABLE migrations RENAME TO laravel_migrations');
                }
            },
        ])->apply();

        self::assertSame([['set' => 'analyzer', 'name' => '001_adopt.sql']], $result['applied']);
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM laravel_migrations'));
        self::assertSame(['001_adopt.sql'], $this->pdo->query('SELECT filename FROM migrations')->fetchAll(PDO::FETCH_COLUMN));
    }

    // ─── Status ─────────────────────────────────────────────────────────────

    public function testStatusTellsAppliedPendingAndMissingWithoutWriting(): void
    {
        $this->pdo->exec(self::FILENAME_TABLE);
        $this->pdo->exec(
            "INSERT INTO migrations (filename, applied_at) VALUES
                ('002_b.sql', '2026-10-02 09:00:00'), ('001_a.sql', '2026-10-01 09:00:00'), ('005_gone.sql', '2026-10-03 09:00:00')"
        );
        $set = $this->set('site', ['001_a.sql' => '', '002_b.sql' => '', '003_c.sql' => '', '004_d.sql' => '']);
        $prepared = 0;
        $migrator = $this->migrator([$set], ['prepare' => function () use (&$prepared): void {
            $prepared++;
        }]);

        self::assertSame([
            'sets' => ['site'],
            // By id: the order they ran, whatever their names say.
            'applied' => [
                ['set' => 'site', 'name' => '002_b.sql', 'applied_at' => '2026-10-02T09:00:00Z'],
                ['set' => 'site', 'name' => '001_a.sql', 'applied_at' => '2026-10-01T09:00:00Z'],
            ],
            'pending' => [
                ['set' => 'site', 'name' => '003_c.sql', 'ready' => true, 'blocked' => false],
                ['set' => 'site', 'name' => '004_d.sql', 'ready' => true, 'blocked' => false],
            ],
            'missing' => [['set' => 'site', 'name' => '005_gone.sql', 'applied_at' => '2026-10-03T09:00:00Z']],
        ], $migrator->status());
        self::assertSame([['set' => 'site', 'name' => '003_c.sql'], ['set' => 'site', 'name' => '004_d.sql']], $migrator->applicable());
        self::assertSame(0, $prepared, 'prepare is for writing');
        self::assertSame(3, (int) $this->value('SELECT count(*) FROM migrations'));
    }

    public function testWithoutATableEveryFileIsPendingAndNothingIsMade(): void
    {
        $users = $this->set('users', ['001_a.sql' => '']);
        $genshin = $this->set('genshin_impact', ['001_a.sql' => '']);

        self::assertSame([
            'sets' => ['users', 'genshin_impact'],
            'applied' => [],
            'pending' => [
                ['set' => 'users', 'name' => '001_a.sql', 'ready' => true, 'blocked' => false],
                ['set' => 'genshin_impact', 'name' => '001_a.sql', 'ready' => true, 'blocked' => false],
            ],
            'missing' => [],
        ], $this->migrator([$users, $genshin])->status());
        self::assertFalse($this->tableExists('migrations'));
    }

    // ─── Apply ──────────────────────────────────────────────────────────────

    public function testAFailedFileIsRolledBackWholeAndNothingAfterItRuns(): void
    {
        $failing = "INSERT INTO nowhere (id)\nVALUES\n  (1),\n  (2),\n  (3),\n  (4),\n  (5),\n  (6)";
        $users = $this->set('users', [
            '001_a.sql' => 'CREATE TABLE a (id int);',
            '002_b.sql' => "CREATE TABLE b (id int);\n\n-- this one fails\n$failing;\n\nCREATE TABLE b2 (id int);",
            '003_c.sql' => 'CREATE TABLE c (id int);',
        ]);
        $genshin = $this->set('genshin_impact', ['001_d.sql' => 'CREATE TABLE d (id int);']);

        try {
            $this->connect()->exec($failing);
            self::fail('the failing statement did not fail');
        } catch (PDOException $e) {
            $message = $e->getMessage();
        }

        $result = $this->migrator([$users, $genshin])->apply();

        self::assertSame([['set' => 'users', 'name' => '001_a.sql']], $result['applied']);
        self::assertSame(['set' => 'users', 'name' => '002_b.sql'], $result['failed']);
        self::assertSame(
            "statement 2 of 3: $message\n\n  INSERT INTO nowhere (id)\n  VALUES\n    (1),\n    (2),\n    (3),\n    (4),",
            $result['error']
        );
        self::assertFalse($result['busy']);
        self::assertTrue($this->tableExists('a'));
        self::assertFalse($this->tableExists('b'), 'the failed file is rolled back whole');
        self::assertFalse($this->tableExists('c'), 'nothing after the failed file runs');
        self::assertFalse($this->tableExists('d'), 'later sets never run');
        self::assertSame([['folder' => 'users', 'filename' => '001_a.sql']], $this->rows('SELECT folder, filename FROM migrations'));
    }

    public function testBusyWhileAnotherConnectionHoldsTheLock(): void
    {
        $set = $this->set('site', ['001_a.sql' => 'CREATE TABLE a (id int);']);
        $other = $this->connect();
        $other->query('SELECT pg_advisory_lock(' . Migrator::DEFAULT_LOCK . ')');
        $prepared = false;
        $migrator = $this->migrator([$set], ['prepare' => function () use (&$prepared): void {
            $prepared = true;
        }]);

        self::assertSame(['applied' => [], 'failed' => null, 'error' => null, 'busy' => true, 'note' => null], $migrator->apply());
        self::assertFalse($prepared, 'busy does nothing at all');
        self::assertFalse($this->tableExists('migrations'));
        self::assertFalse($this->tableExists('a'));

        // A site with a lock of its own does not wait for the default one.
        self::assertSame([['set' => 'site', 'name' => '001_a.sql']], $this->migrator([$set], ['lock' => 3_300_008_500])->apply()['applied']);

        // Its own lock held elsewhere: busy; let go: it runs, and lets go of the lock itself.
        $other->query('SELECT pg_advisory_lock(3300008500)');
        $this->set('site', ['002_b.sql' => 'CREATE TABLE b (id int);']);
        self::assertTrue($this->migrator([$set], ['lock' => 3_300_008_500])->apply()['busy']);
        $other->query('SELECT pg_advisory_unlock(3300008500)');
        self::assertSame([['set' => 'site', 'name' => '002_b.sql']], $this->migrator([$set], ['lock' => 3_300_008_500])->apply()['applied']);
        self::assertSame(1, (int) $other->query('SELECT CASE WHEN pg_try_advisory_lock(3300008500) THEN 1 ELSE 0 END')->fetchColumn());
    }

    public function testAFileRecordedMeanwhileIsSkipped(): void
    {
        $set = $this->set('site', [
            '001_a.sql' => 'CREATE TABLE a (id int);',
            '002_b.sql' => 'SELECT 1/0;',
            '003_c.sql' => 'CREATE TABLE c (id int);',
        ]);
        $other = $this->connect();

        $result = $this->migrator([$set], ['beforeApply' => function () use ($other): ?string {
            // Another way of applying finishes 002 while this one starts.
            $other->exec("INSERT INTO migrations (filename) VALUES ('002_b.sql')");

            return null;
        }])->apply();

        self::assertSame([['set' => 'site', 'name' => '001_a.sql'], ['set' => 'site', 'name' => '003_c.sql']], $result['applied']);
        self::assertNull($result['failed']);
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM migrations WHERE filename = '002_b.sql'"));
        self::assertTrue($this->tableExists('c'));
    }

    public function testDraftsWaitAndSoDoesEverythingAfterThem(): void
    {
        $users = $this->set('users', [
            '001_a.sql' => "CREATE TABLE a (id int);\n-- end of 001\n",
            '002_b.sql' => "CREATE TABLE b (id int);\n-- still being written\n",
            '003_c.sql' => "CREATE TABLE c (id int);\n-- end of 003\n",
            '004_d.sql' => "CREATE TABLE d (id int);\n",
        ]);
        $genshin = $this->set('genshin_impact', ['001_e.sql' => "CREATE TABLE e (id int);\n-- end of 001\n"]);
        $asked = [];
        // Japanese Academy's rule: a file is whole once its last line is "-- end of NNN".
        $ready = function (MigrationSet $set, string $name, string $sql) use (&$asked): bool {
            $asked[] = $set->name . '/' . $name;
            $lines = preg_split('/\R/', rtrim($sql));

            return end($lines) === '-- end of ' . substr($name, 0, 3);
        };
        $migrator = $this->migrator([$users, $genshin], ['ready' => $ready]);

        self::assertSame([
            ['set' => 'users', 'name' => '001_a.sql', 'ready' => true, 'blocked' => false],
            ['set' => 'users', 'name' => '002_b.sql', 'ready' => false, 'blocked' => false],
            ['set' => 'users', 'name' => '003_c.sql', 'ready' => true, 'blocked' => true],
            ['set' => 'users', 'name' => '004_d.sql', 'ready' => false, 'blocked' => true],
            ['set' => 'genshin_impact', 'name' => '001_e.sql', 'ready' => true, 'blocked' => true],
        ], $migrator->status()['pending']);
        self::assertSame(['users/001_a.sql', 'users/002_b.sql', 'users/003_c.sql', 'users/004_d.sql', 'genshin_impact/001_e.sql'], $asked);

        self::assertSame([['set' => 'users', 'name' => '001_a.sql']], $migrator->applicable());
        $result = $migrator->apply();
        self::assertSame([['set' => 'users', 'name' => '001_a.sql']], $result['applied']);
        self::assertNull($result['failed']);
        self::assertFalse($this->tableExists('b'));
        self::assertFalse($this->tableExists('e'));
        self::assertSame([], $migrator->applicable());

        // The draft finished: it runs, and what waited behind it up to the next draft.
        file_put_contents($users->directory . '/002_b.sql', "CREATE TABLE b (id int);\n-- end of 002\n");
        self::assertSame([['set' => 'users', 'name' => '002_b.sql'], ['set' => 'users', 'name' => '003_c.sql']], $migrator->apply()['applied']);
        self::assertSame([['set' => 'users', 'name' => '004_d.sql', 'ready' => false, 'blocked' => false], ['set' => 'genshin_impact', 'name' => '001_e.sql', 'ready' => true, 'blocked' => true]], $migrator->status()['pending']);
    }

    public function testWithoutSplittingTheWholeFileGoesInOneExec(): void
    {
        // PostgreSQL nests block comments; the splitter does not: only the whole file reads right.
        $set = $this->set('academy', [
            '001_a.sql' => "CREATE TABLE a (id int); /* outer /* inner; */ still a comment; */ CREATE TABLE b (id int);",
        ]);
        self::assertSame([['set' => 'academy', 'name' => '001_a.sql']], $this->migrator([$set], ['split' => false])->apply()['applied']);
        self::assertTrue($this->tableExists('a'));
        self::assertTrue($this->tableExists('b'));

        $whole = "CREATE TABLE c (id int);\nINSERT INTO nowhere VALUES (1);";
        $this->set('academy', ['002_c.sql' => $whole]);
        $reference = $this->connect();
        $reference->beginTransaction();
        try {
            $reference->exec($whole);
            self::fail('the failing file did not fail');
        } catch (PDOException $e) {
            $message = $e->getMessage();
        }
        $reference->rollBack();
        $result = $this->migrator([$set], ['split' => false])->apply();

        self::assertSame(['set' => 'academy', 'name' => '002_c.sql'], $result['failed']);
        self::assertSame($message, $result['error'], 'the message alone');
        self::assertFalse($this->tableExists('c'));
    }

    public function testSplittingNamesTheStatementThatFailedInTheSameFile(): void
    {
        $set = $this->set('site', ['001_a.sql' => "CREATE TABLE a (id int); /* outer /* inner; */ still a comment; */ CREATE TABLE b (id int);"]);

        $result = $this->migrator([$set])->apply();

        self::assertSame(['set' => 'site', 'name' => '001_a.sql'], $result['failed']);
        self::assertStringStartsWith('statement 2 of 3: SQLSTATE[42601]', (string) $result['error']);
        self::assertStringEndsWith("\n\n  still a comment", (string) $result['error']);
        self::assertFalse($this->tableExists('a'));
    }

    // ─── Hooks ──────────────────────────────────────────────────────────────

    public function testPrepareAdoptsAnOldShapeBeforeAnythingIsWritten(): void
    {
        // Piano Academy's table once named its file column `name`.
        $this->pdo->exec('CREATE TABLE migrations (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        $this->pdo->exec("INSERT INTO migrations (name) VALUES ('001_a.sql')");
        $set = $this->set('piano', ['001_a.sql' => 'SELECT 1/0;', '002_b.sql' => 'CREATE TABLE b (id int);']);
        $calls = 0;
        $migrator = $this->migrator([$set], ['prepare' => function (PDO $pdo) use (&$calls): void {
            $calls++;
            $column = $pdo->query("SELECT column_name FROM information_schema.columns WHERE table_name = 'migrations' AND column_name IN ('name', 'filename')")->fetchColumn();
            if ($column === 'name') {
                $pdo->exec('ALTER TABLE migrations RENAME COLUMN name TO filename');
            }
        }]);

        // Read as it is, before any adoption.
        self::assertSame([['set' => 'piano', 'name' => '002_b.sql']], $migrator->applicable());
        self::assertSame(0, $calls);

        self::assertSame([['set' => 'piano', 'name' => '002_b.sql']], $migrator->apply()['applied']);
        self::assertSame(1, $calls);
        self::assertSame(['001_a.sql', '002_b.sql'], $this->pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));

        $migrator->ensureTable();
        self::assertSame(2, $calls, 'ensureTable() runs prepare first');
    }

    public function testBeforeFileRunsInsideEachFilesTransactionBeforeItsSql(): void
    {
        $this->pdo->exec('CREATE TABLE log (entry text)');
        $set = $this->set('site', [
            '001_a.sql' => "INSERT INTO log VALUES ('001 ran');",
            '002_b.sql' => "INSERT INTO log VALUES ('002 ran'); SELECT 1/0;",
        ]);
        $seen = [];

        $result = $this->migrator([$set], ['beforeFile' => function (PDO $pdo, MigrationSet $set, string $name) use (&$seen): void {
            $seen[] = [$set->name, $name, $pdo->inTransaction()];
            $pdo->prepare('INSERT INTO log VALUES (?)')->execute(["before $name"]);
        }])->apply();

        self::assertSame([['site', '001_a.sql', true], ['site', '002_b.sql', true]], $seen);
        self::assertSame(['set' => 'site', 'name' => '002_b.sql'], $result['failed']);
        // 002's own row went with its rollback.
        self::assertSame(['before 001_a.sql', '001 ran'], $this->pdo->query('SELECT entry FROM log')->fetchAll(PDO::FETCH_COLUMN));
    }

    public function testABeforeFileThatThrowsFailsItsFileAndWhatItWroteGoesWithIt(): void
    {
        $this->pdo->exec('CREATE TABLE log (entry text)');
        $set = $this->set('site', ['001_a.sql' => 'CREATE TABLE a (id int);', '002_b.sql' => 'CREATE TABLE b (id int);']);

        $result = $this->migrator([$set], ['beforeFile' => function (PDO $pdo, MigrationSet $set, string $name): void {
            $pdo->prepare('INSERT INTO log VALUES (?)')->execute(["before $name"]);
            if ($name === '002_b.sql') {
                throw new RuntimeException('Not now.');
            }
        }])->apply();

        self::assertSame([['set' => 'site', 'name' => '001_a.sql']], $result['applied']);
        self::assertSame(['set' => 'site', 'name' => '002_b.sql'], $result['failed']);
        self::assertSame('Not now.', $result['error']);
        self::assertFalse($this->tableExists('b'));
        self::assertSame(['before 001_a.sql'], $this->pdo->query('SELECT entry FROM log')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame(['001_a.sql'], $this->pdo->query('SELECT filename FROM migrations')->fetchAll(PDO::FETCH_COLUMN));
    }

    public function testBeforeApplyRunsOnceBeforeAnythingAndItsStringIsTheNote(): void
    {
        $set = $this->set('site', [
            '001_a.sql' => "CREATE TABLE a (id int);\n-- end of 001",
            '002_b.sql' => "CREATE TABLE b (id int);\n-- end of 002",
            '003_c.sql' => 'a draft',
        ]);
        $calls = [];
        $options = [
            'ready' => fn (MigrationSet $set, string $name, string $sql): bool => str_contains($sql, '-- end of'),
            'beforeApply' => function (PDO $pdo, array $files) use (&$calls): string {
                $calls[] = [$files, $pdo->query("SELECT to_regclass('a') IS NULL")->fetchColumn()];

                return 'A copy of every table was saved first.';
            },
        ];

        $result = $this->migrator([$set], $options)->apply();

        self::assertSame([[[['set' => 'site', 'name' => '001_a.sql'], ['set' => 'site', 'name' => '002_b.sql']], true]], $calls);
        self::assertSame('A copy of every table was saved first.', $result['note']);
        self::assertCount(2, $result['applied']);

        // Nothing to apply: not asked.
        self::assertNull($this->migrator([$set], $options)->apply()['note']);
        self::assertCount(1, $calls);
    }

    public function testABeforeApplyThatThrowsEndsTheApplyWithNothingApplied(): void
    {
        $set = $this->set('site', ['001_a.sql' => 'CREATE TABLE a (id int);']);

        $result = $this->migrator([$set], ['beforeApply' => function (): ?string {
            throw new RuntimeException('The backup folder is not writable.');
        }])->apply();

        self::assertSame(
            ['applied' => [], 'failed' => null, 'error' => 'The backup folder is not writable.', 'busy' => false, 'note' => null],
            $result
        );
        self::assertFalse($this->tableExists('a'));
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM migrations'));
        // The lock was let go.
        self::assertSame(1, (int) $this->connect()->query('SELECT CASE WHEN pg_try_advisory_lock(' . Migrator::DEFAULT_LOCK . ') THEN 1 ELSE 0 END')->fetchColumn());
    }

    // ─── Source ─────────────────────────────────────────────────────────────

    public function testSourceGivesOnlyTheFilesOfAKnownSet(): void
    {
        $users = $this->set('users', ['001_a.sql' => 'SELECT 1;', 'notes.txt' => 'not SQL']);
        $genshin = $this->set('genshin', ['002_b.sql' => 'SELECT 2;']);
        mkdir($users->directory . '/sub');
        file_put_contents($users->directory . '/sub/003_c.sql', 'SELECT 3;');
        file_put_contents($this->path('secret.sql'), 'SELECT secret;');
        $migrator = $this->migrator([$users, $genshin]);

        self::assertSame('SELECT 1;', $migrator->source('users', '001_a.sql'));
        self::assertSame('SELECT 2;', $migrator->source('genshin', '002_b.sql'));

        foreach ([
            ['users', '002_b.sql'],
            ['nobody', '001_a.sql'],
            ['users', '../secret.sql'],
            ['users', '../genshin/002_b.sql'],
            ['users', '..\\secret.sql'],
            ['users', 'sub/003_c.sql'],
            ['users', 'notes.txt'],
            ['users', ''],
            ['users', $users->directory . '/001_a.sql'],
            ['users', "001_a.sql\0"],
        ] as [$set, $name]) {
            self::assertNull($migrator->source($set, $name), "$set, $name");
        }
    }

    /**
     * What the sites' own DDL makes, in a schema of its own, named as if it were the table compared with it.
     *
     * @return array{columns: list<string>, constraints: list<string>}
     */
    private function referenceShape(string $ddl): array
    {
        $this->pdo->exec('CREATE SCHEMA reference');
        $this->pdo->exec(str_replace('CREATE TABLE migrations', 'CREATE TABLE reference.migrations', $ddl));
        $shape = $this->shapeOf('reference.migrations');
        $this->pdo->exec('DROP SCHEMA reference CASCADE');

        return ['columns' => str_replace('reference.', '', $shape['columns']), 'constraints' => $shape['constraints']];
    }

    // ─── Times ──────────────────────────────────────────────────────────────

    public function testAppliedAtIsUtcForATimestampWhateverTheSessionZone(): void
    {
        $this->pdo->exec("SET TIME ZONE 'Asia/Tokyo'");
        $this->pdo->exec(self::FILENAME_TABLE);
        $this->pdo->exec("INSERT INTO migrations (filename, applied_at) VALUES ('001_a.sql', '2026-10-06 10:01:02')");
        $set = $this->set('site', ['001_a.sql' => '', '002_b.sql' => '']);
        $migrator = $this->migrator([$set]);

        $migrator->apply();
        $applied = $migrator->status()['applied'];

        self::assertSame('2026-10-06T10:01:02Z', $applied[0]['applied_at']);
        self::assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', (string) $applied[1]['applied_at']);
        self::assertEqualsWithDelta(time(), strtotime((string) $applied[1]['applied_at']), 120, 'written in UTC, not Tokyo time');
    }

    public function testAppliedAtIsUtcForATimestamptz(): void
    {
        $this->pdo->exec("SET TIME ZONE 'America/Los_Angeles'");
        $this->pdo->exec(self::NAME_TABLE);
        $this->pdo->exec("INSERT INTO migrations (name, applied_at) VALUES ('001_a.sql', '2026-10-06 12:01:02+02')");
        $set = $this->set('site', ['001_a.sql' => '', '002_b.sql' => '']);
        $migrator = $this->migrator([$set]);

        $migrator->apply();
        $applied = $migrator->status()['applied'];

        self::assertSame('2026-10-06T10:01:02Z', $applied[0]['applied_at']);
        self::assertEqualsWithDelta(time(), strtotime((string) $applied[1]['applied_at']), 120);
    }
}
