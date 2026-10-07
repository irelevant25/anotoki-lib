<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests;

use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use InvalidArgumentException;
use LogicException;
use PDO;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * The library's own migration sets beside a site's: recorded as `<set>/<file>` in a bookkeeping table
 * without `folder`, as `folder = <set>` in one with it, wherever they stand - and nothing in the site's
 * table, or in how its own files are recorded, changes.
 */
final class MigratorSetsTest extends DatabaseTestCase
{
    /** Every shape a site's bookkeeping table has, as the site's own code made it. */
    private const SHAPES = [
        // The IAM's, the survey's, Piano Academy's and the build analyzer's.
        'filename, id, TIMESTAMP' => 'CREATE TABLE migrations (
            id         SERIAL          PRIMARY KEY,
            filename   VARCHAR(255)    NOT NULL UNIQUE,
            applied_at TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
        )',
        'filename, id, TIMESTAMPTZ' => 'CREATE TABLE migrations (
            id         SERIAL          PRIMARY KEY,
            filename   VARCHAR(255)    NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ     NOT NULL DEFAULT now()
        )',
        // Piano Academy's first runner's, once prepare renamed its column.
        'filename text key, TIMESTAMPTZ' => 'CREATE TABLE migrations (
            filename   text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )',
        // Japanese Academy's.
        'name text key, TIMESTAMPTZ' => 'CREATE TABLE migrations (
            name       text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )',
        // Piano Academy's first runner's, read as it is (before prepare renames it).
        'name, id, TIMESTAMP' => 'CREATE TABLE migrations (
            id         SERIAL          PRIMARY KEY,
            name       VARCHAR(255)    NOT NULL UNIQUE,
            applied_at TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
        )',
        // The genshin site's: two sets of its own, told apart by folder.
        'folder, filename, id, TIMESTAMP' => 'CREATE TABLE migrations (
            id         SERIAL          PRIMARY KEY,
            folder     VARCHAR(64)     NOT NULL,
            filename   VARCHAR(255)    NOT NULL,
            applied_at TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (folder, filename)
        )',
    ];

    /** @return iterable<string, array{string, bool}> */
    public static function shapesAndPlaces(): iterable
    {
        foreach (array_keys(self::SHAPES) as $shape) {
            yield "$shape, the library's set first" => [$shape, true];
            yield "$shape, the library's set last" => [$shape, false];
        }
    }

    // ─── Names ──────────────────────────────────────────────────────────────

    public function testTheNamesThatBeginWithAnotokiAreTheLibrarysAlone(): void
    {
        $set = MigrationSet::library('anotoki_translations', $this->path('x'));
        self::assertTrue($set->library);
        self::assertSame('anotoki_translations', $set->name);
        self::assertFalse((new MigrationSet('survey', $this->path('x')))->library);

        foreach (['translations', 'anotoki_', 'anotoki_Translations', 'anotoki_a/b', 'anotoki_' . str_repeat('x', 57), 'Anotoki_x'] as $name) {
            try {
                MigrationSet::library($name, $this->path('x'));
                self::fail("a library set named \"$name\"");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        self::assertSame(64, strlen(MigrationSet::library('anotoki_' . str_repeat('x', 56), $this->path('x'))->name), 'as long as genshin\'s folder column takes');

        $this->expectException(InvalidArgumentException::class);
        new MigrationSet('anotoki_translations', $this->path('x'));
    }

    // ─── Every shape, the library's set first and last ──────────────────────

    #[DataProvider('shapesAndPlaces')]
    public function testALibrarySetIsRecordedBesideTheSitesWithoutChangingItsTable(string $shape, bool $libraryFirst): void
    {
        $folder = str_starts_with($shape, 'folder');
        $file = str_contains($shape, 'filename') ? 'filename' : 'name';
        $this->pdo->exec(self::SHAPES[$shape]);

        // What the site applied before: its own first files, recorded its way.
        if ($folder) {
            $this->pdo->exec("INSERT INTO migrations (folder, filename) VALUES ('users', '001_people.sql'), ('genshin_impact', '001_characters.sql')");
            $own = [
                $this->set('users', ['001_people.sql' => 'SELECT 1/0;', '002_more_people.sql' => 'CREATE TABLE more_people (id int);']),
                $this->set('genshin_impact', ['001_characters.sql' => 'SELECT 1/0;', '002_weapons.sql' => 'CREATE TABLE weapons (id int);']),
            ];
        } else {
            $this->pdo->exec("INSERT INTO migrations ($file) VALUES ('001_people.sql')");
            $own = [$this->set('site', ['001_people.sql' => 'SELECT 1/0;', '002_more_people.sql' => 'CREATE TABLE more_people (id int);'])];
        }
        $before = $this->shapeOf('migrations');
        $library = $this->librarySet('anotoki_words', [
            '001_tables.sql' => "CREATE TABLE words (id int);\n-- end of 001\n",
            '002_rows.sql' => "INSERT INTO words VALUES (1);\n-- end of 002\n",
        ]);
        $sets = $libraryFirst ? [$library, ...$own] : [...$own, $library];
        $migrator = $this->migrator($sets);

        $libraryFiles = [['set' => 'anotoki_words', 'name' => '001_tables.sql'], ['set' => 'anotoki_words', 'name' => '002_rows.sql']];
        $ownFiles = $folder
            ? [['set' => 'users', 'name' => '002_more_people.sql'], ['set' => 'genshin_impact', 'name' => '002_weapons.sql']]
            : [['set' => 'site', 'name' => '002_more_people.sql']];
        $order = $libraryFirst ? [...$libraryFiles, ...$ownFiles] : [...$ownFiles, ...$libraryFiles];

        self::assertSame($order, $migrator->applicable(), 'in the order of the sets');
        self::assertSame(['applied' => $order, 'failed' => null, 'error' => null, 'busy' => false, 'note' => null], $migrator->apply());

        self::assertSame($before, $this->shapeOf('migrations'), 'the site\'s table is as it was');
        self::assertTrue($this->tableExists('words'));
        self::assertTrue($this->tableExists('more_people'));

        // Recorded: the site's files as they always were, the library's under its set.
        if ($folder) {
            $recorded = array_map(static fn (array $row): string => $row['folder'] . ' | ' . $row['filename'], $this->rows('SELECT folder, filename FROM migrations'));
            sort($recorded);
            self::assertSame([
                'anotoki_words | 001_tables.sql',
                'anotoki_words | 002_rows.sql',
                'genshin_impact | 001_characters.sql',
                'genshin_impact | 002_weapons.sql',
                'users | 001_people.sql',
                'users | 002_more_people.sql',
            ], $recorded);
        } else {
            $recorded = $this->pdo->query("SELECT $file FROM migrations")->fetchAll(PDO::FETCH_COLUMN);
            sort($recorded);
            self::assertSame(['001_people.sql', '002_more_people.sql', 'anotoki_words/001_tables.sql', 'anotoki_words/002_rows.sql'], $recorded);
        }

        // And read back, each with its set.
        $status = $migrator->status();
        self::assertSame(array_map(static fn (MigrationSet $set): string => $set->name, $sets), $status['sets']);
        $applied = array_map(static fn (array $record): string => $record['set'] . '/' . $record['name'], $status['applied']);
        sort($applied);
        $expected = $folder
            ? ['anotoki_words/001_tables.sql', 'anotoki_words/002_rows.sql', 'genshin_impact/001_characters.sql', 'genshin_impact/002_weapons.sql', 'users/001_people.sql', 'users/002_more_people.sql']
            : ['anotoki_words/001_tables.sql', 'anotoki_words/002_rows.sql', 'site/001_people.sql', 'site/002_more_people.sql'];
        self::assertSame($expected, $applied);
        foreach ($status['applied'] as $record) {
            self::assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', (string) $record['applied_at']);
        }
        self::assertSame([], $status['pending']);
        self::assertSame([], $status['missing']);
        self::assertSame([], $migrator->applicable());
        self::assertSame([], $migrator->apply()['applied'], 'nothing runs twice');

        // A build without the library's set reads the site's own history as it always did: nothing of the
        // site's is pending, and the library's records are files it does not have.
        $without = $this->migrator($own);
        self::assertSame([], $without->applicable());
        self::assertSame(
            [['set' => 'anotoki_words', 'name' => '001_tables.sql'], ['set' => 'anotoki_words', 'name' => '002_rows.sql']],
            array_map(static fn (array $record): array => ['set' => $record['set'], 'name' => $record['name']], $without->status()['missing'])
        );
    }

    // ─── A new table ────────────────────────────────────────────────────────

    public function testANewTableIsTheSitesOwnShapeWhateverLibrarySetsStandBesideIt(): void
    {
        $site = $this->set('iam', ['001_a.sql' => 'CREATE TABLE a (id int);']);
        $library = $this->librarySet('anotoki_words', ['001_words.sql' => 'CREATE TABLE words (id int);']);
        $other = $this->librarySet('anotoki_more', ['001_more.sql' => 'CREATE TABLE more (id int);']);

        $this->migrator([$other, $site, $library])->apply();

        self::assertSame(
            ['id integer NOT NULL DEFAULT nextval(\'migrations_id_seq\'::regclass)', 'filename character varying(255) NOT NULL', 'applied_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP'],
            $this->shapeOf('migrations')['columns'],
            'one set of the site\'s own: the one-set table, no folder'
        );
        self::assertSame(
            ['anotoki_more/001_more.sql', '001_a.sql', 'anotoki_words/001_words.sql'],
            $this->pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN)
        );
    }

    public function testANewTableForTwoSetsOfTheSitesOwnHasFolder(): void
    {
        $users = $this->set('users', ['001_a.sql' => 'CREATE TABLE a (id int);']);
        $genshin = $this->set('genshin_impact', ['001_b.sql' => 'CREATE TABLE b (id int);']);
        $library = $this->librarySet('anotoki_words', ['001_words.sql' => 'CREATE TABLE words (id int);']);

        $this->migrator([$users, $genshin, $library])->apply();

        self::assertSame(
            [['folder' => 'users', 'filename' => '001_a.sql'], ['folder' => 'genshin_impact', 'filename' => '001_b.sql'], ['folder' => 'anotoki_words', 'filename' => '001_words.sql']],
            $this->rows('SELECT folder, filename FROM migrations ORDER BY id')
        );
    }

    public function testTheLibrarysSetsAloneOnANewDatabase(): void
    {
        $library = $this->librarySet('anotoki_words', ['001_words.sql' => 'CREATE TABLE words (id int);']);
        $migrator = $this->migrator([$library]);

        self::assertSame([['set' => 'anotoki_words', 'name' => '001_words.sql']], $migrator->apply()['applied']);
        self::assertSame(['anotoki_words/001_words.sql'], $this->pdo->query('SELECT filename FROM migrations')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame([['set' => 'anotoki_words', 'name' => '001_words.sql']], array_map(
            static fn (array $record): array => ['set' => $record['set'], 'name' => $record['name']],
            $migrator->status()['applied']
        ));

        // A record of a site's file, with no set of the site's own configured: no set has it.
        $this->pdo->exec("INSERT INTO migrations (filename) VALUES ('001_site.sql')");
        self::assertSame([['set' => '', 'name' => '001_site.sql']], array_map(
            static fn (array $record): array => ['set' => $record['set'], 'name' => $record['name']],
            $migrator->status()['missing']
        ));
    }

    // ─── What the table without folder still cannot do ─────────────────────

    public function testTwoSetsOfTheSitesOwnStillNeedFolderAndLibrarySetsNever(): void
    {
        $this->pdo->exec(self::SHAPES['filename, id, TIMESTAMP']);
        $library = $this->librarySet('anotoki_words');
        $other = $this->librarySet('anotoki_more');

        try {
            $this->migrator([$this->set('users'), $this->set('genshin_impact'), $library])->status();
            self::fail('two sets of the site\'s own read from one list');
        } catch (LogicException $e) {
            self::assertStringContainsString('no folder column', $e->getMessage());
            self::assertStringContainsString('the site\'s 2 migration sets', $e->getMessage());
        }

        $status = $this->migrator([$library, $this->set('site'), $other])->status();
        self::assertSame(['anotoki_words', 'site', 'anotoki_more'], $status['sets']);
    }

    // ─── Missing ────────────────────────────────────────────────────────────

    public function testARecordOfASetThatIsNotConfiguredIsMissingUnderItsOwnName(): void
    {
        $this->pdo->exec(self::SHAPES['filename, id, TIMESTAMP']);
        $this->pdo->exec(
            "INSERT INTO migrations (filename, applied_at) VALUES
                ('001_a.sql', '2026-10-01 08:00:00'),
                ('anotoki_gone/001_x.sql', '2026-10-02 08:00:00'),
                ('anotoki_words/001_words.sql', '2026-10-03 08:00:00'),
                ('anotoki_words/009_removed.sql', '2026-10-04 08:00:00')"
        );
        $site = $this->set('site', ['001_a.sql' => '']);
        $library = $this->librarySet('anotoki_words', ['001_words.sql' => '']);

        $status = $this->migrator([$site, $library])->status();

        self::assertSame([
            ['set' => 'site', 'name' => '001_a.sql', 'applied_at' => '2026-10-01T08:00:00Z'],
            ['set' => 'anotoki_words', 'name' => '001_words.sql', 'applied_at' => '2026-10-03T08:00:00Z'],
        ], $status['applied']);
        self::assertSame([
            ['set' => 'anotoki_gone', 'name' => '001_x.sql', 'applied_at' => '2026-10-02T08:00:00Z'],
            ['set' => 'anotoki_words', 'name' => '009_removed.sql', 'applied_at' => '2026-10-04T08:00:00Z'],
        ], $status['missing']);
        self::assertSame([], $status['pending']);
    }

    public function testInAFolderTableTooARecordOfASetNotConfiguredIsMissing(): void
    {
        $this->pdo->exec(self::SHAPES['folder, filename, id, TIMESTAMP']);
        $this->pdo->exec("INSERT INTO migrations (folder, filename) VALUES ('users', '001_a.sql'), ('anotoki_gone', '001_x.sql')");

        $status = $this->migrator([$this->set('users', ['001_a.sql' => '']), $this->set('genshin_impact')])->status();

        self::assertSame([['set' => 'anotoki_gone', 'name' => '001_x.sql']], array_map(
            static fn (array $record): array => ['set' => $record['set'], 'name' => $record['name']],
            $status['missing']
        ));
    }

    // ─── The hooks see the library's files with their set ──────────────────

    public function testReadyIsAskedWithTheLibrarysSetAndDraftsHoldEverySetBehindThem(): void
    {
        $this->pdo->exec(self::SHAPES['name text key, TIMESTAMPTZ']);
        $site = $this->set('academy', [
            '001_a.sql' => "CREATE TABLE a (id int);\n-- end of 001\n",
            '002_b.sql' => "CREATE TABLE b (id int);\n-- still being written\n",
        ]);
        $library = $this->librarySet('anotoki_words', [
            '001_words.sql' => "CREATE TABLE words (id int);\n-- end of 001\n",
        ]);
        $asked = [];
        // Japanese Academy's rule: a file is whole once its last line is "-- end of NNN".
        $ready = function (MigrationSet $set, string $name, string $sql) use (&$asked): bool {
            $asked[] = [$set->name, $set->library, $name];
            $lines = preg_split('/\R/', rtrim($sql));

            return end($lines) === '-- end of ' . substr($name, 0, 3);
        };
        $migrator = $this->migrator([$site, $library], ['ready' => $ready, 'split' => false]);

        self::assertSame([
            ['set' => 'academy', 'name' => '001_a.sql', 'ready' => true, 'blocked' => false],
            ['set' => 'academy', 'name' => '002_b.sql', 'ready' => false, 'blocked' => false],
            ['set' => 'anotoki_words', 'name' => '001_words.sql', 'ready' => true, 'blocked' => true],
        ], $migrator->status()['pending']);
        self::assertSame([['academy', false, '001_a.sql'], ['academy', false, '002_b.sql'], ['anotoki_words', true, '001_words.sql']], $asked);

        // The site's draft holds the library's file back, as it holds the site's own.
        self::assertSame([['set' => 'academy', 'name' => '001_a.sql']], $migrator->apply()['applied']);
        self::assertFalse($this->tableExists('words'));

        file_put_contents($site->directory . '/002_b.sql', "CREATE TABLE b (id int);\n-- end of 002\n");
        self::assertSame(
            [['set' => 'academy', 'name' => '002_b.sql'], ['set' => 'anotoki_words', 'name' => '001_words.sql']],
            $migrator->apply()['applied']
        );
        self::assertSame(['001_a.sql', '002_b.sql', 'anotoki_words/001_words.sql'], $this->pdo->query('SELECT name FROM migrations ORDER BY applied_at, name')->fetchAll(PDO::FETCH_COLUMN));

        // A library draft first holds the site's files back just the same.
        $first = $this->librarySet('anotoki_first', ['001_first.sql' => "CREATE TABLE first (id int);\n"]);
        $this->set('academy', ['003_c.sql' => "CREATE TABLE c (id int);\n-- end of 003\n"]);
        self::assertSame([], $this->migrator([$first, $site, $library], ['ready' => $ready])->applicable());
    }

    public function testBeforeFileAndBeforeApplySeeTheLibrarysFilesWithTheirSet(): void
    {
        $site = $this->set('site', ['001_a.sql' => 'CREATE TABLE a (id int);']);
        $library = $this->librarySet('anotoki_words', ['001_words.sql' => 'CREATE TABLE words (id int);']);
        $seen = [];

        $this->migrator([$site, $library], [
            'beforeApply' => function (PDO $pdo, array $files) use (&$seen): ?string {
                $seen[] = ['apply', $files];

                return null;
            },
            'beforeFile' => function (PDO $pdo, MigrationSet $set, string $name) use (&$seen): void {
                $seen[] = ['file', $set->name, $set->library, $name];
            },
        ])->apply();

        self::assertSame([
            ['apply', [['set' => 'site', 'name' => '001_a.sql'], ['set' => 'anotoki_words', 'name' => '001_words.sql']]],
            ['file', 'site', false, '001_a.sql'],
            ['file', 'anotoki_words', true, '001_words.sql'],
        ], $seen);
    }

    public function testTheLibrarysFilesTakeTheSitesLock(): void
    {
        $site = $this->set('site', ['001_a.sql' => 'CREATE TABLE a (id int);']);
        $library = $this->librarySet('anotoki_words', ['001_words.sql' => 'CREATE TABLE words (id int);']);
        $other = $this->connect();
        $other->query('SELECT pg_advisory_lock(3300008500)');

        $result = $this->migrator([$site, $library], ['lock' => 3_300_008_500])->apply();

        self::assertTrue($result['busy']);
        self::assertFalse($this->tableExists('words'));
        self::assertFalse($this->tableExists('migrations'));

        $other->query('SELECT pg_advisory_unlock(3300008500)');
        self::assertCount(2, $this->migrator([$site, $library], ['lock' => 3_300_008_500])->apply()['applied']);
    }

    public function testALibraryFileRecordedMeanwhileIsSkipped(): void
    {
        $this->pdo->exec(self::SHAPES['filename text key, TIMESTAMPTZ']);
        $library = $this->librarySet('anotoki_words', ['001_words.sql' => 'SELECT 1/0;', '002_more.sql' => 'CREATE TABLE more (id int);']);
        $other = $this->connect();

        $result = $this->migrator([$this->set('site'), $library], ['beforeApply' => function () use ($other): ?string {
            $other->exec("INSERT INTO migrations (filename) VALUES ('anotoki_words/001_words.sql')");

            return null;
        }])->apply();

        self::assertSame([['set' => 'anotoki_words', 'name' => '002_more.sql']], $result['applied']);
        self::assertNull($result['failed']);
    }

    public function testTheSourceOfALibraryFile(): void
    {
        $library = $this->librarySet('anotoki_words', ['001_words.sql' => 'SELECT 1;']);
        $migrator = $this->migrator([$this->set('site', ['001_a.sql' => 'SELECT 2;']), $library]);

        self::assertSame('SELECT 1;', $migrator->source('anotoki_words', '001_words.sql'));
        self::assertNull($migrator->source('anotoki_words', '001_a.sql'));
        self::assertNull($migrator->source('site', 'anotoki_words/001_words.sql'));
    }
}
