<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Auth;

use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\Base64Url;
use Anotoki\Lib\Auth\Testing\StandInIam;
use Anotoki\Lib\Tests\Support\TempFolder;
use PHPUnit\Framework\TestCase;

/**
 * The family's one stand-in IAM speaks the protocol the auth module's two halves rely on: the code flow
 * with PKCE, refresh rotation, prompt=none's two refusals, the sign-in hint set and cleared as the IAM sets
 * and clears it, logout, the paged list of deleted accounts - and its tokens verify.
 */
final class StandInIamTest extends TestCase
{
    use TempFolder;

    private const REDIRECT = 'http://localhost:4600/auth/callback';
    private const HINT = 'anotoki_signed_in';

    private StandInIam $standIn;

    protected function setUp(): void
    {
        $this->standIn = StandInIam::start($this->folder('stand-in'), 'build-analyzer');
    }

    protected function tearDown(): void
    {
        $this->standIn->stop();
        $this->removeFolder();
    }

    public function testTheCodeFlowWithPkceAndRotation(): void
    {
        $verifier = Base64Url::encode(random_bytes(32));
        $authorize = $this->get('/api/oidc/authorize?' . $this->authorizeQuery($verifier));
        self::assertSame(302, $authorize['status']);
        $back = $this->landing($authorize);
        self::assertSame($this->standIn->issuer, $back['iss']);
        self::assertSame('s1', $back['state']);
        self::assertArrayHasKey('code', $back);

        $wrong = $this->post('/api/oidc/token', [
            'grant_type' => 'authorization_code',
            'client_id' => 'build-analyzer',
            'code' => $back['code'],
            'redirect_uri' => self::REDIRECT,
            'code_verifier' => 'not-the-verifier',
        ]);
        self::assertSame(400, $wrong['status'], 'the wrong verifier spends the code');
        $again = $this->post('/api/oidc/token', [
            'grant_type' => 'authorization_code',
            'client_id' => 'build-analyzer',
            'code' => $back['code'],
            'redirect_uri' => self::REDIRECT,
            'code_verifier' => $verifier,
        ]);
        self::assertSame(400, $again['status'], 'a code is good once');

        $tokens = $this->signIn($verifier = Base64Url::encode(random_bytes(32)), $verifier);
        $person = (new AccessTokens($this->standIn->client()))->verify($tokens['access_token']);
        self::assertNotNull($person, 'its access tokens verify against its key set');
        self::assertSame(1, $person->sub);
        self::assertSame(['MEMBER', 'ADMIN'], $person->roles);
        self::assertNotNull($person->authTime);

        $rotated = $this->post('/api/oidc/token', ['grant_type' => 'refresh_token', 'client_id' => 'build-analyzer', 'refresh_token' => $tokens['refresh_token']]);
        self::assertSame(200, $rotated['status']);
        self::assertNotSame($tokens['refresh_token'], $rotated['json']['refresh_token']);
        $reused = $this->post('/api/oidc/token', ['grant_type' => 'refresh_token', 'client_id' => 'build-analyzer', 'refresh_token' => $tokens['refresh_token']]);
        self::assertSame(['invalid_grant', 400], [$reused['json']['error'], $reused['status']], 'a spent refresh token');
        $secret = $this->post('/api/oidc/token', ['grant_type' => 'refresh_token', 'client_id' => 'build-analyzer', 'client_secret' => 'x', 'refresh_token' => $rotated['json']['refresh_token']]);
        self::assertSame(401, $secret['status'], 'public clients only');
    }

