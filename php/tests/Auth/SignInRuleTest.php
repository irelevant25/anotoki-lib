<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Auth;

use Anotoki\Lib\Auth\IamClient;
use Anotoki\Lib\Auth\SignInRule;
use Anotoki\Lib\Auth\Testing\StandInIam;
use Anotoki\Lib\Auth\Testing\TestIam;
use Anotoki\Lib\Tests\Support\LogLines;
use Anotoki\Lib\Tests\Support\TempFolder;
use PHPUnit\Framework\TestCase;

/**
 * Whether signing in is required: every case of the IAM's SDK suite - what an answer means, whether to ask,
 * the tests' seam, the kept answer, the memo, the single-flight claim - and, against the stand-in IAM on a
 * free port, the fetches themselves; plus known(), which the library adds.
 */
final class SignInRuleTest extends TestCase
{
    use TempFolder;

    private const NOW = 1700000000;

    protected function tearDown(): void
    {
        $this->removeFolder();
        LogLines::take();
    }

    public function testWhatAnAnswerMeans(): void
    {
        $now = self::NOW;
        $kept = static fn (?bool $value, int $fetchedAt = 0, int $failedAt = 0, int $triedAt = 0): array => ['login_required' => $value, 'fetched_at' => $fetchedAt, 'failed_at' => $failedAt, 'tried_at' => $triedAt];
        $answer = static fn (mixed $value, string $clientId = 'app'): string => json_encode(['client_id' => $clientId, 'name' => 'App', 'login_required' => $value]);

        $cases = [
            // name => [status, body, kept record, value, reason, kept login_required, kept known]
            '200 true' => [200, $answer(true), null, true, 'read', true, true],
            '200 false' => [200, $answer(false), null, false, 'read', false, true],
            '200 false over a kept true' => [200, $answer(false), $kept(true, $now - 100), false, 'read', false, true],
            '200 for another client_id, nothing kept' => [200, $answer(false, 'other'), null, true, 'never_read', null, null],
            '200 for another client_id, false kept' => [200, $answer(true, 'other'), $kept(false, $now - 100), false, 'stale', false, true],
            '404 - unknown or switched off' => [404, null, null, true, 'unknown_application', true, false],
            '404 over a kept false' => [404, null, $kept(false, $now - 100), true, 'unknown_application', true, false],
            '503 with false kept' => [503, null, $kept(false, $now - 100), false, 'stale', false, true],
            '503 with nothing kept' => [503, null, null, true, 'never_read', null, null],
            '500 with false kept' => [500, null, $kept(false, $now - 100), false, 'stale', false, true],
            '500 with nothing kept' => [500, null, null, true, 'never_read', null, null],
            'unreachable with false kept' => [0, null, $kept(false, $now - 100), false, 'stale', false, true],
            'unreachable with nothing kept' => [0, null, null, true, 'never_read', null, null],
            'a redirect' => [302, null, null, true, 'never_read', null, null],
            'garbage JSON' => [200, '<html>proxy error</html>', null, true, 'never_read', null, null],
            'garbage JSON, false kept' => [200, '{"client_id": "app", ', $kept(false, $now - 100), false, 'stale', false, true],
            'login_required "false" (a string)' => [200, $answer('false'), null, true, 'never_read', null, null],
            'login_required 0' => [200, $answer(0), null, true, 'never_read', null, null],
            'login_required null' => [200, $answer(null), null, true, 'never_read', null, null],
            'login_required missing' => [200, json_encode(['client_id' => 'app', 'name' => 'App']), null, true, 'never_read', null, null],
            'a JSON list' => [200, json_encode([false]), null, true, 'never_read', null, null],
            'a JSON scalar' => [200, 'false', null, true, 'never_read', null, null],
        ];

        foreach ($cases as $name => [$status, $body, $record, $value, $reason, $keptValue, $known]) {
            $outcome = SignInRule::fromAnswer($status, $body, 'app', $record, $now);
            self::assertSame([$value, $reason, $keptValue, $known], [$outcome['value'], $outcome['reason'], $outcome['cache']['login_required'], $outcome['cache']['known']], $name);
        }

        $read = SignInRule::fromAnswer(200, $answer(false), 'app', $kept(true, $now - 100, $now - 70), $now);
        self::assertSame([$now, 0], [$read['cache']['fetched_at'], $read['cache']['failed_at']], 'a read keeps its time and clears a failure');
        $failed = SignInRule::fromAnswer(503, null, 'app', $kept(false, $now - 100), $now);
        self::assertSame([$now, $now - 100], [$failed['cache']['failed_at'], $failed['cache']['fetched_at']], 'a failure keeps its time and the read time');
    }

