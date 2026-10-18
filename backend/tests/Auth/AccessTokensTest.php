<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Auth;

use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\Base64Url;
use Anotoki\Lib\Auth\Bearer;
use Anotoki\Lib\Auth\IamClient;
use Anotoki\Lib\Auth\Jwks;
use Anotoki\Lib\Auth\Person;
use Anotoki\Lib\Auth\Testing\TestIam;
use Anotoki\Lib\Tests\Support\TempFolder;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * The access token's check: every case of the IAM's SDK suite (sdk/php/test.php), and the attacks it
 * stops - a forged, expired, wrong-typ or wrong-alg token, one for another client.
 */
final class AccessTokensTest extends TestCase
{
    use TempFolder;

    private TestIam $iam;

    protected function setUp(): void
    {
        $this->iam = TestIam::create($this->folder('iam'), 'https://iam.example.test', 'app', 'test-key');
    }

    protected function tearDown(): void
    {
        $this->removeFolder();
    }

    public function testEveryCaseOfTheSdkSuite(): void
    {
        $other = TestIam::create($this->folder('forger'), 'https://iam.example.test', 'app', 'test-key'); // the same kid, another key
        $good = $this->iam->claims(7, ['EDITOR', 'editor', 'ADMIN']);
        $sign = fn(array $claims, string $typ = 'at+jwt', ?TestIam $key = null, string $alg = 'RS256'): string => ($key ?? $this->iam)->sign($claims, $typ, $alg);
        $tampered = (function () use ($sign, $good): string {
            [$head, , $signature] = explode('.', $sign($good));

            return $head . '.' . Base64Url::encode(json_encode(['sub' => '1'] + $good)) . '.' . $signature;
        })();

        $cases = [
            'a good token' => [$sign($good), true],
            'an ID token (typ JWT)' => [$sign($good, 'JWT'), false],
            'alg none in the header' => [$sign($good, 'at+jwt', null, 'none'), false],
            'signed by another key with the same kid' => [$sign($good, 'at+jwt', $other), false],
            'another issuer' => [$sign(['iss' => 'https://evil.test'] + $good), false],
            'another audience' => [$sign(['aud' => 'other-app'] + $good), false],
            'audience list containing this app' => [$sign(['aud' => ['other-app', 'app']] + $good), true],
            'expired' => [$sign(['exp' => time() - 120] + $good), false],
            'expired within the leeway' => [$sign(['exp' => time() - 30] + $good), true],
            'not valid yet' => [$sign(['nbf' => time() + 600] + $good), false],
            'no subject' => [$sign(['sub' => ''] + $good), false],
            'subject not a number' => [$sign(['sub' => 'admin'] + $good), false],
            'unknown kid' => [$this->iam->sign($good, 'at+jwt', 'RS256', ['kid' => 'nope']), false],
            'tampered payload' => [$tampered, false],
            'garbage' => ['not.a.token', false],
            'two parts' => ['abc.def', false],
        ];

        $tokens = new AccessTokens($this->iam->client());
        foreach ($cases as $name => [$token, $passes]) {
            $person = $tokens->verify($token);
            self::assertSame($passes, $person !== null, $name . ': ' . ($tokens->lastReason() ?? 'accepted'));
            self::assertSame($passes, $tokens->lastReason() === null, $name);
        }

        $person = $tokens->verify($sign($good));
        self::assertNotNull($person);
        self::assertSame(7, $person->sub, 'the user id is an int');
        self::assertSame(['EDITOR', 'ADMIN'], $person->roles, 'roles are cleaned');
    }

