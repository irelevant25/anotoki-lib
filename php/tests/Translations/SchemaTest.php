<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Translations;

use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Migrations\Splitter;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Schema;
use PDO;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * The library's migration set anotoki_translations: on a new database it makes the family's one schema; on
 * each aligned site's tables it makes nothing and lets them through; on genshin's it refuses, naming every
 * difference; and its words are library-words.json's, written only for a key that has none.
 */
final class SchemaTest extends DatabaseTestCase
{
    /** The people tables the sites' foreign keys point at. */
    private const USERS_SERIAL = 'CREATE TABLE users (id SERIAL PRIMARY KEY)';
    private const USERS_BIGINT = 'CREATE TABLE users (id BIGINT PRIMARY KEY)';

    /** Each aligned site's own DDL, as its migration wrote it. */
    private const SITES = [
        // anotoki-iam migrations/iam/006
        'iam' => [self::USERS_SERIAL, "CREATE TABLE IF NOT EXISTS languages (
            code         VARCHAR(10)   PRIMARY KEY CHECK (code ~ '^[a-z]{2}(-[a-z]{2})?$'),
            name         VARCHAR(50)   NOT NULL,
            native_name  VARCHAR(50)   NOT NULL,
            enabled      BOOLEAN       NOT NULL DEFAULT TRUE,
            sort_order   INTEGER       NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS translation_keys (
            name         VARCHAR(200)  PRIMARY KEY,
            description  TEXT,
            created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS translations (
            key_name       VARCHAR(200)  NOT NULL REFERENCES translation_keys (name) ON UPDATE CASCADE ON DELETE CASCADE,
            language_code  VARCHAR(10)   NOT NULL REFERENCES languages (code) ON UPDATE CASCADE ON DELETE CASCADE,
            value          TEXT          NOT NULL CHECK (value <> ''),
            updated_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_by     INT           REFERENCES users (id) ON DELETE SET NULL,
            PRIMARY KEY (key_name, language_code)
        )"],
        // anotoki-survey migrations/survey/002
        'survey' => [self::USERS_BIGINT, "CREATE TABLE IF NOT EXISTS languages (
            code         VARCHAR(10)   PRIMARY KEY CHECK (code ~ '^[a-z]{2}(-[a-z]{2})?$'),
            name         VARCHAR(50)   NOT NULL,
            native_name  VARCHAR(50)   NOT NULL,
            enabled      BOOLEAN       NOT NULL DEFAULT TRUE,
            sort_order   INTEGER       NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS translation_keys (
            name         VARCHAR(200)  PRIMARY KEY,
            description  TEXT,
            created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS translations (
            key_name       VARCHAR(200)  NOT NULL REFERENCES translation_keys (name) ON UPDATE CASCADE ON DELETE CASCADE,
            language_code  VARCHAR(10)   NOT NULL REFERENCES languages (code) ON UPDATE CASCADE ON DELETE CASCADE,
            value          TEXT          NOT NULL CHECK (value <> ''),
            updated_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_by     BIGINT        REFERENCES users (id) ON DELETE SET NULL,
            PRIMARY KEY (key_name, language_code)
        );
        ALTER TABLE users ADD COLUMN language VARCHAR(10) REFERENCES languages (code) ON DELETE SET NULL"],
        // anotoki-piano-academy migrations/piano_academy/002
        'piano' => [self::USERS_BIGINT, "CREATE TABLE IF NOT EXISTS languages (
            code         VARCHAR(10)   PRIMARY KEY CHECK (code ~ '^[a-z]{2}(-[a-z]{2})?$'),
            name         VARCHAR(50)   NOT NULL,
            native_name  VARCHAR(50)   NOT NULL,
            enabled      BOOLEAN       NOT NULL DEFAULT TRUE,
            sort_order   INTEGER       NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS translation_keys (
            name         VARCHAR(200)  PRIMARY KEY,
            description  TEXT,
            created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS translations (
            key_name       VARCHAR(200)  NOT NULL REFERENCES translation_keys (name) ON UPDATE CASCADE ON DELETE CASCADE,
            language_code  VARCHAR(10)   NOT NULL REFERENCES languages (code) ON UPDATE CASCADE ON DELETE CASCADE,
            value          TEXT          NOT NULL CHECK (value <> ''),
            updated_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_by     BIGINT        REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
            PRIMARY KEY (key_name, language_code)
        )"],
        // anotoki-japanese-academy migrations/004: plain CREATE TABLE, small letters, now()
        'japanese' => [self::USERS_BIGINT, "CREATE TABLE languages (
            code        varchar(10) PRIMARY KEY CHECK (code ~ '^[a-z]{2}(-[a-z]{2})?$'),
            name        varchar(50) NOT NULL,
            native_name varchar(50) NOT NULL,
            enabled     boolean     NOT NULL DEFAULT true,
            sort_order  integer     NOT NULL DEFAULT 0
        );
        CREATE TABLE translation_keys (
            name        varchar(200) PRIMARY KEY,
            description text,
            created_at  timestamptz  NOT NULL DEFAULT now()
        );
        CREATE TABLE translations (
            key_name      varchar(200) NOT NULL REFERENCES translation_keys (name) ON UPDATE CASCADE ON DELETE CASCADE,
            language_code varchar(10)  NOT NULL REFERENCES languages (code) ON UPDATE CASCADE ON DELETE CASCADE,
            value         text         NOT NULL CHECK (value <> ''),
            updated_at    timestamptz  NOT NULL DEFAULT now(),
            updated_by    bigint       REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
            PRIMARY KEY (key_name, language_code)
        )"],
        // anotoki-build-analyzer migrations/003: named constraints, updated_by without a foreign key
        'build analyzer' => [self::USERS_BIGINT, "CREATE TABLE IF NOT EXISTS languages (
            code        VARCHAR(10)     NOT NULL,
            name        VARCHAR(50)     NOT NULL,
            native_name VARCHAR(50)     NOT NULL,
            enabled     BOOLEAN         NOT NULL DEFAULT TRUE,
            sort_order  INTEGER         NOT NULL DEFAULT 0,
            CONSTRAINT languages_pkey PRIMARY KEY (code),
            CONSTRAINT languages_code_check CHECK (code ~ '^[a-z]{2}(-[a-z]{2})?$')
        );
        CREATE TABLE IF NOT EXISTS translation_keys (
            name        VARCHAR(200)    NOT NULL,
            description TEXT,
            created_at  TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT translation_keys_pkey PRIMARY KEY (name)
        );
        CREATE TABLE IF NOT EXISTS translations (
            key_name      VARCHAR(200)  NOT NULL,
            language_code VARCHAR(10)   NOT NULL,
            value         TEXT          NOT NULL,
            updated_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_by    BIGINT,
            CONSTRAINT translations_pkey PRIMARY KEY (key_name, language_code),
            CONSTRAINT translations_key_name_foreign FOREIGN KEY (key_name)
                REFERENCES translation_keys (name) ON UPDATE CASCADE ON DELETE CASCADE,
            CONSTRAINT translations_language_code_foreign FOREIGN KEY (language_code)
                REFERENCES languages (code) ON UPDATE CASCADE ON DELETE CASCADE,
            CONSTRAINT translations_value_check CHECK (value <> '')
        )"],
    ];

    /** The genshin site's tables as its users/ migrations left them (anotoki-genshin-impact, users/001 to 049). */
    private const GENSHIN = "CREATE TABLE users (id SERIAL PRIMARY KEY);
        CREATE TABLE sites (code VARCHAR(50) PRIMARY KEY, name VARCHAR(100) NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE languages (
            name        VARCHAR(50) PRIMARY KEY,
            code        VARCHAR(10) NOT NULL,
            native_name VARCHAR(50) NOT NULL,
            enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
            sort_order  INTEGER     NOT NULL DEFAULT 0,
            CONSTRAINT uq_languages_code UNIQUE (code)
        );
        CREATE TABLE translation_keys (
            name        VARCHAR(200) PRIMARY KEY,
            description TEXT,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP,
            site        VARCHAR(50) NOT NULL DEFAULT 'common' REFERENCES sites (code) ON UPDATE CASCADE,
            is_html     BOOLEAN NOT NULL DEFAULT FALSE,
            created_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
            updated_by  INTEGER REFERENCES users (id) ON DELETE SET NULL
        );
        CREATE TABLE translations (
            key_name      VARCHAR(200) NOT NULL,
            language_code VARCHAR(10)  NOT NULL,
            value         TEXT         NOT NULL,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
            updated_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
            PRIMARY KEY (key_name, language_code),
            CONSTRAINT fk_translations_key FOREIGN KEY (key_name) REFERENCES translation_keys (name) ON UPDATE CASCADE ON DELETE CASCADE,
            CONSTRAINT fk_translations_language FOREIGN KEY (language_code) REFERENCES languages (code) ON UPDATE CASCADE ON DELETE CASCADE
        )";

    /** @return iterable<string, array{string}> */
    public static function sites(): iterable
    {
        foreach (array_keys(self::SITES) as $site) {
            yield $site => [$site];
        }
    }

    // ─── The set ────────────────────────────────────────────────────────────

    public function testTheSetIsALibrarySetOfTheShippedFiles(): void
    {
        $set = Schema::migrationSet();

        self::assertSame('anotoki_translations', $set->name);
        self::assertTrue($set->library);
        self::assertSame(['001_languages_and_strings.sql', '002_library_words.sql'], $this->migrator([$set])->files($set));
    }

    // ─── A new database ─────────────────────────────────────────────────────

    public function testOnANewDatabaseItMakesTheSchemaEnglishSlovakAndTheLibrarysWords(): void
    {
        self::assertFalse(Schema::ready($this->pdo));

        $result = $this->siteMigrator()->apply();

        self::assertSame(
            [['set' => 'anotoki_translations', 'name' => '001_languages_and_strings.sql'], ['set' => 'anotoki_translations', 'name' => '002_library_words.sql']],
            $result['applied'],
            (string) $result['error']
        );
        self::assertTrue(Schema::ready($this->pdo));
        self::assertSame(
            ['anotoki_translations/001_languages_and_strings.sql', 'anotoki_translations/002_library_words.sql'],
            $this->pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN)
        );
        self::assertSame(
            [
                ['code' => 'en', 'name' => 'English', 'native_name' => 'English', 'enabled' => true, 'sort_order' => 1],
                ['code' => 'sk', 'name' => 'Slovak', 'native_name' => 'Slovenčina', 'enabled' => true, 'sort_order' => 2],
            ],
            array_map(
                static fn (array $row): array => ['code' => $row['code'], 'name' => $row['name'], 'native_name' => $row['native_name'], 'enabled' => (bool) $row['enabled'], 'sort_order' => (int) $row['sort_order']],
                $this->rows('SELECT code, name, native_name, enabled, sort_order FROM languages ORDER BY sort_order')
            )
        );
        self::assertSame([
            'languages_code_check CHECK (((code)::text ~ \'^[a-z]{2}(-[a-z]{2})?$\'::text))',
            'languages_pkey PRIMARY KEY (code)',
        ], $this->shapeOf('languages')['constraints']);
        self::assertSame([
            'translations_key_name_foreign FOREIGN KEY (key_name) REFERENCES translation_keys(name) ON UPDATE CASCADE ON DELETE CASCADE',
            'translations_language_code_foreign FOREIGN KEY (language_code) REFERENCES languages(code) ON UPDATE CASCADE ON DELETE CASCADE',
            'translations_pkey PRIMARY KEY (key_name, language_code)',
            'translations_value_check CHECK ((value <> \'\'::text))',
        ], $this->shapeOf('translations')['constraints']);

        // The schema the library made is one its own check lets through: 001 again makes and refuses nothing.
        $before = $this->shapes();
        $this->runFile('001_languages_and_strings.sql');
        self::assertSame($before, $this->shapes());
    }

    public function testItsWordsAreLibraryWordsJsonsExactly(): void
    {
        $this->siteMigrator()->apply();

        $descriptions = [];
        foreach ($this->rows("SELECT name, description FROM translation_keys WHERE name LIKE 'anotoki.%' ORDER BY name") as $row) {
            $descriptions[$row['name']] = $row['description'];
        }
        $strings = [];
        foreach ($this->rows("SELECT key_name, language_code, value FROM translations WHERE key_name LIKE 'anotoki.%' ORDER BY key_name, language_code") as $row) {
            $strings[$row['key_name']][$row['language_code']] = $row['value'];
        }

        $words = LibraryWords::read(LibraryWords::file());
        ksort($words, SORT_STRING);
        self::assertSame(array_map(static fn (array $entry): string => $entry['description'], $words), $descriptions);
        self::assertSame(
            array_map(static function (array $entry): array {
                unset($entry['description']);
                ksort($entry);

                return $entry;
            }, $words),
            $strings
        );
    }

    public function testFileByFileWholeAsJapaneseAcademySendsThem(): void
    {
        $result = $this->siteMigrator(['split' => false])->apply();

        self::assertNull($result['error']);
        self::assertCount(2, $result['applied']);
        self::assertSame(13, (int) $this->value("SELECT count(*) FROM translation_keys WHERE name LIKE 'anotoki.%'"));
    }

    // ─── The aligned sites ──────────────────────────────────────────────────

    #[DataProvider('sites')]
    public function testOnAnAlignedSiteItMakesNothingAndAddsTheLibrarysWords(string $site): void
    {
        [$users, $ddl] = self::SITES[$site];
        $this->pdo->exec($users);
        $this->pdo->exec($ddl);
        $this->pdo->exec("INSERT INTO languages (code, name, native_name, sort_order) VALUES ('en', 'English', 'English', 1), ('sk', 'Slovak', 'Slovenčina', 2)");
        $this->pdo->exec("INSERT INTO translation_keys (name, description) VALUES ('common.save', 'A button.')");
        $this->pdo->exec("INSERT INTO translations (key_name, language_code, value) VALUES ('common.save', 'en', 'Save'), ('common.save', 'sk', 'Uložiť')");
        $tables = [...$this->tables(), 'migrations'];
        sort($tables);
        $before = $this->shapes();

        $result = $this->siteMigrator()->apply();

        self::assertNull($result['error'], (string) $result['error']);
        self::assertCount(2, $result['applied']);
        self::assertSame($before, $this->shapes(), 'not a column, not a constraint changed');
        self::assertSame($tables, $this->tables(), 'no table made but the bookkeeping one');
        self::assertSame(['en', 'sk'], $this->pdo->query('SELECT code FROM languages ORDER BY code')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame(13, (int) $this->value("SELECT count(*) FROM translation_keys WHERE name LIKE 'anotoki.%'"));
        self::assertSame(26, (int) $this->value("SELECT count(*) FROM translations WHERE key_name LIKE 'anotoki.%' AND updated_by IS NULL"));
        self::assertSame(['Save', 'Uložiť'], $this->pdo->query("SELECT value FROM translations WHERE key_name = 'common.save' ORDER BY language_code")->fetchAll(PDO::FETCH_COLUMN));
    }

    // ─── Shapes it refuses ──────────────────────────────────────────────────

    public function testItRefusesGenshinsTablesNamingEveryDifferenceAndMakesNothing(): void
    {
        $this->pdo->exec(self::GENSHIN);
        $this->pdo->exec("INSERT INTO sites (code, name) VALUES ('common', 'Common')");
        $this->pdo->exec("INSERT INTO languages (name, code, native_name) VALUES ('English', 'en', 'English'), ('Slovak', 'sk', 'Slovenčina')");
        $before = $this->shapes();

        $result = $this->siteMigrator()->apply();

        self::assertSame([], $result['applied']);
        self::assertSame(['set' => 'anotoki_translations', 'name' => '001_languages_and_strings.sql'], $result['failed']);
        $error = (string) $result['error'];
        self::assertStringContainsString('anotoki_translations 001: the tables of the words are not in the shape the anotoki library needs', $error);
        self::assertStringContainsString('translation_keys.created_at is timestamp without time zone, where it must be timestamp with time zone', $error);
        self::assertStringContainsString('translations.updated_at is timestamp without time zone, where it must be timestamp with time zone', $error);
        self::assertStringContainsString('the primary key of languages is (name), where it must be (code)', $error);
        self::assertStringContainsString("translations has no CHECK (value <> '') - an empty string must be no row", $error);
        self::assertStringContainsString('moves them into this one in a migration of its own first', $error);
        self::assertSame($before, $this->shapes(), 'nothing of it stays');
        self::assertSame(0, (int) $this->value("SELECT count(*) FROM translation_keys WHERE name LIKE 'anotoki.%'"));
    }

    /** @return iterable<string, array{string, string}> */
    public static function wrongShapes(): iterable
    {
        yield 'a column missing' => ['ALTER TABLE languages DROP COLUMN native_name', 'languages has no column native_name'];
        yield 'a type that will not do' => ['ALTER TABLE languages ALTER COLUMN sort_order TYPE BIGINT', 'languages.sort_order is bigint, where it must be integer'];
        yield 'a value that may be NULL' => ['ALTER TABLE translations ALTER COLUMN value DROP NOT NULL', 'translations.value may be NULL, where it must be NOT NULL'];
        yield 'no default where the library leaves it to one' => ['ALTER TABLE translations ALTER COLUMN updated_at DROP DEFAULT', 'translations.updated_at has no default'];
        yield 'a column of the site\'s own that must be filled' => ['ALTER TABLE translation_keys ADD COLUMN scope TEXT NOT NULL', 'translation_keys.scope must be filled and has no default'];
        yield 'no primary key' => ['ALTER TABLE translation_keys DROP CONSTRAINT translation_keys_pkey CASCADE', 'translation_keys has no primary key, where it must be (name)'];
        yield 'a foreign key that does not cascade' => [
            'ALTER TABLE translations DROP CONSTRAINT translations_language_code_foreign; ALTER TABLE translations ADD FOREIGN KEY (language_code) REFERENCES languages (code) ON DELETE CASCADE',
            'translations.language_code has no foreign key to languages (code) ON UPDATE CASCADE ON DELETE CASCADE',
        ];
        yield 'no CHECK on the value' => ['ALTER TABLE translations DROP CONSTRAINT translations_value_check', "translations has no CHECK (value <> '')"];
    }

    #[DataProvider('wrongShapes')]
    public function testItRefusesAShapeItCannotWorkWithAndSaysWhy(string $change, string $says): void
    {
        [$users, $ddl] = self::SITES['build analyzer'];
        $this->pdo->exec($users);
        $this->pdo->exec($ddl);
        $this->pdo->exec($change);

        $result = $this->siteMigrator()->apply();

        self::assertSame([], $result['applied']);
        self::assertStringContainsString($says, (string) $result['error']);
    }

    public function testATableOfTheThreeMissingIsMadeBesideTheOthers(): void
    {
        // A site half way: its languages there (the IAM's users.language refers to them), the rest not yet.
        $this->pdo->exec("CREATE TABLE languages (code VARCHAR(10) PRIMARY KEY, name VARCHAR(50) NOT NULL, native_name VARCHAR(50) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0)");
        $this->pdo->exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('en', 'English', 'English', TRUE, 5), ('de', 'German', 'Deutsch', FALSE, 6)");

        self::assertNull($this->siteMigrator()->apply()['error']);

        self::assertTrue(Schema::ready($this->pdo));
        self::assertSame([['code' => 'de', 'sort_order' => 6], ['code' => 'en', 'sort_order' => 5], ['code' => 'sk', 'sort_order' => 2]], array_map(
            static fn (array $row): array => ['code' => $row['code'], 'sort_order' => (int) $row['sort_order']],
            $this->rows('SELECT code, sort_order FROM languages ORDER BY code')
        ), 'English as the site had it; Slovak added');
    }

    public function testEnglishSwitchedOffIsRefused(): void
    {
        [$users, $ddl] = self::SITES['iam'];
        $this->pdo->exec($users);
        $this->pdo->exec($ddl);
        $this->pdo->exec("INSERT INTO languages (code, name, native_name, enabled) VALUES ('en', 'English', 'English', FALSE)");

        $result = $this->siteMigrator()->apply();

        self::assertSame([], $result['applied']);
        self::assertStringContainsString('English (en) must be there and switched on', (string) $result['error']);
    }

    public function testADatabaseThatIsNotUtf8IsRefused(): void
    {
        $sql = (string) file_get_contents(Schema::directory() . '/001_languages_and_strings.sql');
        self::assertStringContainsString("current_setting('server_encoding') <> 'UTF8'", $sql);
        self::assertSame('UTF8', $this->value("SELECT current_setting('server_encoding')"), 'this server makes UTF8 databases: the check passes here');
    }

    // ─── 002 writes strings only for a library key that has none ────────────

    public function testALibraryKeyASiteTookOverKeepsItsWordsAndItsBlanks(): void
    {
        $this->siteMigrator()->apply();
        // The state before 002, on a site that moved its own keys under the library's (4.0's pattern) ...
        $this->pdo->exec("DELETE FROM migrations WHERE filename = 'anotoki_translations/002_library_words.sql'");
        $this->pdo->exec("DELETE FROM translation_keys WHERE name LIKE 'anotoki.%'");
        $this->pdo->exec("INSERT INTO translation_keys (name, description) VALUES
            ('anotoki.language.button', 'The site''s own description.'),
            ('anotoki.language.notSaved', 'The site''s own description.')");
        // ... its own English and formal Slovak for one, and only English for the other: its Slovak left blank on purpose.
        $this->pdo->exec("INSERT INTO translations (key_name, language_code, value, updated_by) VALUES
            ('anotoki.language.button', 'en', 'Language: {name} ({code})', 7),
            ('anotoki.language.button', 'sk', 'Jazyk: {name} ({code}) - Vy', 7),
            ('anotoki.language.notSaved', 'en', 'Not saved to your account.', NULL)");

        self::assertSame([['set' => 'anotoki_translations', 'name' => '002_library_words.sql']], $this->siteMigrator()->apply()['applied']);

        self::assertSame(
            [['language_code' => 'en', 'value' => 'Language: {name} ({code})', 'updated_by' => 7], ['language_code' => 'sk', 'value' => 'Jazyk: {name} ({code}) - Vy', 'updated_by' => 7]],
            array_map(
                static fn (array $row): array => ['language_code' => $row['language_code'], 'value' => $row['value'], 'updated_by' => (int) $row['updated_by']],
                $this->rows("SELECT language_code, value, updated_by FROM translations WHERE key_name = 'anotoki.language.button' ORDER BY language_code")
            )
        );
        self::assertSame(['en'], $this->pdo->query("SELECT language_code FROM translations WHERE key_name = 'anotoki.language.notSaved'")->fetchAll(PDO::FETCH_COLUMN), 'the blank stays blank');
        self::assertSame('Jazyk', $this->value("SELECT value FROM translations WHERE key_name = 'anotoki.language.label' AND language_code = 'sk'"), 'a key with no string at all gets the library\'s');
        self::assertSame(LibraryWords::all()['anotoki.language.button']['description'], $this->value("SELECT description FROM translation_keys WHERE name = 'anotoki.language.button'"), 'descriptions are the library\'s');
    }

    public function testALibraryKeyWithoutEnglishIsRefusedByTheGate(): void
    {
        $this->siteMigrator()->apply();
        $this->pdo->exec("DELETE FROM migrations WHERE filename = 'anotoki_translations/002_library_words.sql'");
        $this->pdo->exec("DELETE FROM translations WHERE key_name = 'anotoki.siteStatus.signIn' AND language_code = 'en'");

        $result = $this->siteMigrator()->apply();

        self::assertSame(['set' => 'anotoki_translations', 'name' => '002_library_words.sql'], $result['failed']);
        self::assertStringContainsString("the library's keys without an English string: anotoki.siteStatus.signIn", (string) $result['error']);
    }

    public function testALanguageASiteDoesNotHaveIsPassedOver(): void
    {
        $this->siteMigrator()->apply();
        $this->pdo->exec("DELETE FROM migrations WHERE filename = 'anotoki_translations/002_library_words.sql'");
        $this->pdo->exec("DELETE FROM translation_keys WHERE name LIKE 'anotoki.%'");
        $this->pdo->exec("DELETE FROM languages WHERE code = 'sk'");

        self::assertNull($this->siteMigrator()->apply()['error']);
        self::assertSame(['en'], $this->pdo->query("SELECT DISTINCT language_code FROM translations WHERE key_name LIKE 'anotoki.%'")->fetchAll(PDO::FETCH_COLUMN));
    }

    // ─── The files themselves ───────────────────────────────────────────────

    public function testEveryFileIsInTheHouseStyle(): void
    {
        $directory = Schema::directory();
        foreach ($this->migrator([Schema::migrationSet()])->files(Schema::migrationSet()) as $name) {
            $sql = (string) file_get_contents("$directory/$name");

            self::assertStringNotContainsString("\r", $sql, "$name: LF line endings, as the release has them");
            self::assertStringEndsWith('-- end of ' . substr($name, 0, 3) . "\n", $sql, "$name: its last line says it is whole (Japanese Academy's draft rule reads it)");
            self::assertSame(1, preg_match('//u', $sql), "$name: UTF-8");
            self::assertDoesNotMatchRegularExpression("/\\bE'/i", $sql, "$name: no E'...' strings - nothing escaped but an apostrophe");
            self::assertStringNotContainsString('\\', $sql, "$name: nothing escaped with a backslash");
            // Every table it names is one of the three, or the catalog's (strings and comments aside).
            $code = (string) preg_replace("/'(?:[^']|'')*'/", "''", implode("\n", Splitter::split($sql)));
            preg_match_all('/\b(?:FROM|JOIN|INSERT\s+INTO|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE|DELETE\s+FROM|(?<!ON )(?<!DO )UPDATE|REFERENCES)\s+([a-z_][a-z0-9_.]*)/i', $code, $tables);
            $named = array_values(array_unique(array_map('strtolower', $tables[1])));
            self::assertSame([], array_values(array_diff($named, ['languages', 'translation_keys', 'translations', 'pg_class', 'pg_namespace', 'pg_attribute', 'pg_index', 'pg_constraint', 'unnest'])), "$name names no table of a site's");
        }
    }

    public function testEveryStringIsOnALineOfItsOwn(): void
    {
        $sql = (string) file_get_contents(Schema::directory() . '/002_library_words.sql');
        $string = "'(?:[^']|'')*'";
        $rows = preg_match_all("/^\\s*\\($string, ($string), ($string)\\),?\$/m", $sql);
        $keys = preg_match_all("/^\\s*\\($string, $string\\),?\$/m", $sql);

        self::assertSame(2 * count(LibraryWords::keys()), $rows, 'a row of the strings a line');
        self::assertSame(count(LibraryWords::keys()), $keys, 'a key and its description a line');
    }

    public function testTheSplitterReadsEveryFileAsPostgreSqlDoes(): void
    {
        $directory = Schema::directory();
        self::assertCount(7, Splitter::split((string) file_get_contents("$directory/001_languages_and_strings.sql")));
        self::assertCount(3, Splitter::split((string) file_get_contents("$directory/002_library_words.sql")));
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    /** The site's Migrator: its own set (no files here) and the library's, last. */
    private function siteMigrator(array $options = []): Migrator
    {
        return $this->migrator([$this->set('site'), Schema::migrationSet()], $options);
    }

    private function runFile(string $name): void
    {
        $this->pdo->beginTransaction();
        $this->pdo->exec((string) file_get_contents(Schema::directory() . '/' . $name));
        $this->pdo->commit();
    }

    /** @return array<string, array{columns: list<string>, constraints: list<string>}> */
    private function shapes(): array
    {
        $shapes = [];
        foreach (['languages', 'translation_keys', 'translations', 'users'] as $table) {
            if ($this->tableExists($table)) {
                $shapes[$table] = $this->shapeOf($table);
            }
        }

        return $shapes;
    }

    /** @return list<string> */
    private function tables(): array
    {
        return $this->pdo->query("SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename")->fetchAll(PDO::FETCH_COLUMN);
    }
}
