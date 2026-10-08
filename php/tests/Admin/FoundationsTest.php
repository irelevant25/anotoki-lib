<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Admin;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Support\AfterResponse;
use Anotoki\Lib\Support\AtomicFile;
use Anotoki\Lib\Support\GuardedDirectory;
use Anotoki\Lib\Support\Keys;
use Anotoki\Lib\Support\Redactor;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Support\Throttle;
use Anotoki\Lib\Support\Utf8;
use Anotoki\Lib\Tests\Support\TemporaryFolder;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/** The admin tools' foundations: guarded folders, keys, the redactor, the throttle, the runner after the answer, the context. */
final class FoundationsTest extends TestCase
{
    use TemporaryFolder;

    protected function tearDown(): void
    {
        $this->removeTemporaryFolders();
    }

    public function testAGuardedFolderIsMadeWithItsDenyAllAndNeverOverwritten(): void
    {
        $base = $this->temporaryFolder();

        self::assertTrue(GuardedDirectory::ensure($base . '/storage/logs'));
        $guard = (string) file_get_contents($base . '/storage/logs/.htaccess');
        self::assertStringContainsString('Require all denied', $guard, 'Apache 2.4');
        self::assertStringContainsString('Deny from all', $guard, 'Apache 2.2');
        self::assertStringContainsString('Options -Indexes', $guard);
        self::assertSame('', file_get_contents($base . '/storage/logs/index.html'));

        file_put_contents($base . '/storage/logs/.htaccess', "# the site's own\n");
        self::assertTrue(GuardedDirectory::ensure($base . '/storage/logs'));
        self::assertSame("# the site's own\n", file_get_contents($base . '/storage/logs/.htaccess'), 'never overwritten');

        file_put_contents($base . '/a-file', 'x');
        self::assertFalse(GuardedDirectory::ensure($base . '/a-file/below'), 'no folder under a file');
        self::assertFalse(GuardedDirectory::ensure(''));
    }

    public function testAnAtomicFileIsWholeAndAnExclusiveOneNeverReplaced(): void
    {
        $base = $this->temporaryFolder();

        self::assertTrue(AtomicFile::write($base . '/a.json', '{"a":1}'));
        self::assertTrue(AtomicFile::write($base . '/a.json', '{"a":2}'));
        self::assertSame('{"a":2}', file_get_contents($base . '/a.json'));
        self::assertFalse(AtomicFile::write($base . '/a.json', '{"a":3}', exclusive: true));
        self::assertSame('{"a":2}', file_get_contents($base . '/a.json'));
        self::assertSame(['.', '..', 'a.json'], scandir($base), 'nothing left aside');
    }

    public function testKeysAreDerivedForOnePurposeEach(): void
    {
        $secret = str_repeat("\x01", 32);

        self::assertSame(hash_hkdf('sha256', $secret, 32, 'anotoki-lib/iam-backup/v1'), Keys::derive($secret, 'iam-backup'));
        self::assertSame(32, strlen(Keys::derive($secret, 'iam-backup', 'salt')));
        self::assertNotSame(Keys::derive($secret, 'iam-backup'), Keys::derive($secret, 'error-log'));
        self::assertNotSame(Keys::derive($secret, 'iam-backup'), Keys::derive($secret, 'iam-backup', 'salt'));

        foreach (['', 'Iam', 'iam backup', 'iam/backup', str_repeat('a', 64)] as $purpose) {
            try {
                Keys::derive($secret, $purpose);
                self::fail("\"$purpose\" passed");
            } catch (InvalidArgumentException) {
                // refused
            }
        }
        $this->expectException(InvalidArgumentException::class);
        Keys::derive('', 'iam-backup');
    }

    public function testTheInstallationKeyIsMadeOnceAndKept(): void
    {
        $storage = $this->temporaryFolder() . '/storage';

        $key = Keys::installation($storage);
        self::assertSame(32, strlen($key));
        self::assertSame($key, Keys::installation($storage), 'read back, never made again');
        self::assertSame($key, Keys::installation($storage . '/'));
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}\n$/D', (string) file_get_contents($storage . '/anotoki-lib.key'));
        self::assertFileExists($storage . '/.htaccess', 'a storage folder it made is guarded');

        $other = $this->temporaryFolder();
        self::assertNotSame($key, Keys::installation($other), 'every installation has its own');

