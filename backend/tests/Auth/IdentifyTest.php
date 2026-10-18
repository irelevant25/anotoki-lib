<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Auth;

use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Auth\Http\RequireCaller;
use Anotoki\Lib\Auth\Http\RequirePerson;
use Anotoki\Lib\Auth\Http\RequireRole;
use Anotoki\Lib\Auth\Http\SignInGate;
use Anotoki\Lib\Auth\IamClient;
use Anotoki\Lib\Auth\SignInRule;
use Anotoki\Lib\Auth\Testing\StandInIam;
use Anotoki\Lib\Auth\Testing\TestIam;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Tests\Support\LogLines;
use Anotoki\Lib\Tests\Support\TempFolder;
use Closure;
use LogicException;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Who a request is, on a real Slim app driven in-process: the matrix of Identify, RequirePerson,
 * RequireRole, RequireCaller and SignInGate - and the attacks: a forged, expired, wrong-typ or wrong-alg
 * token, a token for another client, the sign-in hint (or any cookie) taken as somebody.
 */
final class IdentifyTest extends TestCase
{
    use TempFolder;

    private const HINT = 'Qm9vdHN0cmFwLWhpbnQtMTI'; // the shape of the IAM's hint: 22 characters of base64url

    private TestIam $iam;

    /** @var list<string> the visitor keys the site's closure was asked about */
    private array $looked = [];

    protected function setUp(): void
    {
        $this->iam = TestIam::create($this->folder('iam'), 'https://iam.test', 'test-site');
        $this->iam->signInRule(false);
    }

    protected function tearDown(): void
    {
        $this->removeFolder();
        LogLines::take();
    }

    public function testAVerifiedTokenIsAPersonAndRolesComeFromIt(): void
    {
        $app = $this->app();
        $member = $this->iam->token(7);
        $editor = $this->iam->token(8, ['MEMBER', 'EDITOR']);
        $admin = $this->iam->token(9, ['MEMBER', 'ADMIN']);

        self::assertSame(['caller' => 'person', 'sub' => 7, 'visitor' => null], $this->json($this->send($app, 'GET', '/api/open', $member)));
        self::assertSame(200, $this->send($app, 'GET', '/api/me', $member)->getStatusCode());
        $refused = $this->send($app, 'GET', '/api/admin', $member);
        self::assertSame(403, $refused->getStatusCode());
        self::assertSame(['code' => 'forbidden', 'message' => 'This needs one of these roles here: ADMIN, EDITOR. Ask the site\'s administrator.'], $this->json($refused));
        self::assertSame('no-store', $refused->getHeaderLine('Cache-Control'));
        self::assertFalse($refused->hasHeader('WWW-Authenticate'));
        self::assertSame(200, $this->send($app, 'GET', '/api/admin', $editor)->getStatusCode());
        self::assertSame(403, $this->send($app, 'GET', '/api/admin/migrations', $editor)->getStatusCode());
        self::assertSame(['code' => 'forbidden', 'message' => 'Only an administrator of this site may do this.'], $this->json($this->send($app, 'GET', '/api/admin/migrations', $editor)));
        self::assertSame(200, $this->send($app, 'GET', '/api/admin/migrations', $admin)->getStatusCode());
        self::assertSame(200, $this->send($app, 'GET', '/api/progress', $member)->getStatusCode());
        self::assertSame([], $this->looked, 'a person\'s request never reads a visitor key');
    }