    public function testTheAttacksItStops(): void
    {
        $tokens = new AccessTokens($this->iam->client());
        $good = $this->iam->claims(7);
        $publicPem = (string) Jwks::pem($this->iam->jwks()['keys'][0]);
        $hmac = (function () use ($good, $publicPem): string {
            // HS256 keyed with the published key: what a verifier that reads alg from the token accepts.
            $head = Base64Url::encode(json_encode(['alg' => 'HS256', 'typ' => 'at+jwt', 'kid' => 'test-key']));
            $payload = Base64Url::encode(json_encode($good));

            return "$head.$payload." . Base64Url::encode(hash_hmac('sha256', "$head.$payload", $publicPem, true));
        })();
        $unsigned = (function () use ($good): string {
            $head = Base64Url::encode(json_encode(['alg' => 'none', 'typ' => 'at+jwt', 'kid' => 'test-key']));

            return $head . '.' . Base64Url::encode(json_encode($good)) . '.';
        })();

        foreach (
            [
                'HS256 keyed with the public key' => [$hmac, 'algorithm is not RS256'],
                'alg none, no signature' => [$unsigned, 'unreadable header, payload or signature'],
                'typ missing' => [$this->iam->sign($good, ''), 'not an access token (typ missing)'],
                'an ID token' => [$this->iam->sign($good, 'JWT'), 'not an access token (typ jwt)'],
                'no kid' => [$this->iam->sign($good, 'at+jwt', 'RS256', ['kid' => '']), 'no kid'],
                'critical extensions' => [$this->iam->sign($good, 'at+jwt', 'RS256', ['crit' => ['b64']]), 'a header with critical extensions'],
                'a token for another client' => [$this->iam->sign(['aud' => 'another-site', 'client_id' => 'another-site'] + $good), 'meant for another application'],
                'issued to another client, naming this one too' => [$this->iam->sign(['aud' => ['another-site', 'app'], 'client_id' => 'another-site'] + $good), 'issued to another application'],
                'expired an hour ago' => [$this->iam->sign(['exp' => time() - 3600] + $good), 'expired'],
                'no expiry' => [$this->iam->sign(array_diff_key($good, ['exp' => true])), 'no expiry'],
                'an expiry that is text' => [$this->iam->sign(['exp' => (string) (time() + 600)] + $good), 'no expiry'],
                'issued in the future' => [$this->iam->sign(['iat' => time() + 600] + $good), 'issued in the future'],
                'a subject of 19 digits' => [$this->iam->sign(['sub' => '1234567890123456789'] + $good), 'no usable subject'],
                'subject 0' => [$this->iam->sign(['sub' => '0'] + $good), 'no usable subject'],
                'a subject with a leading zero' => [$this->iam->sign(['sub' => '07'] + $good), 'no usable subject'],
                'a subject that is a number, not text' => [$this->iam->sign(['sub' => 7] + $good), 'no usable subject'],
                'a negative subject (a visitor\'s id)' => [$this->iam->sign(['sub' => '-3'] + $good), 'no usable subject'],
                'four parts' => [$this->iam->token(7) . '.x', 'not a JWT'],
                'nothing' => ['', 'not a JWT'],
                'too long' => [str_repeat('a', AccessTokens::MAX_LENGTH + 1), 'too long'],
                'a payload that is a list' => [
                    Base64Url::encode('{"alg":"RS256","typ":"at+jwt","kid":"test-key"}') . '.' . Base64Url::encode('[1]') . '.c2ln',
                    'unreadable header, payload or signature',
                ],
            ]
            as $name => [$token, $reason]
        ) {
            self::assertNull($tokens->verify($token), $name);
            self::assertSame($reason, $tokens->lastReason(), $name);
        }

        self::assertNotNull($tokens->verify($this->iam->sign($good, 'application/at+jwt')), 'the media-type form of typ');
        self::assertNotNull($tokens->verify($this->iam->sign($good, 'AT+JWT')), 'typ in any case');
        self::assertNotNull($tokens->verify($this->iam->sign(['iss' => 'https://iam.example.test/'] + $good)), 'an issuer with a trailing slash');
        self::assertNotNull($tokens->verify($this->iam->sign(array_diff_key($good, ['client_id' => true]))), 'no client_id claim at all');
        self::assertNotNull($tokens->verify($this->iam->sign(['sub' => '123456789012345678'] + $good)), '18 digits');
    }