    public function testWhetherToAsk(): void
    {
        $now = self::NOW;
        $kept = static fn (?bool $value, int $fetchedAt = 0, int $failedAt = 0, int $triedAt = 0): array => ['login_required' => $value, 'fetched_at' => $fetchedAt, 'failed_at' => $failedAt, 'tried_at' => $triedAt];

        $cases = [
            // name => [kept record, fetch, value, reason]
            'nothing kept' => [null, true, true, 'fetch'],
            'a fresh false' => [$kept(false, $now - 10), false, false, 'fresh'],
            'a fresh true' => [$kept(true, $now - 59), false, true, 'fresh'],
            'false read 60 s ago' => [$kept(false, $now - 60), true, false, 'fetch'],
            'a read time in the future' => [$kept(false, $now + 30), true, false, 'fetch'],
            'the back-off after a failure, false kept' => [$kept(false, $now - 100, $now - 10), false, false, 'backing_off'],
            'the back-off after a failure, nothing kept' => [$kept(null, 0, $now - 10), false, true, 'backing_off'],
            'the back-off over' => [$kept(false, $now - 200, $now - 60), true, false, 'fetch'],
            'another request claimed it' => [$kept(false, $now - 100, 0, $now - 1), false, false, 'refreshing'],
            'another request claimed it, nothing kept' => [$kept(null, 0, 0, $now), false, true, 'refreshing'],
            'a claim left by a request that died' => [$kept(false, $now - 100, 0, $now - 6), true, false, 'fetch'],
            'a claim already answered' => [$kept(false, $now - 100, $now - 100, $now - 100), true, false, 'fetch'],
        ];

        foreach ($cases as $name => [$record, $fetch, $value, $reason]) {
            self::assertSame(['fetch' => $fetch, 'value' => $value, 'reason' => $reason], SignInRule::fromCache($record, $now, 60, 2), $name);
        }
    }

    public function testARecordTheSdkKeptIsReadAndSaysWhetherTheIamKnewTheSite(): void
    {
        self::assertSame(['login_required' => false, 'known' => true, 'fetched_at' => 5, 'failed_at' => 0, 'tried_at' => 0], SignInRule::record(['login_required' => false, 'fetched_at' => 5]), 'only a 200 keeps false');
        self::assertNull(SignInRule::record(['login_required' => true, 'fetched_at' => 5])['known'], 'a kept true may have been a 404');
        self::assertSame(['login_required' => null, 'known' => null, 'fetched_at' => 0, 'failed_at' => 0, 'tried_at' => 0], SignInRule::record(['login_required' => 'false', 'fetched_at' => -3, 'tried_at' => '9']));
        self::assertSame(['login_required' => null, 'known' => null, 'fetched_at' => 0, 'failed_at' => 0, 'tried_at' => 0], SignInRule::record('garbage'));
    }

    public function testNoIamNoAnswer(): void
    {
        $rule = new SignInRule(new IamClient('', 'app'));

        self::assertTrue($rule->required());
        self::assertSame('not_configured', $rule->reason());
        self::assertFalse($rule->known());
    }

    public function testTheTestsSeamIsTheIamsAnswerReadEveryTime(): void
    {
        $iam = TestIam::create($this->folder('iam'), 'http://127.0.0.1:9', 'app');
        $rule = new SignInRule($iam->client());

        $iam->signInRule(false);
        self::assertSame([false, 'read', true], [$rule->required(), $rule->reason(), $rule->known()]);
        $iam->signInRule(true);
        self::assertFalse($rule->required(), 'the memo holds for the request');
        $rule->reset();
        self::assertSame([true, 'read'], [$rule->required(), $rule->reason()], 'read again at once after a reset');
        $iam->signInRule(false, 'other');
        $rule->reset();
        self::assertSame([true, 'never_read'], [$rule->required(), $rule->reason()], 'an answer for another client');
        $iam->signInRule(null);
        $rule->reset();
        self::assertSame([true, 'never_read', true], [$rule->required(), $rule->reason(), $rule->known()], 'unreachable: required, and not known to refuse the site');
        self::assertSame([], glob($iam->dir . '/cache/*') ?: [], 'nothing kept in cache_dir');
        self::assertCount(2, array_filter(LogLines::take(), static fn (string $line): bool => str_contains($line, 'never_read')), 'each answer that was none is said: another client\'s, and no answer');
    }

