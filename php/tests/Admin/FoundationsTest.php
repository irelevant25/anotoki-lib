<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Admin;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\ErrorLog\ErrorLog;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Support\AfterResponse;
use Anotoki\Lib\Support\AtomicFile;
use Anotoki\Lib\Support\ClientAddress;
use Anotoki\Lib\Support\GuardedDirectory;
use Anotoki\Lib\Support\Keys;
use Anotoki\Lib\Support\Redactor;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Support\Throttle;
use Anotoki\Lib\Support\Utf8;
use Anotoki\Lib\Tests\Support\TemporaryFolder;
use InvalidArgumentException;
use LogicException;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RuntimeException;
use Slim\Factory\AppFactory;
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
        if (PHP_OS_FAMILY !== 'Windows') {
            self::assertSame(['700', '700'], [substr(sprintf('%o', fileperms($base . '/storage/logs')), -3), substr(sprintf('%o', fileperms($base . '/storage')), -3)], 'the site\'s own user\'s alone, the folders made on the way too');
        }

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
        self::assertTrue(AtomicFile::write($base . '/secret.json', '{}', mode: 0600));
        if (PHP_OS_FAMILY !== 'Windows') {
            self::assertSame('600', substr(sprintf('%o', fileperms($base . '/secret.json')), -3));
        }
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
        if (PHP_OS_FAMILY !== 'Windows') {
            self::assertSame('600', substr(sprintf('%o', fileperms($storage . '/anotoki-lib.key')), -3), 'the site\'s own user\'s alone');
        }
        self::assertFileExists($storage . '/.htaccess', 'a storage folder it made is guarded');

        $other = $this->temporaryFolder();
        self::assertFileDoesNotExist($other . '/.htaccess');
        self::assertNotSame($key, Keys::installation($other), 'every installation has its own');
        self::assertFileExists($other . '/.htaccess', 'a storage folder that was there gets its guard too: the key is never served');
        $own = $this->temporaryFolder();
        file_put_contents($own . '/.htaccess', "# the site's own\n");
        Keys::installation($own);
        self::assertSame("# the site's own\n", file_get_contents($own . '/.htaccess'), 'never over the site\'s');

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
        yield 'a JSON body\'s secret' => ['bad body {"password":"Summer2026!","name":"x"}', 'bad body {"password":{…},"name":"x"}'];
        yield 'a quoted name, a quoted escape' => ['{"token": "a\\"b c", "ok": 1}', '{"token": {…}, "ok": 1}'];
        yield 'single quotes' => ["sent {'pass': 'hunter2'}", "sent {'pass': {…}}"];
        yield 'a PHP array' => ["['password' => 'two words', 'secret'=>'s3']", "['password' => {…}, 'secret'=>{…}]"];
        yield 'names that only begin so' => ['passed: true, tokens: 5', 'passed: true, tokens: 5'];
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

    public function testAHugeOrHostileMessageIsReadOnlyAsFarAsALineKeepsAndNeverGivenUnredacted(): void
    {
        $huge = 'Failed for ana@example.com ' . str_repeat('x', 200000) . ' bo@example.com';
        $started = microtime(true);
        $redacted = Redactor::text($huge);
        self::assertLessThan(1.0, microtime(true) - $started);
        self::assertStringStartsWith('Failed for {email} ', $redacted);
        self::assertSame(Redactor::TEXT_LIMIT, Utf8::length($redacted) - strlen('{email}') + strlen('ana@example.com'), 'the first 4,096 characters, no more');

        // Quotes doubled without end: a quoted-value rule that backtracks would take its time on them.
        $hostile = 'ERROR: "' . str_repeat('""', 2000) . ' x';
        $started = microtime(true);
        $result = Redactor::text($hostile);
        self::assertLessThan(1.0, microtime(true) - $started);
        self::assertTrue($result === $hostile || $result === Redactor::UNREADABLE, 'as it was (nothing to take out), or not given at all - never half done');

        // PCRE's limits made tiny (and its JIT, which has limits of its own, off) in a process of its own, where no
        // pattern was compiled before: no rule can run.
        $code = 'require ' . var_export(dirname(__DIR__, 3) . '/vendor/autoload.php', true) . ';'
            . ' echo Anotoki\Lib\Support\Redactor::text("Key (email)=(ana@example.com) " . str_repeat("ab ", 50));';
        $process = proc_open([PHP_BINARY, '-d', 'pcre.jit=0', '-d', 'pcre.backtrack_limit=10', '-r', $code], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        self::assertIsResource($process);
        $output = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($process);
        self::assertSame(Redactor::UNREADABLE, $output, 'a rule that cannot run: nothing of the message, never the message unredacted');
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

    public function testAnAddressIsTheTrustedProxysHeaderFromThatProxyAlone(): void
    {
        $request = static fn (string $remote, array $headers = []): ServerRequestInterface => array_reduce(
            array_keys($headers),
            static fn (ServerRequestInterface $r, string $name): ServerRequestInterface => $r->withHeader($name, $headers[$name]),
            (new ServerRequestFactory())->createServerRequest('GET', 'https://site.example/', ['REMOTE_ADDR' => $remote])
        );

        foreach (['173.245.48.1', '104.16.0.9', '162.159.255.254', '2400:cb00::1', '2a06:98c0:3600::103'] as $edge) {
            self::assertTrue(ClientAddress::trusted($edge, ClientAddress::CLOUDFLARE), "$edge is Cloudflare's");
            self::assertSame('198.51.100.7', ClientAddress::of($request($edge, ['CF-Connecting-IP' => '198.51.100.7']), ClientAddress::CLOUDFLARE));
        }
        foreach (['203.0.113.9', '173.245.64.1', '2400:cb01::1', '10.0.0.1'] as $stranger) {
            self::assertFalse(ClientAddress::trusted($stranger, ClientAddress::CLOUDFLARE), "$stranger is not");
            self::assertSame($stranger, ClientAddress::of($request($stranger, ['CF-Connecting-IP' => '198.51.100.7', 'X-Forwarded-For' => '198.51.100.8']), ClientAddress::CLOUDFLARE), 'a header from anybody else is never believed');
        }
        self::assertSame('173.245.48.1', ClientAddress::of($request('173.245.48.1', ['CF-Connecting-IP' => 'not an address']), ClientAddress::CLOUDFLARE), 'a header that names no address: the connection\'s');
        self::assertSame('173.245.48.1', ClientAddress::of($request('173.245.48.1', ['CF-Connecting-IP' => '198.51.100.7'])), 'no trusted proxies: the connection\'s');
        self::assertSame('198.51.100.7', ClientAddress::of($request('192.0.2.10', ['X-Real-IP' => '198.51.100.7']), ['192.0.2.10'], 'X-Real-IP'), 'a site\'s own proxy and header');
        self::assertNull(ClientAddress::of($request('')));

        self::assertSame('2001:db8:1:2::/64', ClientAddress::bucket('2001:db8:1:2:3:4:5:6'), 'one subscriber\'s whole network');
        self::assertSame('2001:db8:1:2::/64', ClientAddress::bucket('2001:0db8:0001:0002:ffff::1'));
        self::assertSame('198.51.100.7', ClientAddress::bucket('198.51.100.7'));
        self::assertTrue(ClientAddress::within('10.1.2.3', '10.0.0.0/8'));
        self::assertFalse(ClientAddress::within('11.1.2.3', '10.0.0.0/8'));
        self::assertTrue(ClientAddress::within('192.0.2.10', '192.0.2.10'));
        self::assertFalse(ClientAddress::within('192.0.2.10', '192.0.2.10/33'), 'no such range');
        self::assertFalse(ClientAddress::within('2001:db8::1', '173.245.48.0/20'), 'an IPv6 address is never in an IPv4 range');

        // An IPv4 address written as IPv6 (a server listening on [::] for both: nginx without ipv6only, php -S) is
        // the IPv4 address it is: trusted by Cloudflare's IPv4 ranges, and counted whole - never all in ::/64.
        self::assertTrue(ClientAddress::within('::ffff:173.245.48.1', '173.245.48.0/20'));
        self::assertSame('198.51.100.7', ClientAddress::of($request('::ffff:173.245.48.1', ['CF-Connecting-IP' => '198.51.100.7']), ClientAddress::CLOUDFLARE), 'Cloudflare\'s, over IPv6');
        self::assertSame('203.0.113.9', ClientAddress::of($request('::ffff:203.0.113.9', ['CF-Connecting-IP' => '198.51.100.7']), ClientAddress::CLOUDFLARE), 'a stranger\'s header, over IPv6: not believed');
        self::assertSame('198.51.100.7', ClientAddress::of($request('::ffff:173.245.48.1', ['CF-Connecting-IP' => '::ffff:198.51.100.7']), ClientAddress::CLOUDFLARE));
        self::assertSame(['203.0.113.9', '198.51.100.1'], [ClientAddress::bucket('::ffff:203.0.113.9'), ClientAddress::bucket('::FFFF:198.51.100.1')]);
        self::assertSame('203.0.113.9', ClientAddress::plain('0:0:0:0:0:ffff:cb00:7109'));
        self::assertSame(['::1', '2001:db8::ffff:1.2.3.4'], [ClientAddress::plain('::1'), ClientAddress::plain('2001:db8::ffff:1.2.3.4')], 'only ::ffff:0:0/96 is IPv4');
        self::assertSame('203.0.113.9', (new AdminContext(static fn (): int => 1))->clientKey($request('::ffff:203.0.113.9')));
    }

    public function testTheContextCountsByTheTrustedProxyRuleAndNamesPeople(): void
    {
        $request = (new ServerRequestFactory())->createServerRequest('GET', 'https://site.example/', ['REMOTE_ADDR' => '2400:cb00::1'])->withHeader('CF-Connecting-IP', '2001:db8:aa:bb:1::2');
        $context = new AdminContext(static fn (): int => 1, trustedProxies: ClientAddress::CLOUDFLARE, names: static fn (array $ids): array => [1 => 'Ana', '2' => 'Bo', 3 => '', 4 => ['not a name']]);

        self::assertSame('2001:db8:aa:bb::/64', $context->clientKey($request), 'Cloudflare\'s header, the address\'s /64');
        self::assertSame('2400:cb00::/64', (new AdminContext(static fn (): int => 1))->clientKey($request), 'without trusted proxies, the edge\'s');
        self::assertSame([1 => 'Ana', 2 => 'Bo'], $context->names([1, '2', 3, 4, 1, null, '']), 'names alone, each id once');
        self::assertSame([], (new AdminContext(static fn (): int => 1))->names([1]), 'a site that gave none: no names');
        self::assertSame([], (new AdminContext(static fn (): int => 1, names: static function (): array {
            throw new RuntimeException('no database');
        }))->names([1]), 'a lookup that fails: no names, never an error');
    }

    public function testASitesOwnSecretNamesAreRedactedToo(): void
    {
        $message = 'Could not save totp_secret=JBSWY3DP and {"recovery_code": "1234-5678"} for x.key=abc';
        try {
            self::assertSame($message, Redactor::text($message), 'names the library does not know stay');
            Redactor::addSecretNames('totp_secret', 'Recovery_Code', 'x.key');
            self::assertSame('Could not save totp_secret={…} and {"recovery_code": {…}} for x.key={…}', Redactor::text($message));
            foreach (['', '1st', 'two words', 'name=', str_repeat('a', 65), 'ends.'] as $bad) {
                try {
                    Redactor::addSecretNames($bad);
                    self::fail("\"$bad\" was taken");
                } catch (InvalidArgumentException) {
                    // refused
                }
            }
        } finally {
            Redactor::forgetSiteSecretNames();
        }
        self::assertSame($message, Redactor::text($message), 'forgotten again: the library\'s alone');
    }

    public function testTheContextSaysWhoTheAdminIsAndRefusesEverybodyElse(): void
    {
        $request = (new ServerRequestFactory())->createServerRequest('GET', 'https://site.example/api/admin/x');
        $admins = new AdminContext(
            static fn (ServerRequestInterface $r): ?int => ctype_digit($r->getHeaderLine('X-Actor')) ? (int) $r->getHeaderLine('X-Actor') : null,
            isAdmin: static fn (ServerRequestInterface $r): bool => $r->getHeaderLine('X-Actor') === '1',
        );
        self::assertTrue($admins->knowsAdmins());
        self::assertSame([401, 'sign_in_required'], [$admins->adminRefusal($request)?->status, $admins->adminRefusal($request)?->code], 'nobody');
        self::assertSame([403, 'forbidden'], [$admins->adminRefusal($request->withHeader('X-Actor', '2'))?->status, $admins->adminRefusal($request->withHeader('X-Actor', '2'))?->code]);
        self::assertNull($admins->adminRefusal($request->withHeader('X-Actor', '1')));

        // A check that fails, or answers anything but true, is a no.
        $throwing = new AdminContext(static fn (): int => 1, isAdmin: static function (): bool {
            throw new RuntimeException('no token');
        });
        self::assertSame(403, $throwing->adminRefusal($request)?->status);
        $truthy = new AdminContext(static fn (): int => 1, isAdmin: static fn (): mixed => 'yes');
        self::assertSame(403, $truthy->adminRefusal($request)?->status);

        $unknown = new AdminContext(static fn (): int => 1);
        self::assertFalse($unknown->knowsAdmins());
        self::assertSame(403, $unknown->adminRefusal($request)?->status, 'a context that cannot tell is never a yes');
    }

    public function testAnAdminGroupAsksTheSitesAdminBeforeAnythingElseAndTheSitesOwnStillRunsFirst(): void
    {
        $log = new ErrorLog($this->temporaryFolder() . '/logs');
        $context = new AdminContext(
            static fn (ServerRequestInterface $r): ?int => is_int($r->getAttribute('person')) ? $r->getAttribute('person') : null,
            isAdmin: static fn (ServerRequestInterface $r): bool => $r->getAttribute('person') === 1,
        );
        $app = AppFactory::create();
        $ran = [];
        // The site's own middleware on the group: its session, which says who the person is.
        ErrorLogRoutes::admin($app, '/api/admin/errors', $log, $context)->add(static function (ServerRequestInterface $request, RequestHandlerInterface $handler) use (&$ran): ResponseInterface {
            $ran[] = 'the site\'s session';
            $person = $request->getHeaderLine('X-Session');

            return $handler->handle(ctype_digit($person) ? $request->withAttribute('person', (int) $person) : $request);
        });
        $get = static fn (string $session = ''): ResponseInterface => $app->handle(
            (new ServerRequestFactory())->createServerRequest('GET', 'https://site.example/api/admin/errors')->withHeader('X-Session', $session)
        );

        self::assertSame(401, $get()->getStatusCode(), 'nobody');
        self::assertSame(403, $get('2')->getStatusCode(), 'somebody, not the ADMIN');
        self::assertSame(200, $get('1')->getStatusCode(), 'the ADMIN, known by what the site\'s middleware set');
        self::assertSame(['the site\'s session', 'the site\'s session', 'the site\'s session'], $ran);

        // A context that does not say who the ADMIN is mounts no admin group at all.
        $bare = AppFactory::create();
        try {
            ErrorLogRoutes::admin($bare, '/api/admin/errors', $log, new AdminContext(static fn (): int => 1));
            self::fail('mounted without an ADMIN check');
        } catch (LogicException) {
            self::assertSame([], $bare->getRouteCollector()->getRoutes(), 'no route of it mounted');
        }
    }
}