    public function testABadTokenIsRefusedAndNeverFallsBackToTheVisitor(): void
    {
        $app = $this->app();
        $other = TestIam::create($this->folder('forger'), 'https://iam.test', 'test-site', $this->iam->kid);
        $good = $this->iam->claims(7, ['ADMIN']);

        foreach ([
            'forged: another key, the same kid' => $other->token(7, ['ADMIN']),
            'expired' => $this->iam->sign(['exp' => time() - 3600] + $good),
            'an ID token' => $this->iam->sign($good, 'JWT'),
            'alg none' => $this->iam->sign($good, 'at+jwt', 'none'),
            'HS256' => $this->iam->sign($good, 'at+jwt', 'HS256'),
            'for another client' => $this->iam->sign(['aud' => 'genshin', 'client_id' => 'genshin'] + $good),
            'another issuer' => $this->iam->sign(['iss' => 'https://iam.evil'] + $good),
            'garbage' => 'garbage',
            'nothing after Bearer' => '',
        ] as $case => $token) {
            $response = $this->send($app, 'GET', '/api/progress', $token, ['X-Visitor-Key' => 'vk-good']);
            self::assertSame(401, $response->getStatusCode(), $case);
            self::assertSame(['code' => 'invalid_token', 'message' => 'Your sign-in has run out. Please sign in again.'], $this->json($response), $case);
            self::assertSame('Bearer realm="test-site", error="invalid_token"', $response->getHeaderLine('WWW-Authenticate'), $case);
            self::assertSame('no-store', $response->getHeaderLine('Cache-Control'), $case);
        }
        self::assertSame([], $this->looked, 'the visitor key is not even read');

        $lines = LogLines::take();
        self::assertContains('[anotoki auth] token refused: bad signature', $lines);
        self::assertContains('[anotoki auth] token refused: meant for another application', $lines);
        self::assertContains('[anotoki auth] token refused: a Bearer header with no token', $lines);
        self::assertNotContains('[anotoki auth] token refused: expired', $lines, 'an everyday thing is not said');
    }

    public function testARefusedTokenIsOneLineAMinuteForEachKindAndNeverTheTokensOwn(): void
    {
        $app = $this->app();
        $good = $this->iam->claims(7, ['ADMIN']);
        $forged = "x\n[11-Oct-2026 10:00:00 UTC] PHP Fatal error: forged\r\n" . str_repeat('A', 9000);

        foreach (range(1, 20) as $n) {
            $token = $this->iam->sign($good, 'at+jwt', 'RS256', ['kid' => $forged . $n]);
            self::assertSame(401, $this->send($app, 'GET', '/api/progress', $token)->getStatusCode());
        }
        $lines = LogLines::take();
        self::assertCount(1, $lines, 'made-up kids by the score: one line a minute');
        self::assertStringStartsWith('[anotoki auth] token refused: no published key with kid x??11-Oct-2026?10?00?00?UTC??PHP?Fatal?error??forged??AAA', $lines[0]);
        self::assertDoesNotMatchRegularExpression('/[^\x20-\x7E]/', $lines[0], 'one printable line, whatever the token held');
        self::assertLessThan(140, strlen($lines[0]));

        // Another kind is said at once - and once.
        $forger = TestIam::create($this->folder('forger'), 'https://iam.test', 'test-site', $this->iam->kid);
        $this->send($app, 'GET', '/api/progress', $forger->token(7));
        $this->send($app, 'GET', '/api/progress', $forger->token(8));
        self::assertSame(['[anotoki auth] token refused: bad signature'], LogLines::take());

        // A minute on, the kind is said again (a stamp later than now is none, too).
        $stamp = $this->iam->dir . '/cache/anotoki-auth-refused-no-published-key-with-kid.stamp';
        self::assertFileExists($stamp);
        foreach (['a minute on' => time() - 61, 'a stamp from the future' => time() + 3600] as $case => $at) {
            file_put_contents($stamp, (string) $at);
            $this->send($app, 'GET', '/api/progress', $this->iam->sign($good, 'at+jwt', 'RS256', ['kid' => 'another']));
            self::assertSame(['[anotoki auth] token refused: no published key with kid another'], LogLines::take(), $case);
        }

        // A site's own log hears every reason - in the library's words alone.
        $heard = [];
        $own = $this->app(log: function (string $reason) use (&$heard): void {
            $heard[] = $reason;
        });
        foreach (range(1, 3) as $n) {
            $this->send($own, 'GET', '/api/progress', $this->iam->sign($good, 'at+jwt', 'RS256', ['kid' => $forged . $n]));
        }
        self::assertCount(3, $heard);
        self::assertSame([], array_filter($heard, static fn (string $reason): bool => preg_match('/[^\x20-\x7E]/', $reason) === 1 || strlen($reason) > 100));
        self::assertSame([], LogLines::take());
    }

    public function testOnlyTheBearerSchemeClaimsSomebody(): void
    {
        $app = $this->app();

        $basic = $this->request('GET', '/api/open')->withHeader('Authorization', 'Basic ' . base64_encode('user:pass'))->withHeader('X-Visitor-Key', 'vk-good');
        self::assertSame(['caller' => 'visitor', 'sub' => null, 'visitor' => -5], $this->json($app->handle($basic)), 'a host\'s password is nobody');
        $query = $this->request('GET', '/api/me?access_token=' . $this->iam->token(7));
        self::assertSame(401, $app->handle($query)->getStatusCode(), 'a token in the query string is never read');
        $rewritten = (new ServerRequestFactory())->createServerRequest('GET', '/api/open', ['REDIRECT_HTTP_AUTHORIZATION' => 'Bearer ' . $this->iam->token(7)]);
        self::assertSame('person', $this->json($app->handle($rewritten))['caller'], 'the header a rewrite rule passed on');
    }