    public function testTheAccountsPreferencesAreSavedForEverySessionOfIt(): void
    {
        $verifier = Base64Url::encode(random_bytes(32));
        $before = $this->signIn($verifier, $verifier);
        $bearer = static fn(string $token): array => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'];

        self::assertSame(503, $this->http('POST', '/api/oidc/preferences', '{"theme":"dark"}', [], $bearer($before['access_token']))['status'], 'an IAM before its migration 015');

        $this->standIn->state(['user' => ['id' => 1, 'username' => 'owner', 'roles' => ['MEMBER'], 'preferences' => ['theme' => 'auto', 'date_format' => null, 'time_format' => null]]]);
        $saved = $this->http('POST', '/api/oidc/preferences', '{"theme":"dark","language":"sk"}', [], $bearer($before['access_token']));
        self::assertSame(200, $saved['status']);
        self::assertSame(['locale' => 'sk', 'preferences' => ['theme' => 'dark', 'date_format' => null, 'time_format' => null]], $saved['json']);
        self::assertSame(400, $this->http('POST', '/api/oidc/preferences', '{"theme":"sepia"}', [], $bearer($before['access_token']))['status']);

        // The session made before the account had preferences carries them from its next refresh.
        $refreshed = $this->post('/api/oidc/token', ['grant_type' => 'refresh_token', 'client_id' => 'build-analyzer', 'refresh_token' => $before['refresh_token']]);
        $claims = json_decode(Base64Url::decode(explode('.', $refreshed['json']['access_token'])[1]), true);
        self::assertSame([['theme' => 'dark', 'date_format' => null, 'time_format' => null], 'sk'], [$claims['preferences'], $claims['locale']]);
    }

    public function testTheHintIsSetAndClearedAsTheIamDoes(): void
    {
        // Nobody signed in at the IAM: prompt=none answers login_required, and a hint sent is cleared.
        $this->standIn->state(['session' => false]);
        $silent = $this->get('/api/oidc/authorize?' . $this->authorizeQuery('v', ['prompt' => 'none']), [self::HINT => str_repeat('a', 22)]);
        self::assertSame('login_required', $this->landing($silent)['error']);
        self::assertSame('', $this->cookie($silent), 'the stale hint is cleared for every site');
        $quiet = $this->get('/api/oidc/authorize?' . $this->authorizeQuery('v', ['prompt' => 'none']));
        self::assertNull($this->cookie($quiet), 'no hint sent, nothing to clear');

        // Somebody signs in: a session, and a new hint.
        $interactive = $this->get('/api/oidc/authorize?' . $this->authorizeQuery('v'));
        $hint = (string) $this->cookie($interactive);
        self::assertMatchesRegularExpression('/^[A-Za-z0-9_-]{22}$/D', $hint);
        self::assertStringContainsString('Path=/', $interactive['headers']['set-cookie'][0]);
        self::assertStringContainsString('SameSite=Lax', $interactive['headers']['set-cookie'][0]);
        self::assertStringNotContainsStringIgnoringCase('HttpOnly', $interactive['headers']['set-cookie'][0], 'pages read it');

        // prompt=none with the session: a code; the hint stays as it is when it was sent, is set when it was not.
        $withHint = $this->get('/api/oidc/authorize?' . $this->authorizeQuery('v', ['prompt' => 'none']), [self::HINT => $hint]);
        self::assertArrayHasKey('code', $this->landing($withHint));
        self::assertNull($this->cookie($withHint));
        $lost = $this->get('/api/oidc/authorize?' . $this->authorizeQuery('v', ['prompt' => 'none']));
        self::assertNotNull($this->cookie($lost), 'a browser that lost the hint gets one');

        // A session this site may not use: interaction_required, and the hint is kept for the other sites.
        $this->standIn->state(['interaction' => true]);
        $refused = $this->get('/api/oidc/authorize?' . $this->authorizeQuery('v', ['prompt' => 'none']), [self::HINT => $hint]);
        self::assertSame('interaction_required', $this->landing($refused)['error']);
        self::assertNull($this->cookie($refused));

        // Signing out clears it.
        $this->standIn->state(['interaction' => false]);
        $out = $this->get('/api/oidc/logout?client_id=build-analyzer&post_logout_redirect_uri=' . rawurlencode('http://localhost:4600/'), [self::HINT => $hint]);
        self::assertSame(302, $out['status']);
        self::assertSame('http://localhost:4600/', $out['headers']['location'][0]);
        self::assertSame('', $this->cookie($out));
        self::assertFalse($this->standIn->state()['session']);

        // And the test's own sign-in at the IAM.
        $in = $this->get('/_test/sign-in?return=' . rawurlencode('http://localhost:4600/x'));
        self::assertSame('http://localhost:4600/x', $in['headers']['location'][0]);
        self::assertNotSame($hint, $this->cookie($in), 'a new sign-in, a new value');
        self::assertContains('hint set', $this->standIn->log());
        self::assertContains('hint cleared', $this->standIn->log());
    }