    public function testAReasonIsTheLibrarysWordsNeverALineTheTokenWrote(): void
    {
        $tokens = new AccessTokens($this->iam->client());
        $good = $this->iam->claims(7);
        $forged = "x\n[11-Oct-2026 10:00:00 UTC] PHP Fatal error: Uncaught Exception in /var/www/index.php:1\r\n" . str_repeat('A', 9000);

        $kid = $this->iam->sign($good, 'at+jwt', 'RS256', ['kid' => $forged]);
        self::assertLessThan(AccessTokens::MAX_LENGTH, strlen($kid), 'a token the site reads');
        self::assertNull($tokens->verify($kid));
        self::assertSame('no published key with kid x??11-Oct-2026?10?00?00?UTC??PHP?Fatal?error??Uncaught?Exception...', $tokens->lastReason());
        self::assertSame('no published key with kid', $tokens->lastReasonKind());

        self::assertNull($tokens->verify($this->iam->sign($good, "JWT\nPHP Warning: " . str_repeat('B', 9000))));
        self::assertSame('not an access token (typ jwt?php?warning??' . str_repeat('b', 47) . '...)', $tokens->lastReason(), 'at most 64 of its characters');
        self::assertSame('not an access token', $tokens->lastReasonKind());

        foreach ([$kid, $this->iam->sign(['exp' => time() - 3600] + $good), 'garbage'] as $token) {
            $tokens->verify($token);
            self::assertDoesNotMatchRegularExpression('/[^\x20-\x7E]/', (string) $tokens->lastReason(), 'printable, one line');
            self::assertLessThanOrEqual(100, strlen((string) $tokens->lastReason()));
        }
        self::assertNotNull($tokens->verify($this->iam->token(7)));
        self::assertNull($tokens->lastReason());
        self::assertNull($tokens->lastReasonKind(), 'nothing after a token that passed');
    }

    public function testAPersonIsWhatTheTokenSays(): void
    {
        $tokens = new AccessTokens($this->iam->client());
        $person = $tokens->verify(
            $this->iam->token(
                12,
                ['member', ' Editor '],
                [
                    'preferred_username' => '  Alice ',
                    'locale' => 'sk',
                    'preferences' => ['theme' => 'dark', 'date_format' => null, 'time_format' => '24'],
                    'auth_time' => time() - 100,
                    'sid' => 'abc',
                ],
            ),
        );

        self::assertInstanceOf(Person::class, $person);
        self::assertSame(12, $person->sub);
        self::assertSame('Alice', $person->name);
        self::assertSame('user12@example.test', $person->email);
        self::assertTrue($person->emailVerified);
        self::assertSame('sk', $person->locale);
        self::assertSame(['theme' => 'dark', 'date_format' => null, 'time_format' => '24'], $person->preferences);
        self::assertSame(['MEMBER', 'EDITOR'], $person->roles);
        self::assertSame('abc', $person->sid);
        self::assertTrue($person->has('editor'));
        self::assertTrue($person->isStaff());
        self::assertFalse($person->isAdmin());
        self::assertTrue($person->signedInWithin(600));
        self::assertFalse($person->signedInWithin(60));
        self::assertSame('openid profile email', $person->scope);

        $plain = $tokens->verify($this->iam->token(13, [], ['preferred_username' => '   ', 'roles' => 'ADMIN', 'auth_time' => null, 'preferences' => ['dark']]));
        self::assertNotNull($plain);
        self::assertNull($plain->name, 'a blank name is none');
        self::assertSame([], $plain->roles, 'roles that are no list are none');
        self::assertNull($plain->authTime, 'a personal token has no session');
        self::assertFalse($plain->signedInWithin(600));
        self::assertNull($plain->preferences, 'preferences that are a list are none');
    }

    public function testATokenIsNeverCheckedWithoutAnIam(): void
    {
        $tokens = new AccessTokens(new IamClient('', 'app'));

        self::assertNull($tokens->verify($this->iam->token(7)));
        self::assertSame('the IAM settings have no issuer or client_id', $tokens->lastReason());
        self::assertFalse(IamClient::fromArray(['issuer' => ' ', 'client_id' => 'app'])->configured());
    }