    public function testTheSignInHintNeverSaysWhoSomebodyIs(): void
    {
        $app = $this->app();
        $cookies = [
            'anotoki_signed_in' => self::HINT,
            'anotoki_iam' => 'a-session-of-the-iam',
            'token' => $this->iam->token(9, ['ADMIN']),
        ];
        $withCookies = fn (string $path): ServerRequestInterface => $this->request('GET', $path)
            ->withCookieParams($cookies)
            ->withHeader('Cookie', implode('; ', array_map(static fn (string $name, string $value): string => "$name=$value", array_keys($cookies), $cookies)));

        self::assertSame(['caller' => 'nobody', 'sub' => null, 'visitor' => null], $this->json($app->handle($withCookies('/api/open'))));
        foreach (['/api/me', '/api/admin', '/api/admin/migrations', '/api/progress'] as $path) {
            $response = $app->handle($withCookies($path));
            self::assertSame(401, $response->getStatusCode(), $path);
            self::assertSame('sign_in_required', $this->json($response)['code'], $path);
            self::assertSame('Bearer realm="test-site"', $response->getHeaderLine('WWW-Authenticate'), $path);
        }

        $this->iam->signInRule(true);
        self::assertSame(401, $app->handle($withCookies('/api/me'))->getStatusCode(), 'while signing in is required too');
    }

    public function testWhileSigningInIsRequiredTheVisitorKeyIsNeverRead(): void
    {
        $this->iam->signInRule(true);
        $app = $this->app();

        self::assertSame(['caller' => 'nobody', 'sub' => null, 'visitor' => null], $this->json($this->send($app, 'GET', '/api/open', null, ['X-Visitor-Key' => 'vk-good'])));
        foreach (['/api/progress', '/api/surveys', '/api/save'] as $path) {
            $response = $this->send($app, 'GET', $path, null, ['X-Visitor-Key' => 'vk-good']);
            self::assertSame(401, $response->getStatusCode(), $path);
            self::assertSame('sign_in_required', $this->json($response)['code'], $path);
        }
        self::assertSame([], $this->looked);

        // The IAM out of reach and nothing ever read: required (fails closed).
        $this->iam->signInRule(null);
        self::assertSame(401, $this->send($app, 'GET', '/api/surveys')->getStatusCode());
    }

    public function testAVisitorAndNobody(): void
    {
        $app = $this->app();

        $visitor = $this->send($app, 'GET', '/api/progress', null, ['X-Visitor-Key' => 'vk-good']);
        self::assertSame(200, $visitor->getStatusCode());
        self::assertSame(['caller' => 'visitor', 'sub' => null, 'visitor' => -5], $this->json($visitor));
        foreach (['/api/me', '/api/admin', '/api/admin/migrations'] as $path) {
            self::assertSame(401, $this->send($app, 'GET', $path, null, ['X-Visitor-Key' => 'vk-good'])->getStatusCode(), "a visitor is nobody at $path");
        }

        $unknown = $this->send($app, 'GET', '/api/open', null, ['X-Visitor-Key' => 'vk-gone']);
        self::assertSame(401, $unknown->getStatusCode());
        self::assertSame(['code' => 'visitor_unknown', 'message' => 'This browser\'s visitor key is not known here.'], $this->json($unknown));
        self::assertSame(401, $this->send($app, 'GET', '/api/open', null, ['X-Visitor-Key' => str_repeat('k', 300)])->getStatusCode(), 'a key too long to be one');
        self::assertSame(['vk-good', 'vk-good', 'vk-good', 'vk-good', 'vk-gone'], $this->looked, 'a key of the right length is the site\'s to judge');

        self::assertSame(401, $this->send($app, 'GET', '/api/progress')->getStatusCode(), 'refuse');
        self::assertSame(['caller' => 'nobody', 'sub' => null, 'visitor' => null, 'nobody' => true, 'make' => null], $this->json($this->send($app, 'GET', '/api/surveys')), 'empty');
        self::assertSame(['caller' => 'nobody', 'sub' => null, 'visitor' => null, 'nobody' => null, 'make' => true], $this->json($this->send($app, 'GET', '/api/save')), 'make');

        $noVisitors = $this->app(visitors: false);
        self::assertSame('nobody', $this->json($this->send($noVisitors, 'GET', '/api/open', null, ['X-Visitor-Key' => 'vk-good']))['caller'], 'a site without visitors never reads a key');
    }

