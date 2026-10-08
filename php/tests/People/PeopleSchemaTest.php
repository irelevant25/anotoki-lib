<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\People;

use Anotoki\Lib\People\Schema;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\SiteShapes;
use PDO;

/** The library's set anotoki_people: its two tables on every site's shape, and nothing of the site's changed. */
final class PeopleSchemaTest extends DatabaseTestCase
{
    public function testOnEverySitesShapeItMakesItsTwoTablesAndChangesNoSiteTable(): void
    {
        foreach (SiteShapes::SITES as $site) {
            $this->pdo->exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
            $sets = $site === 'genshin' ? [$this->set('users'), $this->set('genshin_impact')] : [$this->set($site)];
            self::assertNull($this->migrator($sets)->apply()['error'], $site);
            SiteShapes::create($this->pdo, $site);
            SiteShapes::visitor($this->pdo, $site, -1);
            $this->pdo->exec('INSERT INTO users (id, ' . SiteShapes::table($site)->name . ') VALUES (7, \'alice\')');
            $before = $this->siteTables();

            $result = $this->migrator([...$sets, Schema::migrationSet()])->apply();

            self::assertNull($result['error'], "$site: " . $result['error']);
            self::assertSame([['set' => 'anotoki_people', 'name' => '001_people.sql']], $result['applied'], $site);
            self::assertSame($before, $this->siteTables(), "$site: every table of the site's as it was, its rows too");
            self::assertSame(['anotoki_people_anonymized', 'anotoki_people_sync'], $this->libraryTables(), $site);
            self::assertSame([['id' => 1, 'since' => null, 'checked_at' => null, 'ok_at' => null, 'error' => null, 'scrubbed' => 0]], $this->rows('SELECT * FROM anotoki_people_sync'), $site);
            $recorded = $site === 'genshin'
                ? $this->rows("SELECT folder, filename FROM migrations WHERE folder LIKE 'anotoki%'")
                : $this->rows("SELECT filename FROM migrations WHERE filename LIKE 'anotoki%'");
            self::assertSame($site === 'genshin' ? [['folder' => 'anotoki_people', 'filename' => '001_people.sql']] : [['filename' => 'anotoki_people/001_people.sql']], $recorded, $site);
        }
    }

    public function testRunTwiceItIsTheSame(): void
    {
        $sql = (string) file_get_contents(Schema::directory() . '/001_people.sql');
        $this->pdo->exec($sql);
        $this->pdo->exec("UPDATE anotoki_people_sync SET scrubbed = 3");
        $this->pdo->exec($sql);

        self::assertSame(3, (int) $this->value('SELECT scrubbed FROM anotoki_people_sync'));
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM anotoki_people_sync'));
        self::assertStringEndsWith("-- end of 001\n", $sql, 'the family\'s draft rule reads the last line');
        self::assertStringNotContainsString("\r", $sql);
    }

    public function testItRefusesAShapeItCannotWorkWith(): void
    {
        $this->pdo->exec('CREATE TABLE anotoki_people_anonymized (sub TEXT PRIMARY KEY, anonymized_at TIMESTAMP NOT NULL, scrubbed_at TIMESTAMPTZ NOT NULL DEFAULT now(), had_row BOOLEAN NOT NULL)');

        $result = $this->migrator([$this->set('site'), Schema::migrationSet()])->apply();

        self::assertSame(['set' => 'anotoki_people', 'name' => '001_people.sql'], $result['failed']);
        self::assertStringContainsString('anotoki_people_anonymized.sub is text, where it must be bigint', (string) $result['error']);
        self::assertStringContainsString('anotoki_people_anonymized.anonymized_at is timestamp without time zone, where it must be timestamp with time zone', (string) $result['error']);
        self::assertFalse($this->tableExists('anotoki_people_sync'), 'rolled back whole');
    }

    /**
     * Every table of the site's - its shape and its rows - to compare before and after.
     *
     * @return array<string, array<string, mixed>>
     */
    private function siteTables(): array
    {
        $tables = $this->pdo->query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'anotoki\\_%' AND tablename <> 'migrations' ORDER BY tablename")->fetchAll(PDO::FETCH_COLUMN);
        $state = [];
        foreach ($tables as $table) {
            $state[$table] = $this->shapeOf($table) + [
                'rows' => $this->rows("SELECT * FROM \"$table\" ORDER BY 1"),
                'indexes' => $this->pdo->query("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = '$table' ORDER BY indexname")->fetchAll(PDO::FETCH_COLUMN),
                'triggers' => $this->pdo->query("SELECT tgname FROM pg_trigger WHERE tgrelid = '\"$table\"'::regclass AND NOT tgisinternal ORDER BY tgname")->fetchAll(PDO::FETCH_COLUMN),
            ];
        }

        return $state;
    }

    /** @return list<string> */
    private function libraryTables(): array
    {
        return $this->pdo->query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'anotoki\\_%' ORDER BY tablename")->fetchAll(PDO::FETCH_COLUMN);
    }
}