    public function testTheBearerHeader(): void
    {
        foreach (
            [
                ['Bearer abc.def.ghi', true, 'abc.def.ghi'],
                ['bearer abc', true, 'abc'],
                ['  BEARER abc', true, 'abc'],
                ['Bearer', true, null],
                ['Bearer ', true, null],
                ['Basic dXNlcjpwYXNz', false, null],
                ['Bearerabc', false, null],
                ['', false, null],
            ]
            as [$header, $sent, $token]
        ) {
            self::assertSame($sent, Bearer::sent($header), var_export($header, true));
            self::assertSame($token, Bearer::token($header), var_export($header, true));
        }

        $requests = new ServerRequestFactory();
        self::assertSame('Bearer x', Bearer::header($requests->createServerRequest('GET', '/')->withHeader('Authorization', 'Bearer x')));
        self::assertSame('Bearer y', Bearer::header($requests->createServerRequest('GET', '/', ['REDIRECT_HTTP_AUTHORIZATION' => 'Bearer y'])), 'what a rewrite rule copied');
        self::assertSame('', Bearer::header($requests->createServerRequest('GET', '/?access_token=z')), 'never a query string');
    }

    public function testTheKeySetIsReadFromTheSdksCopyOnDisk(): void
    {
        // The file the SDK kept, in its shape: a site that moves to the library keeps its copy.
        $cache = $this->folder('cache');
        file_put_contents(
            $cache . '/anotoki-iam-jwks-' . sha1('https://iam.example.test/.well-known/jwks.json') . '.json',
            json_encode(['fetched_at' => time(), 'keys' => Jwks::usable($this->iam->jwks())]),
        );
        $fetched = 0;
        $client = IamClient::fromArray(['issuer' => 'https://iam.example.test', 'client_id' => 'app', 'cache_dir' => $cache]);
        $tokens = new AccessTokens(
            $client,
            new Jwks($client, function () use (&$fetched): array {
                $fetched++;

                return ['status' => 0, 'body' => null];
            }),
        );

        self::assertNotNull($tokens->verify($this->iam->token(7)), (string) $tokens->lastReason());
        self::assertSame(0, $fetched, 'a fresh copy is not fetched again');
    }

    public function testAnUnknownKidIsWorthOneFetchEveryFiveMinutesAtMost(): void
    {
        $cache = $this->folder('cache');
        $client = IamClient::fromArray(['issuer' => 'https://iam.example.test', 'client_id' => 'app', 'cache_dir' => $cache]);
        $file = $cache . '/anotoki-iam-jwks-' . sha1('https://iam.example.test/.well-known/jwks.json') . '.json';
        $rotated = TestIam::create($this->folder('rotated'), 'https://iam.example.test', 'app', 'new-key');
        $published = $this->iam->jwks();
        $fetched = [];
        $jwks = new Jwks($client, function (string $url, float $timeout) use (&$fetched, &$published): array {
            $fetched[] = [$url, $timeout];

            return ['status' => 200, 'body' => json_encode($published)];
        });
        $tokens = new AccessTokens($client, $jwks);

        self::assertNotNull($tokens->verify($this->iam->token(7)));
        self::assertSame([['https://iam.example.test/.well-known/jwks.json', 5.0]], $fetched, 'the first token fetches the set');

        // The IAM rotated its key a minute after the copy was made: not fetched again yet.
        $published = ['keys' => array_merge($this->iam->jwks()['keys'], $rotated->jwks()['keys'])];
        self::assertNull($tokens->verify($rotated->token(7)));
        self::assertSame('no published key with kid new-key', $tokens->lastReason());
        self::assertCount(1, $fetched, 'a fetch less than five minutes after the last');

        $this->age($file, 301);
        self::assertNotNull($tokens->verify($rotated->token(7)), 'past five minutes: one fetch, and the new key is there');
        self::assertCount(2, $fetched);
        foreach (range(1, 5) as $made) {
            self::assertNull($tokens->verify($this->iam->sign($this->iam->claims(7), 'at+jwt', 'RS256', ['kid' => "made-up-$made"])));
        }
        self::assertCount(2, $fetched, 'made-up kids do not make downloads');
        self::assertNotNull($tokens->verify($this->iam->token(7)), 'the old key is still published');

        // An IAM that is down: the copy is used, and it is not asked again for five minutes.
        $this->age($file, 4000);
        $published = null;
        $down = new Jwks($client, function () use (&$fetched): array {
            $fetched[] = 'down';

            return ['status' => 503, 'body' => '{"error":"temporarily_unavailable"}'];
        });
        $tokens = new AccessTokens($client, $down);
        self::assertNotNull($tokens->verify($this->iam->token(7)), 'the copy kept, past its hour, while the IAM is down');
        self::assertNotNull($tokens->verify($this->iam->token(8)));
        self::assertSame(['down'], array_slice($fetched, 2), 'asked once, then not again for five minutes');
    }