    public function testTheAnswerAboutSigningInIsAskedAfreshForEachRequest(): void
    {
        $app = $this->app();

        self::assertSame(200, $this->send($app, 'GET', '/api/surveys')->getStatusCode());
        $this->iam->signInRule(true);
        self::assertSame(401, $this->send($app, 'GET', '/api/surveys')->getStatusCode());
        $this->iam->signInRule(false);
        self::assertSame(200, $this->send($app, 'GET', '/api/surveys')->getStatusCode());
    }

    public function testRolesNeedNoDatabase(): void
    {
        // This app has no database at all: Identify and RequireRole read the token alone - which is what lets
        // the Migrations routes work while `users` waits for an update.
        $app = $this->app();
        self::assertSame(200, $this->send($app, 'GET', '/api/admin/migrations', $this->iam->token(1, ['ADMIN']))->getStatusCode());
    }

    public function testTheSitesOwnCodesAndShape(): void
    {
        $responder = static function (ResponseInterface $response, Refusal $refusal): ResponseInterface {
            $response->getBody()->write((string) json_encode(['error' => $refusal->message, 'code' => $refusal->code]));

            return $response->withHeader('Content-Type', 'application/json');
        };
        $app = $this->app(responder: $responder, realm: 'genshin', routes: function (App $app): void {
            $app->get('/api/admin/people', $this->echo(...))->add(RequireRole::admin()->refusing('admin_only', 'Only an administrator may do this.'));
        });

        $refused = $this->send($app, 'GET', '/api/admin/people', $this->iam->token(7, ['EDITOR']));
        self::assertSame(403, $refused->getStatusCode());
        self::assertSame(['error' => 'Only an administrator may do this.', 'code' => 'admin_only'], $this->json($refused));
        self::assertSame('no-store', $refused->getHeaderLine('Cache-Control'));
        $nobody = $this->send($app, 'GET', '/api/admin/people');
        self::assertSame(['error' => 'Please sign in.', 'code' => 'sign_in_required'], $this->json($nobody));
        self::assertSame('Bearer realm="genshin"', $nobody->getHeaderLine('WWW-Authenticate'));
    }

    public function testOneGateInFrontOfEverything(): void
    {
        $app = $this->app(gate: ['/api/auth/config', '~^/api/translations/[a-z-]+$~D']);

        self::assertSame(200, $this->send($app, 'GET', '/api/open')->getStatusCode(), 'not required: everybody through');
        $this->iam->signInRule(true);
        self::assertSame(401, $this->send($app, 'GET', '/api/open')->getStatusCode());
        self::assertSame(401, $this->send($app, 'GET', '/api/open', null, ['X-Visitor-Key' => 'vk-good'])->getStatusCode());
        self::assertSame(200, $this->send($app, 'GET', '/api/open', $this->iam->token(7))->getStatusCode());
        self::assertSame(200, $this->send($app, 'GET', '/api/auth/config')->getStatusCode());
        self::assertSame(200, $this->send($app, 'GET', '/api/translations/sk')->getStatusCode());
        self::assertSame(401, $this->send($app, 'GET', '/api/translations/sk/x')->getStatusCode(), 'a pattern is whole');

        $this->expectException(\InvalidArgumentException::class);
        new SignInGate(['~[~']);
    }

    public function testTheBootConfiguration(): void
    {
        $app = $this->app();
        $response = $this->send($app, 'GET', '/api/auth/config');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        self::assertSame(['issuer' => 'https://iam.test', 'client_id' => 'test-site', 'login_required' => false, 'sign_in_available' => true, 'visitor_days' => 30], $this->json($response));

        $this->iam->signInRule(true);
        self::assertTrue($this->json($this->send($app, 'GET', '/api/auth/config'))['login_required']);

        $nowhere = new IamClient('', '');
        self::assertSame(['issuer' => '', 'client_id' => '', 'login_required' => true, 'sign_in_available' => false], AuthRoutes::configBody(new SignInRule($nowhere), $nowhere));
        self::assertSame('/api/auth/config', AuthRoutes::openPath());
    }

