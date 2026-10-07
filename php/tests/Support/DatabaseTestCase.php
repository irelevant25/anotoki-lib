<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Support;

use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * A test case with a database of its own (made in setUp, dropped in tearDown)
 * and a temporary folder for its migration files.
 */
abstract class DatabaseTestCase extends TestCase
{
    protected string $database;
    protected PDO $pdo;
    private string $root;

    /** @var list<PDO> every connection this test opened, closed before the drop */
    private array $connections = [];

    protected function setUp(): void
    {
        $this->database = TestDatabase::create();
        $this->pdo = $this->connect();
        $this->root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'anotoki_lib_test_' . bin2hex(random_bytes(6));
        mkdir($this->root);
    }

    protected function tearDown(): void
    {
        $this->connections = [];
        unset($this->pdo);
        TestDatabase::drop($this->database);
        self::removeTree($this->root);
    }

    /** Another connection to this test's database. */
    protected function connect(): PDO
    {
        return $this->connections[] = TestDatabase::connect($this->database);
    }

    /**
     * A migration set in its own folder, holding these files.
     *
     * @param array<string, string> $files name => SQL
     */
    protected function set(string $name, array $files = []): MigrationSet
    {
        $directory = $this->root . '/' . $name;
        if (!is_dir($directory)) {
            mkdir($directory, 0777, true);
        }
        foreach ($files as $file => $sql) {
            file_put_contents($directory . '/' . $file, $sql);
        }

        return new MigrationSet($name, $directory);
    }

    /**
     * A library's migration set (named anotoki_*) in its own folder, holding these files.
     *
     * @param array<string, string> $files name => SQL
     */
    protected function librarySet(string $name, array $files = []): MigrationSet
    {
        return MigrationSet::library($name, $this->set('library-' . $name, $files)->directory);
    }

    /** A folder of this test's temporary root (for files that are no migration). */
    protected function path(string $relative): string
    {
        return $this->root . '/' . $relative;
    }

    /**
     * @param list<MigrationSet> $sets
     * @param array<string, mixed> $options
     */
    protected function migrator(array $sets, array $options = [], ?PDO $pdo = null): Migrator
    {
        return new Migrator($pdo ?? $this->pdo, $sets, $options);
    }

    protected function tableExists(string $table): bool
    {
        $statement = $this->pdo->prepare('SELECT to_regclass(?) IS NOT NULL');
        $statement->execute([$table]);

        return (bool) $statement->fetchColumn();
    }

    /**
     * The table's shape as the catalog has it - columns with their types,
     * nullability and defaults, and its constraints - to compare before and after.
     *
     * @return array{columns: list<string>, constraints: list<string>}
     */
    protected function shapeOf(string $table): array
    {
        $columns = $this->pdo->prepare(
            "SELECT a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                    || COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
               FROM pg_attribute a
               LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
              WHERE a.attrelid = CAST(? AS regclass) AND a.attnum > 0 AND NOT a.attisdropped
              ORDER BY a.attnum"
        );
        $columns->execute([$table]);

        $constraints = $this->pdo->prepare(
            "SELECT conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
              WHERE conrelid = CAST(? AS regclass) AND contype IN ('p', 'u', 'c', 'f') ORDER BY conname"
        );
        $constraints->execute([$table]);

        return [
            'columns' => $columns->fetchAll(PDO::FETCH_COLUMN),
            'constraints' => $constraints->fetchAll(PDO::FETCH_COLUMN),
        ];
    }

    /** @return list<array<string, mixed>> */
    protected function rows(string $sql): array
    {
        return $this->pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    }

    protected function value(string $sql): mixed
    {
        return $this->pdo->query($sql)->fetchColumn();
    }

    private static function removeTree(string $path): void
    {
        if (!file_exists($path)) {
            return;
        }
        if (is_dir($path) && !is_link($path)) {
            foreach (scandir($path) ?: [] as $entry) {
                if ($entry !== '.' && $entry !== '..') {
                    self::removeTree($path . '/' . $entry);
                }
            }
            rmdir($path);

            return;
        }
        unlink($path);
    }
}