    public function testAStampLaterThanNowIsNone(): void
    {
        // A copy stamped in the future - a clock set back, a copy from another machine - is no fresh copy.
        $cache = $this->folder('cache');
        $client = IamClient::fromArray(['issuer' => 'https://iam.example.test', 'client_id' => 'app', 'cache_dir' => $cache]);
        $file = $cache . '/anotoki-iam-jwks-' . sha1('https://iam.example.test/.well-known/jwks.json') . '.json';
        $rotated = TestIam::create($this->folder('rotated'), 'https://iam.example.test', 'app', 'new-key');
        $fetched = 0;
        $tokens = new AccessTokens(
            $client,
            new Jwks($client, function () use (&$fetched, $rotated): array {
                $fetched++;

                return ['status' => 200, 'body' => json_encode(['keys' => array_merge($this->iam->jwks()['keys'], $rotated->jwks()['keys'])])];
            }),
        );

        foreach (['fetched_at' => ['fetched_at' => time() + 3600, 'failed_at' => 0], 'failed_at' => ['fetched_at' => time() - 600, 'failed_at' => time() + 3600]] as $stamp => $record) {
            $fetched = 0;
            file_put_contents($file, json_encode($record + ['keys' => Jwks::usable($this->iam->jwks())]));

            self::assertNotNull($tokens->verify($rotated->token(7)), "$stamp in the future: the unknown kid is fetched for at once");
            self::assertSame(1, $fetched, $stamp);
            $kept = json_decode((string) file_get_contents($file), true);
            self::assertLessThanOrEqual(time(), $kept['fetched_at'], "$stamp: the copy is stamped now");
            self::assertSame(0, $kept['failed_at'], $stamp);
        }
    }

    public function testOnlyRsaSignatureKeysForRs256AreKept(): void
    {
        $key = $this->iam->jwks()['keys'][0];
        $keys = Jwks::usable([
            'keys' => [
                $key,
                ['use' => 'enc', 'kid' => 'enc'] + $key,
                ['alg' => 'RS512', 'kid' => 'rs512'] + $key,
                ['kty' => 'EC', 'kid' => 'ec'] + $key,
                ['kid' => ''] + $key,
                ['n' => ''] + $key + ['kid' => 'no-n'],
                'not a key',
                ['kid' => 'plain', 'kty' => 'RSA', 'n' => $key['n'], 'e' => $key['e']],
            ],
        ]);

        self::assertSame(['test-key', 'plain'], array_keys($keys));
        self::assertNotNull(Jwks::pem($keys['plain']));
        self::assertNull(Jwks::pem(['n' => '', 'e' => 'AQAB']));
        self::assertSame([], Jwks::usable(['keys' => 'none']));
    }

    /** Makes the kept key set as old as $seconds. */
    private function age(string $file, int $seconds): void
    {
        $record = json_decode((string) file_get_contents($file), true);
        $record['fetched_at'] = time() - $seconds;
        file_put_contents($file, json_encode($record));
    }
}