    public function testTheBootConfigurationOfASiteTheIamDoesNotKnow(): void
    {
        $standIn = StandInIam::start($this->folder('stand-in'));
        try {
            $client = $standIn->client();
            $standIn->state(['application_missing' => true]);
            self::assertSame(
                ['issuer' => $standIn->issuer, 'client_id' => 'test-site', 'login_required' => true, 'sign_in_available' => false],
                AuthRoutes::configBody(new SignInRule($client), $client)
            );
        } finally {
            $standIn->stop();
        }
    }

    public function testTheChecksNeedIdentifyInFront(): void
    {
        $app = AppFactory::create();
        $app->get('/x', $this->echo(...))->add(new RequirePerson());

        $this->expectException(LogicException::class);
        $app->handle($this->request('GET', '/x'));
    }

    public function testWhatCannotBeConfigured(): void
    {
        foreach ([
            static fn () => new RequireRole([]),
            static fn () => new RequireRole(['ADMIN OR 1=1']),
            static fn () => RequireRole::admin()->refusing('Not A Code'),
            static fn () => new RequireCaller('maybe'),
        ] as $index => $make) {
            try {
                $make();
                self::fail("case $index was taken");
            } catch (\InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        self::assertSame(['ADMIN', 'EDITOR'], RequireRole::any('admin', 'Editor', 'ADMIN')->roles);
    }

    /**
     * The site under test: Identify (its visitors: the key vk-good is visitor -5), the checks on their
     * routes, the boot configuration; or a gate in front of everything.
     *
     * @param ?list<string> $gate
     */
    private function app(bool $visitors = true, ?Closure $responder = null, ?string $realm = null, ?Closure $routes = null, ?array $gate = null, ?Closure $log = null): App
    {
        $app = AppFactory::create();
        $client = $this->iam->client();
        $rule = new SignInRule($client);

        $app->get('/api/open', $this->echo(...));
        $app->get('/api/me', $this->echo(...))->add(new RequirePerson());
        $app->get('/api/admin', $this->echo(...))->add(RequireRole::any('ADMIN', 'EDITOR'));
        $app->get('/api/admin/migrations', $this->echo(...))->add(RequireRole::admin());
        $app->get('/api/progress', $this->echo(...))->add(new RequireCaller('refuse'));
        $app->get('/api/surveys', $this->echo(...))->add(new RequireCaller('empty'));
        $app->get('/api/save', $this->echo(...))->add(new RequireCaller('make'));
        $app->get('/api/translations/{code}', $this->echo(...));
        $app->get('/api/translations/{code}/x', $this->echo(...));
        AuthRoutes::config($app, $rule, $client, extra: static fn (): array => ['visitor_days' => 30]);
        if ($routes !== null) {
            $routes($app);
        }

        if ($gate !== null) {
            $app->add(new SignInGate($gate));
        }
        $app->add(new Identify(
            new AccessTokens($client),
            $rule,
            $app->getResponseFactory(),
            visitor: $visitors ? function (string $key): ?int {
                $this->looked[] = $key;

                return $key === 'vk-good' ? -5 : null;
            } : null,
            responder: $responder,
            realm: $realm,
            log: $log,
        ));

        return $app;
    }

    private function echo(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = ['caller' => Identify::caller($request), 'sub' => Identify::person($request)?->sub, 'visitor' => Identify::visitor($request)];
        if (str_starts_with($request->getUri()->getPath(), '/api/s')) {
            $body += ['nobody' => $request->getAttribute(RequireCaller::NOBODY), 'make' => $request->getAttribute(RequireCaller::MAKE_VISITOR)];
        }
        $response->getBody()->write((string) json_encode($body));

        return $response->withHeader('Content-Type', 'application/json');
    }

    /** @param array<string, string> $headers */
    private function send(App $app, string $method, string $path, ?string $token = null, array $headers = []): ResponseInterface
    {
        $request = $this->request($method, $path);
        if ($token !== null) {
            $request = $request->withHeader('Authorization', 'Bearer ' . $token);
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    private function request(string $method, string $path): ServerRequestInterface
    {
        return (new ServerRequestFactory())->createServerRequest($method, $path);
    }

    /** @return array<string, mixed> */
    private function json(ResponseInterface $response): array
    {
        $body = json_decode((string) $response->getBody(), true);
        self::assertIsArray($body, (string) $response->getBody());

        return $body;
    }
}
