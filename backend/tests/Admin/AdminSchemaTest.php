<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Admin;

use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;

/** The library's set anotoki_admin: its files' rules, and what it makes - and does not touch - on a site's database. */
final class AdminSchemaTest extends DatabaseTestCase
{
    public function testEveryFileKeepsTheHouseRules(): void
    {
        $files = glob(Schema::directory() . '/*.sql') ?: [];
        self::assertSame(['001_audit_log.sql', '002_feedback.sql', '003_site_settings.sql'], array_map('basename', $files));

        foreach ($files as $file) {
            $sql = (string) file_get_contents($file);
            $name = basename($file);
            self::assertStringNotContainsString("\r", $sql, "$name has LF line endings");
            $lines = preg_split('/\R/', rtrim($sql));
            self::assertSame('-- end of ' . substr($name, 0, 3), end($lines), "$name ends with its own last line (Japanese Academy's draft rule)");

            // It names no site table: every table it creates, changes or writes is the library's.
            preg_match_all(
                '/\b(?:CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE|INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|DROP TABLE(?: IF EXISTS)?|ON)\s+([a-z_][a-z0-9_]*)/i',
                (string) preg_replace('/--.*$/m', '', $sql),
                $matches,
            );
            foreach ($matches[1] as $table) {
                self::assertStringStartsWith('anotoki_', $table, "$name touches only anotoki_ tables");
            }
        }
    }

    public function testTheSetMakesItsTablesFirstOnAnEmptyDatabase(): void
    {
        $site = $this->set('survey', ['001_init.sql' => 'CREATE TABLE surveys (id SERIAL PRIMARY KEY, title TEXT);']);
        $result = $this->migrator([Schema::migrationSet(), $site])->apply();

        self::assertNull($result['error']);
        self::assertSame(
            [
                ['set' => 'anotoki_admin', 'name' => '001_audit_log.sql'],
                ['set' => 'anotoki_admin', 'name' => '002_feedback.sql'],
                ['set' => 'anotoki_admin', 'name' => '003_site_settings.sql'],
                ['set' => 'survey', 'name' => '001_init.sql'],
            ],
            $result['applied'],
        );
        self::assertTrue(Schema::has($this->pdo, 'anotoki_audit_log'));
        self::assertTrue(Schema::has($this->pdo, 'anotoki_feedback'));
        self::assertFalse(Schema::has($this->pdo, 'anotoki_nothing'));
        self::assertSame(
            ['anotoki_admin/001_audit_log.sql', 'anotoki_admin/002_feedback.sql', 'anotoki_admin/003_site_settings.sql', '001_init.sql'],
            $this->pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(\PDO::FETCH_COLUMN),
            'a one-set site records the library\'s files as <set>/<file>',
        );

        $audit = $this->shapeOf('anotoki_audit_log');
        self::assertContains('action character varying(64) NOT NULL', $audit['columns']);
        self::assertContains('created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP', $audit['columns']);
        self::assertContains("anotoki_audit_log_action_check CHECK (((action)::text ~ '^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)+$'::text))", $audit['constraints']);
        $feedback = $this->shapeOf('anotoki_feedback');
        self::assertContains("status character varying(16) NOT NULL DEFAULT 'new'::character varying", $feedback['columns']);
        self::assertSame(
            [],
            array_values(array_filter($feedback['columns'], static fn(string $column): bool => str_starts_with($column, 'client_hash'))),
            'nothing of where a message came from: no address, no hash of one (the owner\'s decision)',
        );
        // 003 (0.11.0): the site settings - a row per switch, a row per page; nothing seeded.
        $switches = $this->shapeOf('anotoki_site_settings');
        self::assertContains('value jsonb NOT NULL', $switches['columns']);
        self::assertContains('anotoki_site_settings_pkey PRIMARY KEY (name)', $switches['constraints']);
        $pages = $this->shapeOf('anotoki_page_access');
        self::assertContains("visibility character varying(16) NOT NULL DEFAULT 'ADMIN'::character varying", $pages['columns'], 'a page nobody thought about is the administrators\' alone');
        self::assertContains("api_paths text[] NOT NULL DEFAULT '{}'::text[]", $pages['columns']);
        self::assertContains('anotoki_page_access_path_key UNIQUE (path)', $pages['constraints']);
        self::assertSame(0, (int) $this->pdo->query('SELECT (SELECT count(*) FROM anotoki_site_settings) + (SELECT count(*) FROM anotoki_page_access)')->fetchColumn());
        foreach (glob(Schema::directory() . '/*.sql') ?: [] as $file) {
            $release = basename($file) === '003_site_settings.sql' ? '0.11.0' : '0.4.0';
            self::assertStringContainsString("Released with anotoki-lib $release,", (string) file_get_contents($file), basename($file));
        }
    }

