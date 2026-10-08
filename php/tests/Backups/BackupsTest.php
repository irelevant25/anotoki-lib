<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Backups;

use Anotoki\Lib\Backups\Archive;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\ChunkCipher;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Support\Keys;
use Anotoki\Lib\Support\Refusal;
use PDO;

/** Backups against a real database: made, restored whole or not at all, encrypted, kept and pruned. */
final class BackupsTest extends BackupsTestCase
{
    private const KEPT = ['anotoki_audit_log', 'migrations'];

    public function testARestorePutsEveryRowAndSequenceBackAsItWas(): void
    {
        $this->fill();
        $before = $this->snapshot();
        $sequences = $this->sequences();
        $backups = $this->backupsWith();

        $backup = $backups->create(Backups::MANUAL, 'Before the big change', 7);
        self::assertIsArray($backup);
        self::assertMatchesRegularExpression('/^\d{8}-\d{6}Z-manual-[0-9a-f]{32}$/D', $backup['id']);
        self::assertSame(['shop', 'manual', 'complete', false, 'Before the big change', 7], [$backup['site'], $backup['kind'], $backup['status'], $backup['encrypted'], $backup['description'], $backup['created_by']]);
        self::assertSame(hash_file('sha256', $backups->path($backup['id'])), $backup['sha256']);
        self::assertSame(filesize($backups->path($backup['id'])), $backup['size']);
        self::assertEquals(['people' => 4, 'notes' => 500, 'roles' => 5], array_intersect_key(array_column($backup['tables'], 'rows', 'name'), ['people' => 1, 'notes' => 1, 'roles' => 1]));
        self::assertStringContainsString('Zuzana', $this->plainBody($backups->path($backup['id'])), 'not encrypted: the data is there to read');
        self::assertFileExists($this->backups . '/.htaccess');
        self::assertSame([], glob($this->backups . '/.tmp-*') ?: [], 'no working folder left behind');

        $this->scramble();
        $this->pdo->exec("INSERT INTO anotoki_audit_log (action) VALUES ('kept.entry')");
        self::assertNotSame(array_diff_key($before, array_flip(self::KEPT)), array_diff_key($this->snapshot(), array_flip(self::KEPT)));

        $result = $backups->restore($backup['id'], 7);

        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertSame([$backup['id'], 4, null], [$result['restored'], $result['tables'], $result['after_restore_error']], 'people, notes, roles and the feedback; never the audit log or the bookkeeping');
        self::assertSame(array_diff_key($before, array_flip(self::KEPT)), array_diff_key($this->snapshot(), array_flip(self::KEPT)), 'every row as it was: updated_at untouched, no MEMBER row added by the trigger');
        $keptSequences = array_flip(['anotoki_audit_log_id_seq', 'migrations_id_seq']);
        self::assertSame(array_diff_key($sequences, $keptSequences), array_diff_key($this->sequences(), $keptSequences), 'every sequence as it was - but the kept tables\' own');
        self::assertGreaterThan(1, (int) $this->value('SELECT last_value FROM anotoki_audit_log_id_seq'), 'the audit log\'s ids go on');
        self::assertSame(['O', 'O'], $this->pdo->query("SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'people'::regclass AND NOT tgisinternal ORDER BY tgname")->fetchAll(PDO::FETCH_COLUMN), 'the triggers on again');
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM anotoki_audit_log WHERE action = 'kept.entry'"), 'the audit log kept as it is');
        self::assertSame(['backup.created', 'backup.created', 'backup.restored'], $this->pdo->query("SELECT action FROM anotoki_audit_log WHERE action LIKE 'backup.%' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame(3, (int) $this->value('SELECT count(*) FROM migrations'), 'the bookkeeping kept');
        self::assertStringContainsString('-before-restore-', $result['before_restore']);
        self::assertSame(['before-restore', 'manual'], array_column($backups->list(), 'kind'));

        $this->pdo->exec("INSERT INTO people (name) VALUES ('after the restore')");
        self::assertSame(5, (int) $this->value("SELECT id FROM people WHERE name = 'after the restore'"), 'the next id follows the restored sequence');
    }

    public function testTheIamsBackupIsUnreadableWithoutItsKeyAndAnyTamperingIsRefused(): void
    {
        $this->fill(large: true);
        $key = Keys::derive(str_repeat("\x42", 32), 'iam-backup');
        $backups = $this->backupsWith(['encryption' => $key]);
        $backup = $backups->create();
        self::assertIsArray($backup);
        $file = $backups->path($backup['id']);
        $bytes = (string) file_get_contents($file);
        self::assertTrue($backup['encrypted']);
        foreach (['Zuzana', 'manifest.json', 'people', 'ustar'] as $plain) {
            self::assertStringNotContainsString($plain, substr($bytes, strpos($bytes, "\n", strlen(Archive::MAGIC) + 1) + 1), "nothing readable in the body: $plain");
        }
        $header = Archive::header($file);
        self::assertSame([$backup['id'], 'aes-256-gcm', 'anotoki-lib/backup-chunks/v1'], [$header['id'], $header['cipher']['name'], $header['cipher']['info']], 'the header reads without the key');
        $chunks = $this->chunks($bytes);
        self::assertGreaterThan(2, count($chunks), 'several chunks');

        $this->scramble();
        $tampered = [
            'another key' => [$bytes, $this->backupsWith(['encryption' => Keys::derive(str_repeat("\x43", 32), 'iam-backup')])],
            'no key at all' => [$bytes, $this->backupsWith()],
            'a flipped byte' => [substr_replace($bytes, chr(ord($bytes[$chunks[1][0] + 40]) ^ 1), $chunks[1][0] + 40, 1), null],
            'the tail cut' => [substr($bytes, 0, $chunks[count($chunks) - 1][0]), null],
            'the last chunk lost its flag' => [$this->withoutLastFlag($bytes, $chunks), null],
            'two chunks swapped' => [$this->swapped($bytes, $chunks), null],
            'the header changed' => [str_replace('"kind":"manual"', '"kind":"daily"', $bytes), null],
            'more after the end' => [$bytes . 'x', null],
        ];
        $live = $this->snapshot();
        foreach ($tampered as $what => [$content, $other]) {
            file_put_contents($file, $content);
            @unlink($file . '.json');
            $refused = ($other ?? $backups)->restore($backup['id']);
            self::assertInstanceOf(Refusal::class, $refused, $what);
            self::assertSame([422, 'archive_invalid'], [$refused->status, $refused->code], $what);
        }
        self::assertSame($live, $this->snapshot(), 'nothing restored, nothing touched');

        file_put_contents($file, $bytes);
        $result = $backups->restore($backup['id']);
        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertSame(3500, (int) $this->value('SELECT count(*) FROM notes'));
    }

    public function testASidecarsChecksumCatchesAChangedFile(): void
    {
        $this->fill();
        $backups = $this->backupsWith();
        $backup = $backups->create();
        self::assertIsArray($backup);
        $file = $backups->path($backup['id']);
        $bytes = (string) file_get_contents($file);
        file_put_contents($file, substr_replace($bytes, chr(ord($bytes[-1]) ^ 1), -1));

        $refused = $backups->restore($backup['id']);

        self::assertInstanceOf(Refusal::class, $refused);
        self::assertSame('archive_invalid', $refused->code);
        self::assertStringContainsString('checksum', $refused->message);
    }

    public function testAnotherSchemaIsRefusedNamingWhatDiffers(): void
    {
        $this->fill();
        $backups = $this->backupsWith();
        $backup = $backups->create();
        self::assertIsArray($backup);

        $this->siteSet = $this->set('shop', ['002_more.sql' => 'ALTER TABLE people ADD COLUMN nickname TEXT;']);
        self::assertNull($this->siteMigrator($this->pdo)->apply()['error']);
        $refused = $backups->restore($backup['id']);
        self::assertInstanceOf(Refusal::class, $refused);
        self::assertSame([409, 'schema_differs'], [$refused->status, $refused->code]);
        self::assertSame(['shop/002_more.sql'], $refused->extra['differs']['only_here']);
        self::assertFalse($refused->extra['differs']['columns_equal']);
        self::assertFalse($backups->preview($backup['id'])['restorable']);

        // A column changed by hand, without a migration, is a difference too.
        $newer = $backups->create();
        self::assertIsArray($newer);
        $this->pdo->exec('ALTER TABLE people ALTER COLUMN born TYPE TIMESTAMP');
        $refused = $backups->restore($newer['id']);
        self::assertSame('schema_differs', $refused instanceof Refusal ? $refused->code : null);
        self::assertSame([], $refused->extra['differs']['only_here']);
    }

    public function testAFailureMidwayLeavesEverythingAsItWas(): void
    {
        $this->fill();
        $backups = $this->backupsWith();
        $backup = $backups->create();
        self::assertIsArray($backup);
        $this->scramble();
        // A rule the backup's rows break, which no column fingerprint sees: the load of notes fails half way.
        $this->pdo->exec('ALTER TABLE notes ADD CONSTRAINT notes_small CHECK (amount < 10) NOT VALID');
        $live = $this->snapshot();

        $refused = $backups->restore($backup['id'], 3);

        self::assertInstanceOf(Refusal::class, $refused);
        self::assertSame([500, 'restore_failed'], [$refused->status, $refused->code]);
        self::assertStringContainsString('notes_small', $refused->message);
        self::assertSame(
            array_diff_key($live, array_flip(self::KEPT)),
            array_diff_key($this->snapshot(), array_flip(self::KEPT)),
            'rolled back whole: the tables emptied and half loaded are as they were'
        );
        self::assertSame(['O', 'O'], $this->pdo->query("SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'people'::regclass AND NOT tgisinternal ORDER BY tgname")->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame(['backup.created', 'backup.created', 'backup.restore_failed'], $this->pdo->query("SELECT action FROM anotoki_audit_log WHERE action LIKE 'backup.%' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN));
        self::assertCount(1, array_filter($backups->list(), static fn (array $b): bool => $b['kind'] === 'before-restore'), 'never without a copy of what was there');
    }

    public function testATableKeptThatRefersToARestoredOneIsAConfigurationError(): void
    {
        $this->fill();
        $backups = $this->backupsWith(['keep' => ['roles']]);
        $backup = $backups->create();
        self::assertIsArray($backup);

        $refused = $backups->restore($backup['id']);

        self::assertSame('keep_conflict', $refused instanceof Refusal ? $refused->code : null);
        self::assertStringContainsString('roles', $refused->message);
        self::assertFalse($backups->status()['restorable']);
    }

    public function testTheIamsRestoreIsSwitchedOff(): void
    {
        $this->fill();
        $backups = $this->backupsWith(['restore' => false]);
        $backup = $backups->create();
        self::assertIsArray($backup);

        $refused = $backups->restore($backup['id']);

        self::assertSame([403, 'restore_disabled'], [$refused->status ?? null, $refused->code ?? null]);
        self::assertSame(['Restoring is switched off on this site.'], $backups->preview($backup['id'])['reasons']);
        self::assertFalse($backups->status()['restorable']);
    }

    public function testOneBackupOrApplyAtATime(): void
    {
        $this->fill();
        $other = $this->connect();
        $other->query('SELECT pg_advisory_lock(' . Migrator::DEFAULT_LOCK . ')');

        $busy = $this->backupsWith()->create();

        self::assertSame([409, 'busy'], [$busy->status ?? null, $busy->code ?? null]);
        $other->query('SELECT pg_advisory_unlock(' . Migrator::DEFAULT_LOCK . ')');
        self::assertIsArray($this->backupsWith()->create());

        $lock = fopen($this->backups . '/.lock', 'c');
        flock($lock, LOCK_EX);
        try {
            self::assertSame('busy', $this->backupsWith()->create()->code ?? null, 'another backup in this folder');
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public function testRetentionKeepsTheNewestOfEachKindAndNeverTouchesAForeignFile(): void
    {
        $backups = $this->backupsWith(['keepDaily' => 3]);
        $first = $backups->create(Backups::DAILY);
        self::assertIsArray($first);
        // Older dailies, as earlier days left them.
        foreach (range(1, 4) as $day) {
            $id = gmdate('Ymd', time() - $day * 86400) . '-010000Z-daily-' . str_repeat((string) $day, 32);
            copy($backups->path($first['id']), $backups->path($id));
            $sidecar = json_decode((string) file_get_contents($backups->path($first['id']) . '.json'), true);
            file_put_contents($backups->path($id) . '.json', (string) json_encode(['id' => $id] + $sidecar));
        }
        $foreign = ['academy-2026-10-01.json', '20260101-000000-abcdef', 'x.anotoki-backup', '20261001-010000Z-daily-' . str_repeat('9', 32) . '.anotoki-backup.bak'];
        foreach ($foreign as $name) {
            str_contains($name, '.') ? file_put_contents($this->backups . '/' . $name, 'theirs') : mkdir($this->backups . '/' . $name);
        }
        $manual = $backups->create(Backups::MANUAL);

        self::assertIsArray($backups->create(Backups::DAILY));
        $kinds = array_count_values(array_column($backups->list(), 'kind'));
        ksort($kinds);
        self::assertSame(['daily' => 3, 'manual' => 1], $kinds, 'three dailies, the manual one until deleted');
        foreach ($foreign as $name) {
            self::assertFileExists($this->backups . '/' . $name, "$name is not the library's to delete");
        }
        self::assertTrue($backups->delete($manual['id']));
        self::assertFileDoesNotExist($backups->path($manual['id']));
        self::assertFileDoesNotExist($backups->path($manual['id']) . '.json');
        self::assertSame('not_found', $backups->delete($manual['id'])->code ?? null);
        self::assertNull($backups->get('../../etc/passwd'));
    }

    public function testAFileWithoutItsSidecarIsListedFromItsHeader(): void
    {
        $this->fill();
        $backups = $this->backupsWith();
        $backup = $backups->create(Backups::MANUAL, 'described');
        self::assertIsArray($backup);
        unlink($backups->path($backup['id']) . '.json');

        $listed = $backups->list()[0];

        self::assertSame([$backup['id'], 'manual', 'unlisted', null], [$listed['id'], $listed['kind'], $listed['status'], $listed['description']]);
        self::assertIsArray($backups->restore($backup['id']), 'it restores without one too');
    }

    public function testTheDailyRunsOnceADayAfterTheAnswer(): void
    {
        $this->fill();
        $deferred = [];
        $backups = $this->backupsWith(['defer' => static function (callable $work) use (&$deferred): void {
            $deferred[] = $work;
        }]);

        self::assertTrue($backups->dailyIfDue());
        self::assertTrue($backups->dailyIfDue(), 'two requests at once both queue it');
        self::assertSame([], $backups->list(), 'nothing before the answer');
        foreach ($deferred as $work) {
            $work();
        }
        self::assertSame(['daily'], array_column($backups->list(), 'kind'), 'one backup made');
        self::assertFalse($backups->dailyIfDue(), 'done for today');

        // Another process holds the day's claim: this one leaves.
        file_put_contents($this->storage . '/cache/anotoki-backup-daily.json', '{"date":"2000-01-01","status":"done"}');
        $claim = fopen($this->storage . '/cache/anotoki-backup-daily.json', 'c+');
        flock($claim, LOCK_EX);
        $deferred = [];
        try {
            self::assertTrue($backups->dailyIfDue());
            ($deferred[0])();
        } finally {
            flock($claim, LOCK_UN);
            fclose($claim);
        }
        self::assertCount(1, $backups->list());

        // A site that is not ready (an update waits) gets none.
        $waiting = $this->backupsWith(['ready' => static fn (): bool => false, 'defer' => static function (callable $work): void {
            $work();
        }]);
        $waiting->dailyIfDue();
        self::assertCount(1, $backups->list());
    }

    public function testABackupBeforeTheUpdateOnceForItsFiles(): void
    {
        $this->fill();
        $backups = $this->backupsWith();
        $guard = [];
        $hook = $backups->beforeApplyHook(static function (PDO $pdo, array $files) use (&$guard): string {
            $guard[] = $files;

            return 'The order is right.';
        });
        $this->siteSet = $this->set('shop', ['002_broken.sql' => 'SELECT 1/0;']);
        $migrator = new Migrator($this->pdo, [\Anotoki\Lib\Admin\Schema::migrationSet(), $this->siteSet], ['beforeApply' => $hook]);

        $first = $migrator->apply();
        self::assertSame(['set' => 'shop', 'name' => '002_broken.sql'], $first['failed']);
        self::assertMatchesRegularExpression('/^The order is right\. A backup of the database as it was is \d{8}-\d{6}Z-before-migration-[0-9a-f]{32}\.$/D', (string) $first['note']);
        self::assertCount(1, $guard, 'the site\'s own hook ran first');
        $again = $migrator->apply();
        self::assertSame($first['note'], $again['note'], 'tried again: the same backup');
        self::assertCount(1, $backups->list());

        // A backup that cannot be made stops the update before anything runs.
        $this->siteSet = $this->set('shop', ['002_broken.sql' => 'CREATE TABLE extra (id INT);']);
        $failing = new Backups(static function (): PDO {
            throw new \RuntimeException('could not connect to server');
        }, $this->backups, ['migrator' => fn (PDO $pdo): Migrator => $this->siteMigrator($pdo), 'onError' => static function (): void {
        }]);
        $stopped = (new Migrator($this->pdo, [\Anotoki\Lib\Admin\Schema::migrationSet(), $this->siteSet], ['beforeApply' => $failing->beforeApplyHook()]))->apply();
        self::assertSame([], $stopped['applied']);
        self::assertStringStartsWith('The backup before the update could not be made, so nothing was applied', (string) $stopped['error']);
        self::assertFalse($this->tableExists('extra'));
    }

    public function testANewInstallationHasNothingToKeepBeforeItsFirstUpdate(): void
    {
        $this->pdo->exec('DROP TABLE roles, notes, people, migrations CASCADE');
        $this->pdo->exec('DROP SEQUENCE ticket_numbers');
        $this->pdo->exec('DROP FUNCTION give_member(), touch()');
        $this->pdo->exec('DROP TABLE anotoki_audit_log, anotoki_feedback');
        $backups = $this->backupsWith();
        $migrator = new Migrator($this->pdo, [\Anotoki\Lib\Admin\Schema::migrationSet(), $this->siteSet], ['beforeApply' => $backups->beforeApplyHook()]);

        $result = $migrator->apply();

        self::assertNull($result['error']);
        self::assertNull($result['note']);
        self::assertSame([], $backups->list());
    }

    public function testThePreviewCountsWhatARestoreTakesAway(): void
    {
        $this->fill();
        $backups = $this->backupsWith();
        $backup = $backups->create();
        self::assertIsArray($backup);
        $this->scramble();

        $preview = $backups->preview($backup['id']);

        self::assertTrue($preview['restorable']);
        self::assertSame(self::KEPT, $preview['kept']);
        self::assertSame(['people' => [5, 4, 1], 'notes' => [334, 500, -166]], array_combine(
            array_column($preview['differences'], 'name'),
            array_map(static fn (array $d): array => [$d['live'], $d['backup'], $d['delta']], $preview['differences'])
        ));
        self::assertSame(1, $preview['lost'], 'the person added since');
        self::assertSame('not_found', $backups->preview('20261008-101530Z-manual-' . str_repeat('0', 32))->code ?? null);
    }

    public function testACircleOfKeysThatCannotBeDeferredIsNamed(): void
    {
        $this->pdo->exec('CREATE TABLE eggs (id INT PRIMARY KEY, hen INT); CREATE TABLE hens (id INT PRIMARY KEY, egg INT REFERENCES eggs (id)); ALTER TABLE eggs ADD FOREIGN KEY (hen) REFERENCES hens (id)');

        $refused = $this->backupsWith()->create();

        self::assertSame('backup_failed', $refused->code ?? null);
        self::assertStringContainsString('eggs, hens', $refused->message);

        $this->pdo->exec('ALTER TABLE eggs DROP CONSTRAINT eggs_hen_fkey, ADD FOREIGN KEY (hen) REFERENCES hens (id) DEFERRABLE');
        $this->pdo->exec('INSERT INTO eggs VALUES (1, NULL); INSERT INTO hens VALUES (1, 1); UPDATE eggs SET hen = 1');
        $backups = $this->backupsWith();
        $backup = $backups->create();
        self::assertIsArray($backup);
        self::assertIsArray($backups->restore($backup['id']), 'a deferrable key is checked when the restore commits');
        self::assertSame(1, (int) $this->value('SELECT hen FROM eggs'));
    }

    public function testAPlainPdoWorksToo(): void
    {
        $this->fill();
        $settings = \Anotoki\Lib\Tests\Support\TestDatabase::settings();
        $plain = new PDO(sprintf('pgsql:host=%s;port=%d;dbname=%s', $settings['host'], $settings['port'], $this->database), $settings['username'], $settings['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $before = $this->snapshot();
        $backups = $this->backupsWith([], $plain);

        $backup = $backups->create();
        self::assertIsArray($backup);
        $this->scramble();
        self::assertIsArray($backups->restore($backup['id']));

        self::assertSame(array_diff_key($before, array_flip(self::KEPT)), array_diff_key($this->snapshot(), array_flip(self::KEPT)));
    }

    public function testTheOfflineToolsReadTheArchiveIntoPlainFiles(): void
    {
        $this->fill();
        $backups = $this->backupsWith(['encryption' => str_repeat('k', 32)]);
        $backup = $backups->create();
        self::assertIsArray($backup);
        $into = $this->path('offline');

        $manifest = $backups->extractTo($backup['id'], $into);

        self::assertSame($backup['id'], $manifest['id']);
        self::assertFileExists($into . '/schema/shop/001_init.sql');
        self::assertFileExists($into . '/schema/anotoki_admin/001_audit_log.sql');
        $people = array_values(array_filter($manifest['tables'], static fn (array $t): bool => $t['name'] === 'people'))[0];
        $copy = (string) file_get_contents($into . '/' . $people['file']);
        self::assertStringContainsString("Zuzana\\tTab", $copy, 'PostgreSQL\'s COPY text, loadable by psql \\copy');
        self::assertStringContainsString('\\N', $copy);
        self::assertSame(['id', 'name', 'photo', 'data', 'tags', 'scores', 'born', 'updated_at', 'manager_id'], $people['columns']);
        $notes = array_values(array_filter($manifest['tables'], static fn (array $t): bool => $t['name'] === 'notes'))[0];
        self::assertNotContains('loud', $notes['columns'], 'a generated column is never copied');
        $order = array_flip(array_column($manifest['tables'], 'name'));
        self::assertLessThan($order['notes'], $order['people'], 'parents first');
        self::assertLessThan($order['roles'], $order['people'], 'parents first');
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** The body of a backup that is not encrypted, decompressed. */
    private function plainBody(string $file): string
    {
        $bytes = (string) file_get_contents($file);
        $body = substr($bytes, strpos($bytes, "\n", strlen(Archive::MAGIC) + 1) + 1);

        return (string) gzdecode($body);
    }

    /**
     * Where each chunk of an encrypted body starts, and how long it is.
     *
     * @return list<array{int, int}>
     */
    private function chunks(string $bytes): array
    {
        $offset = strpos($bytes, "\n", strlen(Archive::MAGIC) + 1) + 1;
        $chunks = [];
        while ($offset < strlen($bytes)) {
            $word = unpack('N', substr($bytes, $offset, 4))[1];
            $length = 4 + ChunkCipher::NONCE + ($word & 0x7FFFFFFF) + ChunkCipher::TAG;
            $chunks[] = [$offset, $length];
            $offset += $length;
        }

        return $chunks;
    }

    /** @param list<array{int, int}> $chunks */
    private function swapped(string $bytes, array $chunks): string
    {
        [$a, $aLength] = $chunks[0];
        [$b, $bLength] = $chunks[1];

        return substr($bytes, 0, $a) . substr($bytes, $b, $bLength) . substr($bytes, $a, $aLength) . substr($bytes, $b + $bLength);
    }

    /** @param list<array{int, int}> $chunks */
    private function withoutLastFlag(string $bytes, array $chunks): string
    {
        [$last] = $chunks[count($chunks) - 1];
        $word = unpack('N', substr($bytes, $last, 4))[1] & 0x7FFFFFFF;

        return substr_replace($bytes, pack('N', $word), $last, 4);
    }
}