    public function testTheSitesOwnReasonToRequireSigningIn(): void
    {
        $iam = TestIam::create($this->folder('iam'), 'http://127.0.0.1:9', 'app');
        $iam->signInRule(false);
        $pending = true;
        $rule = new SignInRule($iam->client(), requiredWhen: function () use (&$pending): bool {
            return $pending;
        });

        self::assertSame([true, 'site', true], [$rule->required(), $rule->reason(), $rule->known()]);
        $pending = false;
        $rule->reset();
        self::assertSame([false, 'read'], [$rule->required(), $rule->reason()]);
    }

    public function testTheKeptAnswerAndTheMemo(): void
    {
        $client = IamClient::fromArray(['issuer' => 'http://127.0.0.1:9', 'client_id' => 'app', 'cache_dir' => $this->folder('cache')]);
        $rule = new SignInRule($client, fetch: static fn (): array => ['status' => 0, 'body' => null]);
        $file = (string) $rule->cacheFile();
        self::assertSame($this->folder('cache') . '/anotoki-iam-application-' . sha1('http://127.0.0.1:9 app') . '.json', $file, 'the SDK\'s file');

        file_put_contents($file, json_encode(['login_required' => false, 'fetched_at' => time() - 5, 'failed_at' => 0, 'tried_at' => 0]));
        self::assertSame([false, 'fresh', true], [$rule->required(), $rule->reason(), $rule->known()], 'a fresh kept false, without asking');
        file_put_contents($file, json_encode(['login_required' => true, 'fetched_at' => time() - 5]));
        self::assertFalse($rule->required(), 'the memo: the same answer for the rest of the request');
        $rule->reset();
        self::assertSame([true, 'fresh'], [$rule->required(), $rule->reason()], 'the memo reset: the kept answer read again');

        file_put_contents($file, '{"login_required": "false", "fetched_at": ' . time() . '}');
        self::assertSame(['fetch' => true, 'value' => true, 'reason' => 'fetch'], SignInRule::fromCache(json_decode((string) file_get_contents($file), true), time(), 60, 2), 'a kept non-bool counts as never read');
    }

    public function testOneRequestAsksAtATime(): void
    {
        $client = IamClient::fromArray(['issuer' => 'http://127.0.0.1:9', 'client_id' => 'app', 'cache_dir' => $this->folder('cache')]);
        $asked = 0;
        $rule = new SignInRule($client, fetch: function () use (&$asked): array {
            $asked++;

            return ['status' => 0, 'body' => null];
        });
        $file = (string) $rule->cacheFile();

        // A stale answer, and another request holding the lock: not asked, the last value.
        file_put_contents($file, json_encode(['login_required' => false, 'fetched_at' => time() - 600]));
        $lock = fopen($file . '.lock', 'c');
        flock($lock, LOCK_EX);
        self::assertSame([false, 'refreshing'], [$rule->required(), $rule->reason()]);
        flock($lock, LOCK_UN);
        fclose($lock);

        // A claim another request wrote: the same.
        file_put_contents($file, json_encode(['login_required' => false, 'fetched_at' => time() - 600, 'tried_at' => time()]));
        $rule->reset();
        self::assertSame([false, 'refreshing'], [$rule->required(), $rule->reason()]);
        self::assertSame(0, $asked, 'nobody asked');

        // The claim's asker died: asked, failing, the last value kept.
        file_put_contents($file, json_encode(['login_required' => false, 'fetched_at' => time() - 600, 'tried_at' => time() - 6]));
        $rule->reset();
        self::assertSame([false, 'stale'], [$rule->required(), $rule->reason()]);
        self::assertSame(1, $asked);
        LogLines::take();
    }

