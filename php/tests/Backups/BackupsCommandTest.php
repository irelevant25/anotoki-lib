<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Backups;

use Anotoki\Lib\Backups\Cli\BackupsCommand;

/** The backups on the command line: list, create, inspect, extract (an encrypted one decrypted), restore. */
final class BackupsCommandTest extends BackupsTestCase
{
    public function testEveryCommand(): void
    {
        $this->fill();
        $backups = $this->backupsWith(['encryption' => str_repeat('k', 32)]);

        [$code, $out] = $this->runCommand($backups, ['--list']);
        self::assertSame([0, "No backups.\n"], [$code, $out]);

        [$code, $out] = $this->runCommand($backups, ['--create', 'Before the import']);
        self::assertSame(0, $code);
        self::assertMatchesRegularExpression('/^Made (\d{8}-\d{6}Z-manual-[0-9a-f]{32}) \(/', $out);
        $id = $backups->list()[0]['id'];
        self::assertNull($this->value("SELECT actor_id FROM anotoki_audit_log WHERE action = 'backup.created'"), 'by nobody');

        [$code, $out] = $this->runCommand($backups, ['--list']);
        self::assertSame(0, $code);
        self::assertStringContainsString("$id  manual", $out);
        self::assertStringContainsString('encrypted  Before the import', $out);

        [$code, $out] = $this->runCommand($backups, ["--inspect=$id"]);
        self::assertSame(0, $code);
        self::assertMatchesRegularExpression('/^\s+people\s+4 rows/m', $out, 'read through its encryption');

        $folder = $this->path('extracted');
        [$code, $out] = $this->runCommand($backups, ["--extract=$id", $folder]);
        self::assertSame(0, $code);
        self::assertStringContainsString('\\copy "public"."people" ("id", "name", "photo", "data", "tags", "scores", "born", "updated_at", "manager_id") FROM \'data/', $out);
        self::assertStringContainsString("  shop/001_init.sql\n", $out);
        self::assertFileExists($folder . '/manifest.json');
        self::assertFileDoesNotExist($folder . '/.htaccess', 'a folder of the owner\'s, not of the site');
        [$code] = $this->runCommand($backups, ["--extract=$id", $folder]);
        self::assertSame(1, $code, 'never into a folder that is there');

        $this->scramble();
        [$code, , $err] = $this->runCommand($backups, ["--restore=$id"]);
        self::assertSame(1, $code);
        self::assertStringContainsString('--confirm=', $err);
        [$code, $out] = $this->runCommand($backups, ["--restore=$id", '--confirm=' . substr($id, -6)]);
        self::assertSame(0, $code);
        self::assertStringStartsWith('Restored ', $out);
        self::assertSame(4, (int) $this->value('SELECT count(*) FROM people'));

        [$code, , $err] = $this->runCommand($backups, ['--inspect=20261008-101530Z-manual-' . str_repeat('0', 32)]);
        self::assertSame(1, $code);
        self::assertStringContainsString('There is no such backup', $err);
        self::assertSame(2, $this->runCommand($backups, ['--help'])[0]);
    }

    /**
     * @param list<string> $arguments
     * @return array{int, string, string}
     */
    private function runCommand(\Anotoki\Lib\Backups\Backups $backups, array $arguments): array
    {
        $out = fopen('php://memory', 'w+');
        $err = fopen('php://memory', 'w+');
        $code = (new BackupsCommand($backups, $out, $err))->run($arguments);
        rewind($out);
        rewind($err);

        return [$code, (string) stream_get_contents($out), (string) stream_get_contents($err)];
    }
}