    public function testThePagedListOfDeletedAccounts(): void
    {
        $this->standIn->state([
            'anonymized_page' => 2,
            'anonymized' => [
                ['sub' => '30', 'anonymized_at' => '2026-11-06T10:00:00Z'],
                ['sub' => '12', 'anonymized_at' => '2026-11-06T10:00:00Z'],
                ['sub' => '7', 'anonymized_at' => '2026-11-05T09:00:00Z'],
                ['sub' => '40', 'anonymized_at' => '2026-11-07T00:00:00Z'],
            ],
        ]);

        $first = $this->get('/api/public/anonymized-accounts')['json'];
        self::assertSame([['sub' => '7', 'anonymized_at' => '2026-11-05T09:00:00Z'], ['sub' => '12', 'anonymized_at' => '2026-11-06T10:00:00Z']], $first['accounts']);
        self::assertSame(['since' => '2026-11-06T10:00:00Z', 'after' => '12'], $first['next']);
        $second = $this->get('/api/public/anonymized-accounts?since=2026-11-06T10:00:00Z&after=12')['json'];
        self::assertSame(['30', '40'], array_column($second['accounts'], 'sub'));
        self::assertNull($second['next']);
        self::assertSame(['12', '30'], array_column($this->get('/api/public/anonymized-accounts?since=2026-11-06T10:00:00Z')['json']['accounts'], 'sub'), 'since is inclusive');
        self::assertSame(['12', '30'], array_column($this->get('/api/public/anonymized-accounts?since=2026-11-06')['json']['accounts'], 'sub'), 'a date alone is midnight UTC');
        self::assertSame(['12', '30'], array_column($this->get('/api/public/anonymized-accounts?since=2026-11-06T11:00:00%2B01:00')['json']['accounts'], 'sub'), 'an offset');
        foreach (['since=2026-02-30', 'since=yesterday', 'after=12', 'since=2026-11-06&after=x', 'since=1969-12-31'] as $query) {
            self::assertSame(400, $this->get('/api/public/anonymized-accounts?' . $query)['status'], $query);
        }
    }