    public function testAgainstTheStandIn(): void
    {
        $standIn = StandInIam::start($this->folder('stand-in'), 'app');
        $client = $standIn->client(['issuer' => $standIn->issuer . '/']);
        $rule = new SignInRule($client);
        $file = (string) $rule->cacheFile();
        $hits = static fn (): int => count(array_filter($standIn->log(), static fn (string $line): bool => $line === 'GET /api/public/applications/app'));
        $age = static function (array $changes) use ($file): void {
            file_put_contents($file, json_encode(array_merge(SignInRule::record(json_decode((string) file_get_contents($file), true)), $changes)));
        };
        $ask = static function () use ($rule): array {
            $rule->reset();

            return [$rule->required(), $rule->reason(), $rule->known()];
        };

        try {
            $standIn->state(['login_required' => false]);
            self::assertSame([false, 'read', true], $ask());
            self::assertSame(1, $hits(), 'asked at the contract\'s address');
            self::assertSame([false, 'fresh', true], $ask(), 'a fresh answer is not asked again');
            self::assertSame(1, $hits());

            // A 5xx: the last value, then the back-off.
            $age(['fetched_at' => time() - 61]);
            $standIn->state(['down' => true]);
            self::assertSame([false, 'stale', true], $ask());
            self::assertSame(2, $hits());
            self::assertSame([false, 'backing_off', true], $ask(), 'not asked again for a minute after a failure');
            self::assertSame(2, $hits());

            // A garbage 200 once the back-off is over: the last value.
            $age(['failed_at' => time() - 61]);
            $standIn->state(['down' => false, 'answers' => ['/api/public/applications/app' => ['status' => 200, 'body' => '<html>a proxy\'s page</html>', 'type' => 'text/html']]]);
            self::assertSame([false, 'stale', true], $ask());

            // A redirect is no answer either.
            $age(['failed_at' => time() - 61]);
            $standIn->state(['answers' => ['/api/public/applications/app' => ['status' => 302, 'location' => 'https://elsewhere.test/', 'body' => '']]]);
            self::assertSame([false, 'stale', true], $ask());

            // A 404: required, kept like an answer, and the IAM does not know the site.
            $age(['failed_at' => time() - 61]);
            $standIn->state(['answers' => [], 'application_missing' => true]);
            self::assertSame([true, 'unknown_application', false], $ask());
            self::assertSame([true, 'fresh', false], $ask(), 'kept like an answer');

            // Known again once it answers 200.
            $age(['fetched_at' => time() - 61]);
            $standIn->state(['application_missing' => false, 'login_required' => true]);
            self::assertSame([true, 'read', true], $ask());

            // The lock held elsewhere: not asked, the last value; released: asked.
            $age(['login_required' => false, 'fetched_at' => time() - 61]);
            $before = $hits();
            $lock = fopen($file . '.lock', 'c');
            flock($lock, LOCK_EX);
            self::assertSame([false, 'refreshing', true], $ask());
            flock($lock, LOCK_UN);
            fclose($lock);
            self::assertSame($before, $hits());
            self::assertSame([true, 'read', true], $ask());
            self::assertSame($before + 1, $hits());

            // A folder that cannot be written: still answered, said, asked on every request.
            file_put_contents($this->folder() . '/a-file', '');
            $unwritable = new SignInRule($standIn->client(['cache_dir' => $this->folder() . '/a-file/cache']));
            LogLines::take();
            $before = $hits();
            self::assertTrue($unwritable->required());
            $unwritable->reset();
            self::assertTrue($unwritable->required());
            self::assertSame($before + 2, $hits());
            self::assertNotSame([], array_filter(LogLines::take(), static fn (string $line): bool => str_contains($line, 'cache_dir') || str_contains($line, 'cannot write')));
        } finally {
            $standIn->stop();
        }

        // The IAM gone.
        $age(['login_required' => false, 'fetched_at' => time() - 61, 'failed_at' => 0]);
        self::assertSame([false, 'stale', true], $ask());
        $never = new SignInRule(IamClient::fromArray(['issuer' => $standIn->issuer, 'client_id' => 'never-read', 'cache_dir' => $this->folder('cache2')]));
        self::assertSame([true, 'never_read'], [$never->required(), $never->reason()]);
    }
}