        // A file a dying process left empty, long ago: made again.
        $stale = $this->temporaryFolder();
        file_put_contents($stale . '/anotoki-lib.key', '');
        touch($stale . '/anotoki-lib.key', time() - 60);
        self::assertSame(32, strlen(Keys::installation($stale)));
    }

    public function testATornKeyIsNeverTakenForAKey(): void
    {
        $storage = $this->temporaryFolder();
        file_put_contents($storage . '/anotoki-lib.key', 'not a key');

        $this->expectException(RuntimeException::class);
        Keys::installation($storage);
    }

    /** @return iterable<string, array{string, string}> */
    public static function redactions(): iterable
    {
        yield 'PostgreSQL detail' => [
            "SQLSTATE[23505]: Unique violation: 7 ERROR:  duplicate key value violates unique constraint \"users_email_key\"\nDETAIL:  Key (email)=(ana@example.com) already exists.",
            'SQLSTATE[23505]: Unique violation: 7 ERROR:  duplicate key value violates unique constraint "users_email_key"',
        ];
        yield 'the failing row' => [
            "SQLSTATE[23514]: Check violation: 7 ERROR:  new row for relation \"x\" violates check constraint \"c\"\nDETAIL:  Failing row contains (1, secret words).\nCONTEXT:  COPY x, line 1",
            'SQLSTATE[23514]: Check violation: 7 ERROR:  new row for relation "x" violates check constraint "c"',
        ];
        yield 'an echoed value' => [
            'SQLSTATE[22P02]: Invalid text representation: 7 ERROR:  invalid input syntax for type integer: "ana@example.com 42"',
            'SQLSTATE[22P02]: Invalid text representation: 7 ERROR:  invalid input syntax for type integer: "{…}"',
        ];
        yield 'an e-mail address' => ['No account for ana.novak+x@mail.example.sk.', 'No account for {email}.'];
        yield 'a JWT' => ['Bad token eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI0MiJ9.c2lnbmF0dXJl here', 'Bad token {token} here'];
        yield 'a Bearer credential' => ['Authorization: Bearer abc.def-ghi', 'Authorization: {…} {…}'];
        yield 'Bearer alone' => ['sent Bearer abcdefghijklmnop', 'sent Bearer {…}'];
        yield 'name=value secrets' => ['password=hunter2&next=/ token: "s3cr3t" cookie=a1b2', 'password={…}&next=/ token: {…} cookie={…}'];
        yield 'a query string' => ['GET https://iam.example.sk/reset?token=abc123&x=1 failed', 'GET https://iam.example.sk/reset?{…} failed'];
        yield 'IPv4' => ['from 203.0.113.7, again 10.0.0.1:8080', 'from {ip}, again {ip}:8080'];
        yield 'IPv6' => ['from 2001:db8::1 and [fe80::1%eth0] and ::ffff:198.51.100.7', 'from {ip} and [{ip}] and ::ffff:{ip}'];
        yield 'a hex token' => ['reset 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 used', 'reset {token} used'];
        yield 'a base64url token' => ['session Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA_ gone', 'session {token} gone'];
        yield 'words stay' => ['Slim\\Exception\\HttpMethodNotAllowedException at Foo::bar 10:01:02, version 8.5.10', 'Slim\\Exception\\HttpMethodNotAllowedException at Foo::bar 10:01:02, version 8.5.10'];
        yield 'a backup name' => ['20261008-101530Z-daily-9f86d081884c7d659a2feaa0c55ad015 missing', '{token} missing'];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('redactions')]
    public function testTheRedactorTakesOutPeopleAndSecrets(string $text, string $expected): void
    {
        self::assertSame($expected, Redactor::text($text));
    }

    public function testAPathKeepsWordsAndNumbersAndLosesWhatCouldBeAPersonsOrASecret(): void
    {
        self::assertSame('/api/admin/users/42/roles', Redactor::path('/api/admin/users/42/roles'));
        self::assertSame('/api/characters/raiden-shogun-2024', Redactor::path('/api/characters/raiden-shogun-2024'));
        self::assertSame('/api/admin/backups/{…}/ticket', Redactor::path('/api/admin/backups/20261008-101530Z-daily-9f86d081884c7d659a2feaa0c55ad015/ticket'));
        self::assertSame('/api/people/{…}', Redactor::path('/api/people/ana%40example.com'));
        self::assertSame('/api/x/{…}', Redactor::path('/api/x/203.0.113.7'));
        self::assertSame('/api/t/{…}', Redactor::path('/api/t/aB3dE5gH7jK9mN1pQ3sT5v'));
        self::assertSame('/api/x/{…}', Redactor::path('/api/x/' . str_repeat('word', 11)));
        self::assertSame('/api/reset', Redactor::path('/api/reset?token=abc#x'), 'never a query or a fragment');
        self::assertSame(200, Utf8::length(Redactor::path('/' . str_repeat('a/', 300))));
    }

    public function testTextThatIsNoUtf8IsReadAnyway(): void
    {
        self::assertSame('bad ?( byte {email}', Redactor::text("bad \xC3\x28 byte ana@example.com"));
        self::assertSame('ab?', Utf8::scrub("ab\xFF"));
        self::assertSame(3, Utf8::length('ž5š'));
        self::assertSame('žl', Utf8::prefix('žltý', 2));
        self::assertSame('žl…', Utf8::cut('žltý kôň', 3));
        self::assertSame('kôň', Utf8::cut('kôň', 3));
    }

    public function testTheThrottleLetsOneCallerThroughAnInterval(): void
    {
        $stamp = $this->temporaryFolder() . '/cache/prune.stamp';

        self::assertTrue(Throttle::due($stamp, 3600));
        self::assertFalse(Throttle::due($stamp, 3600), 'not again within the hour');
        file_put_contents($stamp, (string) (time() - 3601));
        self::assertTrue(Throttle::due($stamp, 3600), 'the hour is over');

        // Another process holds the stamp this moment: this one leaves at once.
        file_put_contents($stamp, '0');
        $other = fopen($stamp, 'c+');
        flock($other, LOCK_EX);
        try {
            self::assertFalse(Throttle::due($stamp, 3600));
        } finally {
            flock($other, LOCK_UN);
            fclose($other);
        }
        self::assertTrue(Throttle::due($stamp, 3600));

        $daily = dirname($stamp) . '/daily.stamp';
        self::assertTrue(Throttle::once($daily, '2026-10-08'));
        self::assertFalse(Throttle::once($daily, '2026-10-08'));
        self::assertTrue(Throttle::once($daily, '2026-10-09'));
    }

    public function testTheRunnerAfterTheAnswerRunsEveryPieceOnItsOwn(): void
    {
        $after = new AfterResponse();
        $ran = [];
        $errors = [];
        $after->defer(function () use (&$ran, $after): void {
            $ran[] = 'one';
            $after->defer(function () use (&$ran): void {
                $ran[] = 'queued by one';
            });
        });
        $after->defer(static function (): void {
            throw new RuntimeException('two failed');
        });
        $after->defer(function () use (&$ran): void {
            $ran[] = 'three';
        });
        self::assertSame(3, $after->pending());

        $after->run(static function (\Throwable $e) use (&$errors): void {
            $errors[] = $e->getMessage();
        }, finish: false);

        self::assertSame(['one', 'three', 'queued by one'], $ran);
        self::assertSame(['two failed'], $errors);
        self::assertSame(0, $after->pending());
        self::assertSame(AfterResponse::shared(), AfterResponse::shared());
    }

    public function testTheContextAsksTheSiteAndRefusesWithoutAProof(): void
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', 'https://site.example/x', ['REMOTE_ADDR' => '203.0.113.7']);
        $none = new AdminContext(static fn (): int => 7);

        self::assertSame(7, $none->actorId($request));
        self::assertSame('203.0.113.7', $none->clientKey($request), 'the connection\'s address by default');
        self::assertSame('recent_sign_in', $none->proofKind($request));
        self::assertSame('proof_unavailable', $none->proof($request, [])?->code, 'no proof given: refused, never waved through');

        $iamLike = new AdminContext(
            static fn (): int => 1,
            static fn ($r, array $body): array => ($body['password'] ?? null) === 'right'
                ? ['proof' => 'password']
                : ['status' => 422, 'code' => 'wrong_password', 'error' => 'The current password is not right'],
            'password',
            static fn (): string => '198.51.100.0/24',
        );
        self::assertNull($iamLike->proof($request, ['password' => 'right']));
        $wrong = $iamLike->proof($request, ['password' => 'wrong']);
        self::assertSame([422, 'wrong_password', 'The current password is not right'], [$wrong?->status, $wrong?->code, $wrong?->message]);
        self::assertSame('password', $iamLike->proofKind($request));
        self::assertSame('198.51.100.0/24', $iamLike->clientKey($request));

        $authTime = null;
        $site = new AdminContext(static fn (): string => '42', AdminContext::recentSignIn(static function () use (&$authTime): ?int {
            return $authTime;
        }));
        self::assertSame('reauth_required', $site->proof($request, [])?->code, 'no auth_time');
        $authTime = time() - 601;
        self::assertSame('reauth_required', $site->proof($request, [])?->code, 'eleven minutes ago');
        $authTime = time() - 30;
        self::assertNull($site->proof($request, []));
        self::assertSame('42', $site->actorId($request));

        $failing = new AdminContext(static function (): int {
            throw new RuntimeException('no token');
        });
        self::assertNull($failing->actorId($request));

        $response = $site->refuse((new ResponseFactory())->createResponse(), new Refusal(503, 'feature_unavailable', 'Wait.'));
        self::assertSame([503, '60', 'no-store'], [$response->getStatusCode(), $response->getHeaderLine('Retry-After'), $response->getHeaderLine('Cache-Control')]);
        self::assertSame(['code' => 'feature_unavailable', 'message' => 'Wait.'], json_decode((string) $response->getBody(), true));

        $this->expectException(InvalidArgumentException::class);
        new AdminContext(static fn (): int => 1, null, 'magic');
    }
}