    public function testAKeySetAloneSignsNobodyIn(): void
    {
        $this->standIn->stop();
        file_put_contents($this->folder() . '/jwks.json', json_encode(['keys' => []]));
        $environment = getenv() + [];
        unset($environment['STAND_IN_DIR'], $environment['FAKE_IAM_DIR']);
        $probe = stream_socket_server('tcp://127.0.0.1:0');
        $name = (string) stream_socket_get_name($probe, false);
        fclose($probe);
        $port = (int) substr($name, (int) strrpos($name, ':') + 1);
        $process = proc_open(
            [PHP_BINARY, '-S', "127.0.0.1:$port", StandInIam::script()],
            [0 => ['pipe', 'r'], 1 => ['file', $this->folder() . '/out.log', 'a'], 2 => ['file', $this->folder() . '/err.log', 'a']],
            $pipes,
            $this->folder(),
            ['STAND_IN_JWKS' => $this->folder() . '/jwks.json', 'STAND_IN_ISSUER' => "http://127.0.0.1:$port"] + $environment,
        );
        try {
            for ($i = 0; $i < 100 && @fsockopen('127.0.0.1', $port, $errno, $error, 0.2) === false; $i++) {
                usleep(50_000);
            }
            $base = "http://127.0.0.1:$port";
            self::assertSame(['keys' => []], json_decode((string) file_get_contents("$base/.well-known/jwks.json"), true));
            self::assertSame("$base", json_decode((string) file_get_contents("$base/.well-known/openid-configuration"), true)['issuer']);
            $handle = curl_init("$base/api/oidc/authorize?response_type=code");
            curl_setopt_array($handle, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 5]);
            curl_exec($handle);
            self::assertSame(404, curl_getinfo($handle, CURLINFO_RESPONSE_CODE));
        } finally {
            proc_terminate($process);
            proc_close($process);
        }
    }

    /** @return array{access_token: string, refresh_token: string, id_token: string} */
    private function signIn(string $verifier, string $check): array
    {
        $back = $this->landing($this->get('/api/oidc/authorize?' . $this->authorizeQuery($verifier)));
        $tokens = $this->post('/api/oidc/token', [
            'grant_type' => 'authorization_code',
            'client_id' => 'build-analyzer',
            'code' => $back['code'],
            'redirect_uri' => self::REDIRECT,
            'code_verifier' => $check,
        ]);
        self::assertSame(200, $tokens['status'], json_encode($tokens['json']));

        return $tokens['json'];
    }

    /** @param array<string, string> $more */
    private function authorizeQuery(string $verifier, array $more = []): string
    {
        return http_build_query(
            $more + [
                'response_type' => 'code',
                'client_id' => 'build-analyzer',
                'redirect_uri' => self::REDIRECT,
                'scope' => 'openid profile email',
                'state' => 's1',
                'nonce' => 'n1',
                'code_challenge' => Base64Url::encode(hash('sha256', $verifier, true)),
                'code_challenge_method' => 'S256',
            ],
        );
    }

    /**
     * Where a redirect to the callback leads, its query as an array.
     *
     * @param array{status: int, headers: array<string, list<string>>} $answer
     * @return array<string, string>
     */
    private function landing(array $answer): array
    {
        $location = $answer['headers']['location'][0] ?? '';
        self::assertStringStartsWith(self::REDIRECT . '?', $location);
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

        return $query;
    }

    /**
     * The hint the answer sets ('' when it clears it), or null when it says nothing of it.
     *
     * @param array{headers: array<string, list<string>>} $answer
     */
    private function cookie(array $answer): ?string
    {
        foreach ($answer['headers']['set-cookie'] ?? [] as $line) {
            if (preg_match('/^' . self::HINT . '=([^;]*)/', $line, $match) === 1) {
                return $match[1];
            }
        }

        return null;
    }

    /**
     * @param array<string, string> $cookies
     * @return array{status: int, headers: array<string, list<string>>, json: mixed}
     */
    private function get(string $path, array $cookies = []): array
    {
        return $this->http('GET', $path, null, $cookies);
    }

    /**
     * @param array<string, string> $form
     * @return array{status: int, headers: array<string, list<string>>, json: mixed}
     */
    private function post(string $path, array $form): array
    {
        return $this->http('POST', $path, http_build_query($form));
    }

    /**
     * @param array<string, string> $cookies
     * @param ?list<string> $requestHeaders  instead of a form's
     * @return array{status: int, headers: array<string, list<string>>, json: mixed}
     */
    private function http(string $method, string $path, ?string $form, array $cookies = [], ?array $requestHeaders = null): array
    {
        $headers = [];
        $handle = curl_init($this->standIn->url($path));
        curl_setopt_array($handle, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_HTTPHEADER => $requestHeaders ?? ($form !== null ? ['Content-Type: application/x-www-form-urlencoded'] : []),
            CURLOPT_HEADERFUNCTION => static function ($handle, string $line) use (&$headers): int {
                $parts = explode(':', $line, 2);
                if (count($parts) === 2) {
                    $headers[strtolower(trim($parts[0]))][] = trim($parts[1]);
                }

                return strlen($line);
            },
        ]);
        if ($form !== null) {
            curl_setopt($handle, CURLOPT_POSTFIELDS, $form);
        }
        if ($cookies !== []) {
            curl_setopt($handle, CURLOPT_COOKIE, implode('; ', array_map(static fn(string $name, string $value): string => "$name=$value", array_keys($cookies), $cookies)));
        }
        $body = curl_exec($handle);

        return ['status' => (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE), 'headers' => $headers, 'json' => is_string($body) ? json_decode($body, true) : null];
    }
}
