<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Support;

use PDO;
use RuntimeException;

/**
 * Throwaway databases on a real PostgreSQL server: anotoki_lib_test_<random>,
 * one per test case, dropped after it (and at the end of the run, should a
 * test die before its tearDown).
 *
 * The server comes from the environment, never from a file of this repository:
 * - ANOTOKI_LIB_TEST_DB_CONFIG: a PHP file returning ['host' => ..., 'port' => ..., 'username' => ...,
 *   'password' => ...] (other keys are ignored, so a site's config/database.local.php works); or
 * - ANOTOKI_LIB_TEST_PGHOST, ANOTOKI_LIB_TEST_PGPORT, ANOTOKI_LIB_TEST_PGUSER, ANOTOKI_LIB_TEST_PGPASSWORD (CI).
 * The user needs CREATEDB. Nothing here prints the settings.
 */
final class TestDatabase
{
    /** @var ?array{host: string, port: int, username: string, password: string} */
    private static ?array $settings = null;

    private static ?PDO $server = null;

    /** @var array<string, true> made and not dropped yet */
    private static array $made = [];

    private static bool $cleanupRegistered = false;

    /** Makes an empty database and answers its name. */
    public static function create(): string
    {
        $name = 'anotoki_lib_test_' . bin2hex(random_bytes(6));
        self::server()->exec('CREATE DATABASE "' . $name . '" TEMPLATE template0');
        self::$made[$name] = true;

        if (!self::$cleanupRegistered) {
            self::$cleanupRegistered = true;
            register_shutdown_function(static function (): void {
                foreach (array_keys(self::$made) as $name) {
                    self::drop($name);
                }
            });
        }

        return $name;
    }

    /** A new connection to $database, as a site makes one: errors as exceptions, nothing else set. */
    public static function connect(string $database): PDO
    {
        $settings = self::settings();

        return new PDO(
            sprintf('pgsql:host=%s;port=%d;dbname=%s', $settings['host'], $settings['port'], $database),
            $settings['username'],
            $settings['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    }

    /** Drops a database this made, whoever is still connected to it. */
    public static function drop(string $name): void
    {
        self::server()->exec('DROP DATABASE IF EXISTS "' . $name . '" WITH (FORCE)');
        unset(self::$made[$name]);
    }

    /** @return array{host: string, port: int, username: string, password: string} */
    public static function settings(): array
    {
        if (self::$settings !== null) {
            return self::$settings;
        }

        $file = getenv('ANOTOKI_LIB_TEST_DB_CONFIG');
        if (is_string($file) && $file !== '') {
            if (!is_file($file)) {
                throw new RuntimeException('ANOTOKI_LIB_TEST_DB_CONFIG names no file.');
            }
            $config = (static fn (string $path): mixed => require $path)($file);
            if (!is_array($config)) {
                throw new RuntimeException('The file ANOTOKI_LIB_TEST_DB_CONFIG names must return an array.');
            }

            return self::$settings = [
                'host' => (string) ($config['host'] ?? 'localhost'),
                'port' => (int) ($config['port'] ?? 5432),
                'username' => (string) ($config['username'] ?? ''),
                'password' => (string) ($config['password'] ?? ''),
            ];
        }

        $host = getenv('ANOTOKI_LIB_TEST_PGHOST');
        if (is_string($host) && $host !== '') {
            return self::$settings = [
                'host' => $host,
                'port' => (int) (getenv('ANOTOKI_LIB_TEST_PGPORT') ?: 5432),
                'username' => (string) getenv('ANOTOKI_LIB_TEST_PGUSER'),
                'password' => (string) getenv('ANOTOKI_LIB_TEST_PGPASSWORD'),
            ];
        }

        throw new RuntimeException(
            'These tests need a PostgreSQL server: set ANOTOKI_LIB_TEST_DB_CONFIG to a PHP file returning'
            . ' [host, port, username, password], or ANOTOKI_LIB_TEST_PGHOST, ANOTOKI_LIB_TEST_PGPORT,'
            . ' ANOTOKI_LIB_TEST_PGUSER and ANOTOKI_LIB_TEST_PGPASSWORD.'
        );
    }

    private static function server(): PDO
    {
        return self::$server ??= self::connect('postgres');
    }
}
