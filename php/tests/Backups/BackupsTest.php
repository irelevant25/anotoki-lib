<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Backups;

use Anotoki\Lib\Backups\Archive;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\ChunkCipher;
use Anotoki\Lib\Backups\Copy;
use Anotoki\Lib\Backups\Spool;
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
        $scrambled = $this->sequences();

        $result = $backups->restore($backup['id'], 7);

        self::assertIsArray($result, $result instanceof Refusal ? $result->message : '');
        self::assertSame([$backup['id'], 4, null], [$result['restored'], $result['tables'], $result['after_restore_error']], 'people, notes, roles and the feedback; never the audit log or the bookkeeping');
        self::assertSame(array_diff_key($before, array_flip(self::KEPT)), array_diff_key($this->snapshot(), array_flip(self::KEPT)), 'every row as it was: updated_at untouched, no MEMBER row added by the trigger');
        // Every sequence where the later of the backup and today leaves it: a value handed out since is never handed
        // out again - the kept audit log may name it (and the kept tables' own are not touched at all).
        $keptSequences = array_flip(['anotoki_audit_log_id_seq', 'migrations_id_seq']);
        $restored = $this->sequences();
        foreach (array_keys(array_diff_key($sequences, $keptSequences)) as $name) {
            self::assertSame(max(self::nextOf($sequences[$name]), self::nextOf($scrambled[$name])), self::nextOf($restored[$name]), "$name never goes back");
        }
        self::assertSame(['anotoki_feedback_id_seq' => 1, 'notes_id_seq' => 501, 'people_id_seq' => 6, 'ticket_numbers' => 103], array_map(self::nextOf(...), array_intersect_key($restored, array_flip(['people_id_seq', 'ticket_numbers', 'notes_id_seq', 'anotoki_feedback_id_seq']))));
        self::assertGreaterThan(1, (int) $this->value('SELECT last_value FROM anotoki_audit_log_id_seq'), 'the audit log\'s ids go on');
        self::assertSame(['O', 'O'], $this->pdo->query("SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'people'::regclass AND NOT tgisinternal ORDER BY tgname")->fetchAll(PDO::FETCH_COLUMN), 'the triggers on again');
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM anotoki_audit_log WHERE action = 'kept.entry'"), 'the audit log kept as it is');
        self::assertSame(['backup.created', 'backup.created', 'backup.restored'], $this->pdo->query("SELECT action FROM anotoki_audit_log WHERE action LIKE 'backup.%' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame(3, (int) $this->value('SELECT count(*) FROM migrations'), 'the bookkeeping kept');
        self::assertStringContainsString('-before-restore-', $result['before_restore']);
        self::assertSame(['before-restore', 'manual'], array_column($backups->list(), 'kind'));

        $this->pdo->exec("INSERT INTO people (name) VALUES ('after the restore')");
        self::assertSame(6, (int) $this->value("SELECT id FROM people WHERE name = 'after the restore'"), 'never 5 again: the person made since had it');
    }

    /** The value a sequence hands out next, from sequences()' "last_value:is_called". */
    private static function nextOf(string $state): int
    {
        [$last, $called] = explode(':', $state);

        return (int) $last + ($called === 'true' ? 1 : 0);
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
        self::assertTrue($backup['sealed']);
        $sidecar = (string) file_get_contents($file . '.json');
        unlink($file . '.json');
        self::assertTrue($backups->get($backup['id'])['sealed'] ?? null, 'without its sidecar, sealed by its cipher alone');
        self::assertFalse($this->backupsWith()->get($backup['id'])['sealed'] ?? null, 'a site without a key made no encrypted backup');
        file_put_contents($file . '.json', $sidecar);
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

    public function testAnEncryptedSitesRowsAreSealedAsCopyHandsThemOverAndNeverInTheClearOnItsDisk(): void
    {
        $this->fill();
        $folder = $this->path('spools');
        mkdir($folder);
        $connection = $this->backupConnection();
        $sealed = Spool::create($folder . '/people.copy', true);
        $plain = Spool::create($folder . '/people-plain.copy', false);
        Copy::toFile($connection, '"public"."people"', '"id", "name"', $sealed->url());
        Copy::toFile($connection, '"public"."people"', '"id", "name"', $plain->url());

        $rows = (string) file_get_contents($folder . '/people-plain.copy');
        self::assertStringContainsString('Zuzana', $rows, 'a site that does not encrypt: its rows as COPY writes them');
        self::assertStringNotContainsString('Zuzana', (string) file_get_contents($folder . '/people.copy'), 'a site that does: sealed as they come');
        self::assertSame(['bytes' => strlen($rows), 'sha256' => hash('sha256', $rows), 'rows' => 4], $sealed->facts(), 'counted as they pass');
        self::assertSame($rows, (string) file_get_contents($sealed->url()), 'read back whole, as often as asked');
        self::assertSame($rows, (string) file_get_contents($sealed->url()));

        // A byte changed on the disk: the spool opens no more - its key was only ever in memory.
        $bytes = (string) file_get_contents($folder . '/people.copy');
        file_put_contents($folder . '/people.copy', substr_replace($bytes, chr(ord($bytes[24]) ^ 1), 24, 1));
        self::assertNotSame($rows, (string) @file_get_contents($sealed->url()));
        self::assertNotNull($sealed->failure());

        $sealed->discard();
        $plain->discard();
        self::assertSame([], glob($folder . '/*') ?: [], 'discarded: the files gone');
        self::assertFalse(@fopen($plain->url(), 'rb'), 'and their urls open nothing');
    }

    public function testAWorkingFolderAKillLeftBehindGoesOnceItIsAnHourOld(): void
    {
        $this->fill();
        $backups = $this->backupsWith();
        self::assertIsArray($backups->create());
        $stale = $this->backups . '/.tmp-20261001-000000Z-manual-' . str_repeat('a', 32);
        $fresh = $this->backups . '/.tmp-restore-' . str_repeat('b', 16);
        $foreign = $this->backups . '/.tmpfolder';
        foreach ([$stale . '/data', $fresh, $foreign] as $folder) {
            mkdir($folder, 0777, true);
        }
        file_put_contents($stale . '/data/001-people.copy', "1\tZuzana\n");
        foreach ([$stale . '/data/001-people.copy', $stale . '/data', $stale, $foreign] as $path) {
            touch($path, time() - 7200);
        }

        self::assertIsArray($backups->create(), 'the next backup sweeps');

        self::assertDirectoryDoesNotExist($stale, 'two hours old: gone');
        self::assertDirectoryExists($fresh, 'younger than an hour: perhaps a run of another process');
        self::assertDirectoryExists($foreign, 'not of the library\'s names: never touched');
    }

    public function testAnEncryptedSiteReadsNoBackupInTheClear(): void
    {
        $this->fill();
        $plain = $this->backupsWith()->create();
        self::assertIsArray($plain);
        $iam = $this->backupsWith(['encryption' => str_repeat('k', 32)]);

        $refused = $iam->restore($plain['id']);
        self::assertSame([422, 'archive_invalid'], [$refused->status ?? null, $refused->code ?? null], 'somebody put a plain one there: it is not restored');
        self::assertStringContainsString('encrypted, and this one is not', $refused->message ?? '');
        $this->expectException(\RuntimeException::class);
        $iam->extractTo($plain['id'], $this->path('offline'));
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

        self::assertSame([$backup['id'], 'manual', 'unlisted', null, false], [$listed['id'], $listed['kind'], $listed['status'], $listed['description'], $listed['sealed']]);
        // Without its sealed sidecar it is a file somebody put there: listed, never restored here.
        $refused = $backups->restore($backup['id']);
        self::assertSame([422, 'archive_invalid'], [$refused->status ?? null, $refused->code ?? null]);
        self::assertStringContainsString('no seal of this site', $refused->message ?? '');
        self::assertContains('It carries no seal of this site\'s - it was not made here, or it was changed since - so it is not restored here: restore it offline (README).', $backups->preview($backup['id'])['reasons']);
        self::assertSame($backup['id'], $backups->extractTo($backup['id'], $this->path('offline'))['id'], 'offline, its owner may still read it');
    }

    public function testAPlainBackupIsSealedAndAFileDroppedBesideItIsNeverRestored(): void
    {
        $this->fill();
        $backups = $this->backupsWith();
        $made = $backups->create();
        self::assertIsArray($made);
        self::assertTrue($made['sealed']);
        self::assertArrayNotHasKey('seal', $made, 'the seal itself is never shown');

        // Somebody drops a backup of their own making - a sidecar written to match - into the folder.
        $forged = '20261001-000000Z-manual-' . str_repeat('f', 32);
        $bytes = (string) file_get_contents($backups->path($made['id']));
        file_put_contents($backups->path($forged), str_replace($made['id'], $forged, $bytes));
        $sidecar = json_decode((string) file_get_contents($backups->path($made['id']) . '.json'), true);
        $sidecar = ['id' => $forged, 'sha256' => hash_file('sha256', $backups->path($forged)), 'seal' => hash_hmac('sha256', $forged . "\n" . hash_file('sha256', $backups->path($forged)), 'a key that is not this site\'s')] + $sidecar;
        file_put_contents($backups->path($forged) . '.json', (string) json_encode($sidecar));
        $listed = array_column($backups->list(), 'sealed', 'id');
        self::assertSame([true, false], [$listed[$made['id']], $listed[$forged]]);
        self::assertSame('archive_invalid', $backups->restore($forged)->code ?? null);

        // The sealed one restores; a byte of it changed, it does not.
        self::assertIsArray($backups->restore($made['id']));
        file_put_contents($backups->path($made['id']), substr_replace($bytes, 'X', -10, 1));
        self::assertSame('archive_invalid', $backups->restore($made['id'])->code ?? null);
    }

    public function testInspectingReadsTheManifestAloneAndWritesNothing(): void
    {
        $this->fill(large: true);
        $backups = $this->backupsWith(['encryption' => str_repeat('k', 32)]);
        $made = $backups->create();
        self::assertIsArray($made);
        $temporary = glob(sys_get_temp_dir() . '/anotoki-backup-inspect-*') ?: [];

        $manifest = $backups->manifest($made['id']);

        self::assertSame($made['id'], $manifest['id']);
        self::assertEquals(['people' => 4, 'notes' => 3500], array_intersect_key(array_column($manifest['tables'], 'rows', 'name'), ['people' => 1, 'notes' => 1]));
        self::assertSame($temporary, glob(sys_get_temp_dir() . '/anotoki-backup-inspect-*') ?: [], 'no folder in the system\'s temp');
        self::assertSame([], glob($this->backups . '/.tmp-*') ?: [], 'nor beside the backups');
        $this->expectException(\RuntimeException::class);
        $this->backupsWith(['encryption' => str_repeat('x', 32)])->manifest($made['id']);
    }

    public function testEveryFileAndFolderOfTheBackupsIsTheSitesAlone(): void
    {
        if (PHP_OS_FAMILY === 'Windows') {
            self::markTestSkipped('Windows keeps no Unix modes.');
        }
        $this->fill();
        $backups = $this->backupsWith();
        $made = $backups->create();
        self::assertIsArray($made);
        $backups->ticket($made['id'], 7);
        foreach ([$this->backups, $this->storage . '/cache', $this->storage . '/cache/backup-tickets'] as $folder) {
            self::assertSame('700', substr(sprintf('%o', fileperms($folder)), -3), $folder);
        }
        foreach (array_merge([$backups->path($made['id']), $backups->path($made['id']) . '.json'], glob($this->storage . '/cache/backup-tickets/*.ticket') ?: []) as $file) {
            self::assertSame('600', substr(sprintf('%o', fileperms($file)), -3), $file);
        }
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
        $stamp = (string) file_get_contents($this->storage . '/cache/anotoki-backup-daily.json');
        self::assertSame(['date', 'status', 'at'], array_keys((array) json_decode($stamp, true)), 'a file of a known name names no backup');
        self::assertStringNotContainsString($backups->list()[0]['id'], $stamp);

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
        $note = (string) file_get_contents($this->backups . '/.before-migration.json');
        self::assertSame(['pending', 'made'], array_keys((array) json_decode($note, true)), 'a hash of the files, and when its backup was made');
        self::assertStringNotContainsString($backups->list()[0]['id'], $note, 'a file of a known name names no backup');
        self::assertStringNotContainsString('002_broken', $note);
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

    public function testTwoFileNamesThatReadTheSameOnceMadePlainKeepAPartEach(): void
    {
        $this->siteSet = $this->set('shop', ['002_a b.sql' => 'SELECT 2;', '002_a_b.sql' => 'SELECT 3;']);
        self::assertNull($this->siteMigrator($this->pdo)->apply()['error']);
        $backups = $this->backupsWith();
        $backup = $backups->create();
        self::assertIsArray($backup);

        $manifest = $backups->extractTo($backup['id'], $this->path('plain'));

        $files = array_column(array_filter($manifest['schema_files'], static fn (array $f): bool => $f['set'] === 'shop'), 'file', 'name');
        self::assertSame('schema/shop/001_init.sql', $files['001_init.sql']);
        self::assertEqualsCanonicalizing(['schema/shop/002_a_b.sql', 'schema/shop/2-002_a_b.sql'], [$files['002_a b.sql'], $files['002_a_b.sql']], 'one part each');
        self::assertSame('SELECT 2;', file_get_contents($this->path('plain/' . $files['002_a b.sql'])));
        self::assertSame('SELECT 3;', file_get_contents($this->path('plain/' . $files['002_a_b.sql'])));
        self::assertIsArray($backups->restore($backup['id']), 'and it reads back whole');
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