    public function testAGenshinShapedTableRecordsTheSetUnderItsFolder(): void
    {
        $this->pdo->exec(
            'CREATE TABLE migrations (id SERIAL PRIMARY KEY, folder VARCHAR(64) NOT NULL, filename VARCHAR(255) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE (folder, filename))',
        );
        $users = $this->set('users', ['001_users.sql' => 'CREATE TABLE users (id SERIAL PRIMARY KEY);']);
        $genshin = $this->set('genshin_impact', ['001_characters.sql' => 'CREATE TABLE characters (id SERIAL PRIMARY KEY);']);

        self::assertNull($this->migrator([Schema::migrationSet(), $users, $genshin])->apply()['error']);

        self::assertSame(
            ['anotoki_admin|001_audit_log.sql', 'anotoki_admin|002_feedback.sql', 'anotoki_admin|003_site_settings.sql', 'users|001_users.sql', 'genshin_impact|001_characters.sql'],
            $this->pdo->query("SELECT folder || '|' || filename FROM migrations ORDER BY id")->fetchAll(\PDO::FETCH_COLUMN),
        );
    }

    public function testAddedFirstToAnInstalledSiteItChangesNoTableOfTheSite(): void
    {
        $site = $this->set('iam', [
            '001_init.sql' => "CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, data JSONB, updated_at TIMESTAMPTZ DEFAULT now());
                CREATE TABLE audit_log (id BIGSERIAL PRIMARY KEY, actor_id INT REFERENCES users (id) ON DELETE SET NULL, action VARCHAR(64) NOT NULL, details JSONB);
                CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN NEW.updated_at := now(); RETURN NEW; END \$\$;
                CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch();
                INSERT INTO users (email, data) VALUES ('a@example.com', '{\"a\": 1}');
                INSERT INTO audit_log (actor_id, action) VALUES (1, 'user.created');",
        ]);
        self::assertNull($this->migrator([$site])->apply()['error']);
        $before = $this->siteTables();

        $result = $this->migrator([Schema::migrationSet(), $site])->apply();

        self::assertNull($result['error']);
        self::assertCount(3, $result['applied'], 'the library\'s three files, and nothing of the site\'s again');
        self::assertSame($before, $this->siteTables(), 'every table of the site as it was: columns, constraints, indexes, triggers, rows');
        self::assertSame([], $this->migrator([Schema::migrationSet(), $site])->applicable());
    }

    public function testATableOfThatNameInAnotherShapeIsRefusedNamingWhatDiffers(): void
    {
        $this->pdo->exec('CREATE TABLE anotoki_audit_log (id INT PRIMARY KEY, created_at TIMESTAMP, action TEXT)');

        $result = $this->migrator([Schema::migrationSet()])->apply();

        self::assertSame(['set' => 'anotoki_admin', 'name' => '001_audit_log.sql'], $result['failed']);
        self::assertStringContainsString('the table anotoki_audit_log is not the library\'s', (string) $result['error']);
        self::assertStringContainsString('id is integer, where it must be bigint', (string) $result['error']);
        self::assertStringContainsString('it has no column actor_id', (string) $result['error']);
    }

    public function testASiteSettingsTableOfThatNameInAnotherShapeIsRefusedNamingWhatDiffers(): void
    {
        // Genshin's own table has another name (site_routes): only a table made under the library's name some other way is refused.
        $this->pdo->exec('CREATE TABLE anotoki_page_access (id SERIAL PRIMARY KEY, path TEXT NOT NULL, visibility TEXT, blocked BOOLEAN)');

        $result = $this->migrator([Schema::migrationSet()])->apply();

        self::assertSame(['set' => 'anotoki_admin', 'name' => '003_site_settings.sql'], $result['failed']);
        self::assertStringContainsString('the site settings\' tables are not the library\'s', (string) $result['error']);
        self::assertStringContainsString('anotoki_page_access.id is integer, where it must be bigint', (string) $result['error']);
        self::assertStringContainsString('anotoki_page_access has no column api_paths', (string) $result['error']);
        self::assertFalse(Schema::has($this->pdo, 'anotoki_site_settings'), 'the file rolled back whole');
    }

    /** @return array<string, mixed> every table but the library's and the bookkeeping, as the catalog has it, with its rows */
    private function siteTables(): array
    {
        $tables = $this->pdo
            ->query(
                "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
                AND relname NOT LIKE 'anotoki\\_%' AND relname <> 'migrations' ORDER BY relname",
            )
            ->fetchAll(\PDO::FETCH_COLUMN);
        $out = [];
        foreach ($tables as $table) {
            $out[$table] = $this->shapeOf($table) + [
                'indexes' => $this->pdo->query("SELECT indexdef FROM pg_indexes WHERE tablename = '$table' ORDER BY indexname")->fetchAll(\PDO::FETCH_COLUMN),
                'triggers' => $this->pdo->query("SELECT tgname FROM pg_trigger WHERE tgrelid = '$table'::regclass AND NOT tgisinternal ORDER BY tgname")->fetchAll(\PDO::FETCH_COLUMN),
                'rows' => $this->pdo->query("SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM \"$table\" t")->fetchColumn(),
            ];
        }

        return $out;
    }
}
