<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Backups;

use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\Copy;
use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\TestDatabase;
use PDO;

/**
 * A site's database for the backups' tests: the library's set first, then a set
 * of the site's own with every kind of value the sites keep - BYTEA, JSONB,
 * arrays, NULLs, tabs, newlines and backslashes, a table that refers to itself,
 * a trigger that adds rows (the IAM's MEMBER), a generated column, sequences -
 * and a table large enough for several encrypted chunks.
 */
abstract class BackupsTestCase extends DatabaseTestCase
{
    protected const SITE_SQL = <<<'SQL'
CREATE TABLE people (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    photo       BYTEA,
    data        JSONB,
    tags        TEXT[],
    scores      INT[],
    born        DATE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    manager_id  INT REFERENCES people (id)
);
CREATE TABLE notes (
    id          BIGSERIAL PRIMARY KEY,
    person_id   INT NOT NULL REFERENCES people (id),
    body        TEXT,
    flags       JSONB NOT NULL DEFAULT '{}',
    amount      NUMERIC(10, 2),
    blob        BYTEA,
    loud        TEXT GENERATED ALWAYS AS (upper(body)) STORED
);
CREATE TABLE roles (
    person_id   INT NOT NULL REFERENCES people (id),
    role        TEXT NOT NULL,
    PRIMARY KEY (person_id, role)
);
CREATE FUNCTION give_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO roles (person_id, role) VALUES (NEW.id, 'MEMBER') ON CONFLICT DO NOTHING;
    RETURN NEW;
END $$;
CREATE TRIGGER people_member AFTER INSERT ON people FOR EACH ROW EXECUTE FUNCTION give_member();
CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER people_touch BEFORE INSERT OR UPDATE ON people FOR EACH ROW EXECUTE FUNCTION touch();
CREATE SEQUENCE ticket_numbers START 100;
SQL;

    protected MigrationSet $siteSet;

    /** @var list<string> what the backups told their onError */
    protected array $failures = [];
    protected string $backups;
    protected string $storage;

    protected function setUp(): void
    {
        parent::setUp();
        $this->siteSet = $this->set('shop', ['001_init.sql' => self::SITE_SQL]);
        self::assertNull($this->siteMigrator($this->pdo)->apply()['error']);
        $this->storage = $this->path('storage');
        $this->backups = $this->storage . '/backups';
    }

    /** The data: every awkward value, and (with $large) enough random bytes for several chunks. */
    protected function fill(bool $large = false): void
    {
        $this->pdo->exec(<<<'SQL'
INSERT INTO people (name, photo, data, tags, scores, born) VALUES
    (E'Zuzana\tTab', decode(repeat('00ff7f80', 64), 'hex'), '{"a": [1, 2.5, null, true], "b": {"c": "quote \" and \\ backslash"}, "ž": "ľščť"}', ARRAY['one', NULL, 'with "quotes"', 'with,comma', E'new\nline'], ARRAY[1, NULL, -3], '2001-02-03'),
    (E'Line\nBreak \\ backslash', NULL, NULL, NULL, NULL, NULL),
    ('Ľudmila Šťastná 日本', '\x'::bytea, '[]', '{}', '{}', '1999-12-31');
UPDATE people SET manager_id = 1 WHERE id IN (2, 3);
INSERT INTO people (name, manager_id) VALUES ('Reports to 3', 3);
INSERT INTO roles (person_id, role) VALUES (1, 'ADMIN');
INSERT INTO notes (person_id, body, flags, amount) SELECT 1 + g % 4, 'note ' || g, jsonb_build_object('n', g), g / 7.0 FROM generate_series(1, 500) g;
SELECT nextval('ticket_numbers'), nextval('ticket_numbers');
SQL);
        if ($large) {
            $this->pdo->exec(
                "INSERT INTO notes (person_id, body, blob)
                 SELECT 2, 'blob ' || g, decode((SELECT string_agg(md5(random()::text || g || h), '') FROM generate_series(1, 64) h), 'hex')
                   FROM generate_series(1, 3000) g"
            );
        }
    }

    protected function siteMigrator(PDO $pdo): Migrator
    {
        return new Migrator($pdo, [Schema::migrationSet(), $this->siteSet]);
    }

    /** A connection as the backups take one: Pdo\Pgsql where PHP has it. */
    protected function backupConnection(): PDO
    {
        $settings = TestDatabase::settings();

        return Copy::connect(sprintf('pgsql:host=%s;port=%d;dbname=%s', $settings['host'], $settings['port'], $this->database), $settings['username'], $settings['password']);
    }

    /** @param array<string, mixed> $options */
    protected function backupsWith(array $options = [], ?PDO $connection = null): Backups
    {
        $connection ??= $this->backupConnection();

        return new Backups(static fn (): PDO => $connection, $this->backups, $options + [
            'site' => 'shop',
            'migrator' => fn (PDO $pdo): Migrator => $this->siteMigrator($pdo),
            'audit' => new AuditLog(static fn (): PDO => $connection),
            'onError' => function (\Throwable $e): void {
                $this->failures[] = $e->getMessage();
            },
        ]);
    }

    /** @return array<string, string> every table's rows, as a hash each */
    protected function snapshot(): array
    {
        $tables = $this->pdo->query("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname")->fetchAll(PDO::FETCH_COLUMN);
        $out = [];
        foreach ($tables as $table) {
            $out[$table] = (string) $this->pdo->query("SELECT count(*) || ':' || coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') FROM \"$table\" t")->fetchColumn();
        }

        return $out;
    }

    /** @return array<string, string> every sequence's state */
    protected function sequences(): array
    {
        $out = [];
        foreach ($this->pdo->query("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S' ORDER BY relname")->fetchAll(PDO::FETCH_COLUMN) as $sequence) {
            $out[$sequence] = (string) $this->pdo->query("SELECT last_value || ':' || is_called FROM \"$sequence\"")->fetchColumn();
        }

        return $out;
    }

    /** The data changed every way a restore must undo. */
    protected function scramble(): void
    {
        $this->pdo->exec("UPDATE people SET name = 'changed', photo = NULL WHERE id = 1");
        $this->pdo->exec('DELETE FROM notes WHERE id % 3 = 0');
        $this->pdo->exec("INSERT INTO people (name) VALUES ('new person')");
        $this->pdo->exec("SELECT nextval('ticket_numbers')");
        $this->pdo->exec("DELETE FROM roles WHERE role = 'ADMIN'");
    }
}
