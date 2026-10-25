<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\ErrorLog;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Admin\Http\Routes;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Auth\Person;
use Anotoki\Lib\ErrorLog\ErrorLog;
use Anotoki\Lib\ErrorLog\ErrorLogMiddleware;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Support\ClientAddress;
use Anotoki\Lib\Support\Utf8;
use Anotoki\Lib\Tests\Support\TemporaryFolder;
use PDOException;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RuntimeException;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

/** The error log on a real Slim app: what is written, what never is, and how it is read back. */
final class ErrorLogTest extends TestCase
{
    use TemporaryFolder;

    private const JWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsImVtYWlsIjoiYW5hQGV4YW1wbGUuY29tIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ';

    private string $storage;
    private string $logs;
    private string $previousIgnoreArgs;

    protected function setUp(): void
    {
        $this->storage = $this->temporaryFolder();
        $this->logs = $this->storage . '/logs';
        // Hosts often keep php.ini-development's default: a trace with every call's arguments.
        $this->previousIgnoreArgs = (string) ini_get('zend.exception_ignore_args');
        ini_set('zend.exception_ignore_args', '0');
    }

    protected function tearDown(): void
    {
        ini_set('zend.exception_ignore_args', $this->previousIgnoreArgs);
        $this->removeTemporaryFolders();
    }

    public function testAnExceptionIsWrittenOnceWithoutAnythingPrivate(): void
    {
        [$app, $log] = $this->app();
        $app->post('/api/admin/users/{id}/password', function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            self::changePassword((string) json_decode((string) $request->getBody(), true)['password']);

            return $response;
        });

        $response = $this->send($app, 'POST', '/api/admin/users/42/password?token=QUERY-SECRET-123', '{"password":"hunter2-BODY-SECRET"}', [
            'Authorization' => 'Bearer ' . self::JWT,
            'Cookie' => 'iam_session=COOKIE-SECRET-456',
        ]);

        self::assertSame(500, $response->getStatusCode());
        self::assertSame('{"code":"server_error","error":"Something went wrong on our side"}', (string) $response->getBody(), 'the site\'s own answer');
        $raw = $this->rawLog();
        foreach (['hunter2', 'BODY-SECRET', 'QUERY-SECRET', 'COOKIE-SECRET', self::JWT, 'eyJ', 'ana@example.com', '203.0.113.9', 'token='] as $secret) {
            self::assertStringNotContainsString($secret, $raw, "the log never holds $secret");
        }
        $lines = $this->lines();
        self::assertCount(1, $lines, 'the exception\'s line alone - never a second saying "500"');
        $line = $lines[0];
        self::assertSame(1, $line['v']);
        self::assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/D', $line['at']);
        self::assertSame(['server', 'error', 500, 'RuntimeException', 'server_error'], [$line['source'], $line['level'], $line['status'], $line['type'], $line['code']]);
        self::assertSame('No account {email} for that password; ask {token}', $line['message']);
        self::assertSame('backend/tests/ErrorLog/ErrorLogTest.php', $line['file'], 'relative to the site\'s root');
        self::assertSame(['POST', '/api/admin/users/{id}/password', '/api/admin/users/42/password'], [$line['method'], $line['route'], $line['path']]);
        self::assertSame(7, $line['user_id']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{12}$/D', $line['client']);
        self::assertSame(substr(hash_hmac('sha256', '203.0.113.9', str_repeat('k', 32)), 0, 12), $line['client']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{12}$/D', $line['fingerprint']);
        self::assertStringStartsWith('backend/tests/ErrorLog/ErrorLogTest.php:', $line['trace'][0]);
        self::assertStringEndsWith('ErrorLogTest::changePassword()', $line['trace'][0], 'the frame names the call, never its arguments');
        self::assertLessThanOrEqual(12, count($line['trace']));
        self::assertArrayNotHasKey('ip', $line);
        self::assertArrayNotHasKey('session_id', $line);
        self::assertFileExists($this->logs . '/.htaccess');
    }

    public function testAnExceptionThrownForAnotherKeepsItsCauseScrubbedAndItsOwnFingerprint(): void
    {
        $options = ['root' => dirname(__DIR__, 3), 'key' => str_repeat('k', 32)];
        $cause = self::scrubFailure(
            "SQLSTATE[P0001]: Raise exception: 7 ERROR:  the scrub's table is read-only for ana@example.com, token=s3cr3t-value\nDETAIL:  Key (email)=(bo@example.com) exists.",
        );

        (new ErrorLog($this->logs, $options))->record(self::thrownFor($cause));
        (new ErrorLog($this->storage . '/alone', $options))->record(self::thrownFor(null));

        $line = $this->lines()[0];
        $alone = json_decode((string) file_get_contents((string) (glob($this->storage . '/alone/errors-*.jsonl')[0] ?? '')), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame($alone['fingerprint'], $line['fingerprint'], 'the exception\'s own: never its causes\'');
        self::assertSame(['RuntimeException', 'The accounts the IAM deleted were not checked again.'], [$line['type'], $line['message']]);
        self::assertLessThanOrEqual(12, count($line['trace']));
        self::assertStringEndsWith('ErrorLogTest::thrownFor()', $line['trace'][0], 'its own frames first');
        $at = array_search(true, array_map(static fn(string $frame): bool => str_starts_with($frame, 'Caused by '), $line['trace']), true);
        self::assertIsInt($at, 'the cause is in the line');
        self::assertMatchesRegularExpression(
            '~^Caused by PDOException \(backend/tests/ErrorLog/ErrorLogTest\.php:\d+\): SQLSTATE\[P0001\]: Raise exception: 7 ERROR:  the scrub\'s table is read-only for \{email\}, token=\{…\}$~D',
            $line['trace'][$at],
            'its class, its file relative, its message redacted',
        );
        self::assertMatchesRegularExpression(
            '~^backend/tests/ErrorLog/ErrorLogTest\.php:\d+ Anotoki\\\\Lib\\\\Tests\\\\ErrorLog\\\\ErrorLogTest::scrubFailure\(\)$~D',
            $line['trace'][$at + 1],
            'and its own frame: the calls it shares with the one it caused are not said twice',
        );
        self::assertCount($at + 2, $line['trace']);
        foreach (['ana@example.com', 's3cr3t', 'bo@example.com', 'DETAIL'] as $secret) {
            self::assertStringNotContainsString($secret, $this->rawLog());
        }
        self::assertSame([], array_filter($alone['trace'], static fn(string $frame): bool => str_starts_with($frame, 'Caused by ')), 'none without a cause');
    }

    public function testALongChainStaysWithinTheLinesCaps(): void
    {
        $chain = null;
        for ($level = 0; $level < 30; $level++) {
            $chain = new RuntimeException("Level $level failed for ana@example.com " . str_repeat('word ', 400), 0, $chain);
        }

        (new ErrorLog($this->logs, ['root' => dirname(__DIR__, 3), 'key' => str_repeat('k', 32)]))->record($chain);

        $line = $this->lines()[0];
        self::assertCount(12, $line['trace'], 'the trace\'s 12 lines, whatever the chain');
        $causes = array_values(array_filter($line['trace'], static fn(string $frame): bool => str_starts_with($frame, 'Caused by ')));
        self::assertCount(11, $causes, 'at most 11 causes, each its own line - the exception\'s first frame kept');
        self::assertStringStartsWith('Caused by RuntimeException (backend/tests/ErrorLog/ErrorLogTest.php:', $causes[0]);
        self::assertStringContainsString('): Level 28 failed for {email} word word', $causes[0], 'the nearest cause first');
        self::assertStringContainsString('): Level 18 failed for {email}', $causes[10]);
        foreach ($causes as $cause) {
            self::assertLessThanOrEqual(500, Utf8::length(substr($cause, (int) strpos($cause, '): ') + 3)), 'a cause\'s message no longer than the entry\'s own');
        }
        self::assertSame(500, Utf8::length($line['message']));
        self::assertStringNotContainsString('ana@example.com', $this->rawLog());
        self::assertLessThan(16384, strlen($this->rawLog()), 'one line stays a line');
    }

    public function testAnAnswerIsWrittenWithItsCodeAndSentenceOnly(): void
    {
        [$app] = $this->app();
        $app->get('/api/things/{id}', function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            $response->getBody()->write((string) json_encode(['code' => 'not_found', 'error' => 'No thing for ana@example.com', 'echo' => 'BODY-FIELD-SECRET']));

            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        });
        $app->get('/api/forbidden', static fn(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response->withStatus(403));
        $app->get('/api/broken', static fn(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response->withStatus(400));
        $app->get('/api/busy', static fn(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response->withStatus(503));

        $this->send($app, 'GET', '/api/things/12?x=QUERY');
        $this->send($app, 'GET', '/api/forbidden');
        $this->send($app, 'GET', '/api/broken');
        $this->send($app, 'GET', '/api/busy');
        $this->send($app, 'GET', '/api/nowhere');

        $lines = $this->lines();
        self::assertSame(
            [[404, 'Response', 'not_found', 'No thing for {email}', '/api/things/{id}'], [503, 'Response', null, '', '/api/busy'], [404, 'HttpNotFoundException', 'not_found', 'Not found.', null]],
            array_map(static fn(array $line): array => [$line['status'], $line['type'], $line['code'], $line['message'], $line['route']], $lines),
            'by default every 5xx and 404, 405, 413, 415, 429 - never 400 or 403',
        );
        self::assertStringNotContainsString('BODY-FIELD-SECRET', $this->rawLog());
        self::assertStringNotContainsString('QUERY', $this->rawLog());
        self::assertSame('warning', $lines[0]['level']);
        self::assertSame('error', $lines[1]['level']);

        [$every] = $this->app(['responses' => static fn(int $status): bool => $status >= 400]);
        $every->get('/api/forbidden', static fn(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response->withStatus(403));
        $this->send($every, 'GET', '/api/forbidden');
        self::assertSame(403, $this->lines()[3]['status'], 'genshin keeps every 4xx');
    }

    public function testOneLinePerFingerprintPerRequest(): void
    {
        [$app, $log] = $this->app();
        $app->get('/api/loop', function (ServerRequestInterface $request, ResponseInterface $response) use ($log): ResponseInterface {
            for ($i = 0; $i < 50; $i++) {
                $log->recordPhp(['type' => E_WARNING, 'message' => "Undefined array key $i", 'file' => __FILE__, 'line' => 10]);
            }
            $log->recordPhp(['type' => E_DEPRECATED, 'message' => 'Something old', 'file' => __FILE__, 'line' => 11]);

            return $response;
        });

        $this->send($app, 'GET', '/api/loop');
        $this->send($app, 'GET', '/api/loop');

        $lines = $this->lines();
        self::assertCount(4, $lines, 'one warning and one notice a request');
        self::assertSame(['php', 'warning', 'E_WARNING', 'Undefined array key 0', '/api/loop'], [$lines[0]['source'], $lines[0]['level'], $lines[0]['type'], $lines[0]['message'], $lines[0]['route']]);
        self::assertSame(['notice', 'E_DEPRECATED'], [$lines[1]['level'], $lines[1]['type']]);
        self::assertSame($lines[0]['fingerprint'], $lines[2]['fingerprint']);
    }

    public function testAnAnonymousClassOrAClosureNamesItsFileRelativeLikeEveryOther(): void
    {
        [$app] = $this->app();
        $failing = new class {
            public function fail(): never
            {
                throw new RuntimeException('Failed inside an anonymous class');
            }
        };
        $app->get('/api/anonymous', static function () use ($failing): ResponseInterface {
            $failing->fail();
        });
        $app->get('/api/thrown', static function (): ResponseInterface {
            throw new class ('An anonymous exception') extends RuntimeException {};
        });
        $app->get('/api/routes-file', require __DIR__ . '/Fixtures/a-routes-file.php');
        $this->send($app, 'GET', '/api/anonymous');
        $this->send($app, 'GET', '/api/thrown');
        $this->send($app, 'GET', '/api/routes-file');

        $raw = $this->rawLog();
        $root = str_replace('\\', '/', dirname(__DIR__, 3));
        foreach ([$root, str_replace('/', '\\\\', $root), str_replace('/', '\\', $root)] as $absolute) {
            self::assertStringNotContainsString($absolute, $raw, 'no absolute path anywhere in a line');
        }
        [$anonymous, $thrown, $routesFile] = $this->lines();
        foreach (array_merge($anonymous['trace'], $thrown['trace'], $routesFile['trace'], [$anonymous['type'], $thrown['type'], $anonymous['file'], $thrown['file'], $routesFile['file']]) as $part) {
            self::assertDoesNotMatchRegularExpression('~(?:^|[\s(:{])(?:[A-Za-z]:[\\\\/]|/(?:home|var|srv|Users|tmp)/)~', (string) $part, 'no absolute path: ' . $part);
        }
        self::assertMatchesRegularExpression('~^backend/tests/ErrorLog/ErrorLogTest\.php:\d+ class@anonymous\(backend/tests/ErrorLog/ErrorLogTest\.php:\d+\)->fail\(\)$~D', $anonymous['trace'][0]);
        self::assertMatchesRegularExpression('~^RuntimeException@anonymous\(backend/tests/ErrorLog/ErrorLogTest\.php:\d+\)$~D', $thrown['type']);
        self::assertSame('backend/tests/ErrorLog/Fixtures/a-routes-file.php', $routesFile['file']);
        if (PHP_VERSION_ID >= 80400) {
            self::assertMatchesRegularExpression(
                '~' . preg_quote('::{closure:' . self::class . '::' . __FUNCTION__ . '():', '~') . '\d+\}\(\)$~D',
                $anonymous['trace'][1],
                'PHP 8.4 names a closure in a method by the method: kept whole',
            );
            self::assertMatchesRegularExpression(
                '~[ :]\{closure:backend/tests/ErrorLog/Fixtures/a-routes-file\.php:\d+\}\(\)$~D',
                $routesFile['trace'][0],
                'and one at a file\'s own scope by the file: relative',
            );
        }
    }

    public function testAStateAnUpdateLeavesTheSiteInIsNoFailure(): void
    {
        [$app, $log] = $this->app();
        foreach (['update_pending', 'feature_unavailable', 'not_set_up', 'unavailable'] as $code) {
            $app->get('/api/state/' . $code, static function (ServerRequestInterface $request, ResponseInterface $response) use ($code): ResponseInterface {
                $response->getBody()->write((string) json_encode(['code' => $code, 'message' => 'Not now.']));

                return $response->withStatus(503)->withHeader('Content-Type', 'application/json');
            });
        }
        for ($visit = 0; $visit < 3; $visit++) {
            foreach (['update_pending', 'feature_unavailable', 'not_set_up', 'unavailable'] as $code) {
                $this->send($app, 'GET', '/api/state/' . $code);
            }
        }

        self::assertSame(
            ['unavailable'],
            array_values(array_unique(array_column($this->lines(), 'code'))),
            'an update waiting, a site not set up: states, not failures - a database that does not answer is one',
        );

        [$strict] = $this->app(['expected' => []]);
        $strict->get('/api/state', static function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            $response->getBody()->write('{"code":"update_pending"}');

            return $response->withStatus(503)->withHeader('Content-Type', 'application/json');
        });
        $this->send($strict, 'GET', '/api/state');
        self::assertContains('update_pending', array_column($this->lines(), 'code'), 'a site that wants them written says so');
    }

    public function testTheSiteSettingsStatesAreNoFailuresEither(): void
    {
        // 0.11.1: a site its administrators closed answers 503 maintenance to every visit, and a page they switched off
        // 423 page_locked to every call of its API (written where a site keeps every 4xx, as genshin does): states somebody
        // put the site into on purpose - Japanese Academy named maintenance itself on 0.11.0.
        [$app] = $this->app(['responses' => static fn(int $status): bool => $status >= 400]);
        foreach (['maintenance' => 503, 'page_locked' => 423, 'locked' => 423] as $code => $status) {
            $app->get('/api/state/' . $code, static function (ServerRequestInterface $request, ResponseInterface $response) use ($code, $status): ResponseInterface {
                $response->getBody()->write((string) json_encode(['code' => $code, 'message' => 'Not now.']));

                return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
            });
        }
        for ($visit = 0; $visit < 3; $visit++) {
            foreach (['maintenance', 'page_locked', 'locked'] as $code) {
                $this->send($app, 'GET', '/api/state/' . $code);
            }
        }

        self::assertSame(['locked'], array_values(array_unique(array_column($this->lines(), 'code'))), 'closed for maintenance, a page switched off: states, not failures - another 423 is written');
        self::assertContains('maintenance', ErrorLog::EXPECTED_CODES);
        self::assertContains('page_locked', ErrorLog::EXPECTED_CODES);
    }

    public function testAFailureOnAnAdminToolsRouteNamesWhoAskedFromTheRequestTheRouteSaw(): void
    {
        // The site's reader of who asks finds what its own middleware set - which the outer middleware never sees.
        $context = new AdminContext(
            static fn(ServerRequestInterface $request): ?int => is_int($request->getAttribute('site.person')) ? $request->getAttribute('site.person') : null,
            isAdmin: static fn(): bool => true,
        );
        [$app] = $this->app(['context' => $context]);
        Routes::adminGroup($app, '/api/admin/tool', $context, static function ($group): void {
            $group->get('', static function (): ResponseInterface {
                throw new RuntimeException('The tool failed');
            });
        })->add(static fn(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface => $handler->handle($request->withAttribute('site.person', 42)));
        $this->send($app, 'GET', '/api/admin/tool');
        self::assertSame([42], array_column($this->lines(), 'user_id'));

        // A log without a reader of its own names the person the auth module's Identify set.
        $this->logs = $this->temporaryFolder() . '/logs';
        $site = new AdminContext(static fn(ServerRequestInterface $request): ?int => Identify::person($request)?->sub, isAdmin: static fn(): bool => true);
        $plain = AppFactory::create();
        $log = new ErrorLog($this->logs, ['key' => str_repeat('k', 32), 'app' => $plain]);
        $plain->addRoutingMiddleware();
        $plain->addErrorMiddleware(false, false, false)->setDefaultErrorHandler($log->wrapHandler(static fn(): ResponseInterface => (new ResponseFactory())->createResponse(500)));
        $plain->add(ErrorLogMiddleware::outer($log));
        Routes::adminGroup($plain, '/api/admin/tool', $site, static function ($group): void {
            $group->get('', static function (): ResponseInterface {
                throw new RuntimeException('The tool failed again');
            });
        })->add(
            static fn(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface => $handler->handle(
                $request->withAttribute(Identify::PERSON, Person::fromClaims(['sub' => '77'])),
            ),
        );
        $this->send($plain, 'GET', '/api/admin/tool');
        self::assertSame([77], array_column($this->lines(), 'user_id'));
    }

    public function testTheAddressBucketIsTheTrustedProxysHeaderFromThatProxyAloneAndKeptOnlyAsAHash(): void
    {
        [$app] = $this->app(['context' => new AdminContext(static fn(): ?int => null, trustedProxies: ClientAddress::CLOUDFLARE)]);
        $app->get('/api/fail', static function (): ResponseInterface {
            throw new RuntimeException('Failed');
        });
        $hash = static fn(string $bucket): string => substr(hash_hmac('sha256', $bucket, str_repeat('k', 32)), 0, 12);

        $this->send($app, 'GET', '/api/fail', '', ['CF-Connecting-IP' => '198.51.100.7'], '173.245.48.1');
        $this->send($app, 'GET', '/api/fail', '', ['CF-Connecting-IP' => '198.51.100.7'], '203.0.113.50');
        $this->send($app, 'GET', '/api/fail', '', ['CF-Connecting-IP' => '2001:db8:1:2:3:4:5:6'], '2400:cb00::1');

        self::assertSame(
            [$hash('198.51.100.7'), $hash('203.0.113.50'), $hash('2001:db8:1:2::/64')],
            array_column($this->lines(), 'client'),
            'Cloudflare\'s header from Cloudflare; anybody else\'s is not believed; an IPv6 address as its /64',
        );
        self::assertStringNotContainsString('198.51.100.7', $this->rawLog(), 'never the address itself');
    }

    public function testTheLogsOwnRoutesAreNeverWrittenDown(): void
    {
        // A site that keeps every 4xx (genshin's): the log's own refusals would be lines, were they not its own.
        [$app, $log] = $this->app(['responses' => static fn(int $status): bool => $status >= 400]);
        ErrorLogRoutes::admin($app, '/api/admin/errors', $log, $this->context())->add($this->adminCheck());

        self::assertSame(404, $this->send($app, 'GET', '/api/admin/errors/zzzzzzzzzzzz')->getStatusCode());
        self::assertSame(405, $this->send($app, 'PUT', '/api/admin/errors')->getStatusCode());
        self::assertSame(403, $this->send($app, 'GET', '/api/admin/errors', admin: false)->getStatusCode());
        self::assertFileDoesNotExist($this->logs . '/errors-' . gmdate('Y-m-d') . '.jsonl');
    }

    public function testABareRequestIsRefusedByTheGroupItself(): void
    {
        [$app, $log] = $this->app();
        // Nothing of the site's on the group: the library's own check.
        ErrorLogRoutes::admin($app, '/api/admin/errors', $log, $this->context());
        $app->get('/api/fail', static function (): ResponseInterface {
            throw new RuntimeException('A failure an outsider must not read');
        });
        $this->send($app, 'GET', '/api/fail');

        foreach ([['GET', '/api/admin/errors'], ['DELETE', '/api/admin/errors'], ['GET', '/api/admin/errors/0123456789ab']] as [$method, $path]) {
            $bare = $this->send($app, $method, $path, admin: false);
            self::assertSame([401, 'sign_in_required'], [$bare->getStatusCode(), $this->json($bare)['code']], "a bare $method $path");
            $other = $this->send($app, $method, $path, headers: ['X-Test-Admin' => 'no'], admin: false);
            self::assertSame([403, 'forbidden'], [$other->getStatusCode(), $this->json($other)['code']], "somebody else's $method $path");
            self::assertStringNotContainsString('outsider', (string) $other->getBody());
        }
        self::assertCount(1, $this->lines(), 'nothing cleared');
    }

    public function testMountedInsideAGroupUnderABasePathTheLogsRoutesAreStillItsOwn(): void
    {
        [$app, $log] = $this->app(['responses' => static fn(int $status): bool => $status >= 400]);
        $app->setBasePath('/site');
        $app->group('/api', function ($api) use ($log): void {
            ErrorLogRoutes::client($api, '/client-errors', $log, $this->context());
            $api->group('/admin', function ($admin) use ($log): void {
                ErrorLogRoutes::admin($admin, '/errors', $log, $this->context());
            });
        });

        self::assertSame(401, $this->send($app, 'GET', '/site/api/admin/errors', admin: false)->getStatusCode());
        self::assertSame(403, $this->send($app, 'GET', '/site/api/admin/errors', headers: ['X-Test-Admin' => 'no'], admin: false)->getStatusCode());
        self::assertSame(200, $this->send($app, 'GET', '/site/api/admin/errors')->getStatusCode());
        self::assertSame(404, $this->send($app, 'GET', '/site/api/admin/errors/zzzz')->getStatusCode(), 'under them, though no route of them answers');
        self::assertSame(422, $this->send($app, 'POST', '/site/api/client-errors', '{"type":"Error"}')->getStatusCode());
        self::assertSame(204, $this->send($app, 'POST', '/site/api/client-errors', '{"message":"A page failed"}')->getStatusCode());
        self::assertSame(404, $this->send($app, 'GET', '/site/api/elsewhere')->getStatusCode());

        $lines = $this->lines();
        self::assertSame(
            [['client', 'A page failed'], ['server', 'Not found.']],
            array_map(static fn(array $line): array => [$line['source'], $line['message']], $lines),
            'the page\'s own error and the site\'s 404 - none of the log\'s routes\' answers',
        );
        self::assertSame('/site/api/elsewhere', $lines[1]['path']);
    }

    public function testTheRoutesReadGroupAndClearForTheAdminAlone(): void
    {
        [$app, $log] = $this->app();
        ErrorLogRoutes::admin($app, '/api/admin/errors', $log, $this->context())->add($this->adminCheck());
        $app->get('/api/fail/{n}', static function (ServerRequestInterface $request): ResponseInterface {
            throw new RuntimeException('It failed ' . $request->getAttribute('n') . ' times');
        });
        $app->get('/api/other', static function (): ResponseInterface {
            throw new \LogicException('Another failure');
        });
        foreach ([1, 2, 3] as $n) {
            $this->send($app, 'GET', "/api/fail/$n");
        }
        $this->send($app, 'GET', '/api/other');
        $this->send($app, 'GET', '/api/nowhere');

        self::assertSame(403, $this->send($app, 'GET', '/api/admin/errors', admin: false)->getStatusCode());
        $report = $this->json($this->send($app, 'GET', '/api/admin/errors?days=3'));
        self::assertSame([5, 4, 1, 0, 3, false], [$report['total'], $report['errors'], $report['warnings'], $report['notices'], $report['distinct'], $report['truncated']]);
        self::assertCount(3, $report['daily']);
        self::assertSame(gmdate('Y-m-d'), $report['daily'][2]['key']);
        self::assertSame(['key' => gmdate('Y-m-d'), 'errors' => 4, 'warnings' => 1, 'notices' => 0], $report['daily'][2]);
        self::assertSame([['key' => '404', 'errors' => 0, 'warnings' => 1, 'notices' => 0], ['key' => '500', 'errors' => 4, 'warnings' => 0, 'notices' => 0]], $report['statuses']);
        $loudest = $report['groups'][0];
        self::assertSame(
            [3, 'RuntimeException', 'It failed 3 times', '/api/fail/{n}'],
            [$loudest['count'], $loudest['type'], $loudest['message'], $loudest['route']],
            'one group for the three: the number is no part of its fingerprint',
        );
        self::assertSame(['/api/fail/3', '/api/fail/2', '/api/fail/1'], $loudest['paths']);
        self::assertSame('It failed 3 times', $loudest['latest']['message']);

        $filtered = $this->json($this->send($app, 'GET', '/api/admin/errors?level=warning'));
        self::assertSame(1, $filtered['total']);
        self::assertSame(1, $this->json($this->send($app, 'GET', '/api/admin/errors?search=another'))['total']);
        self::assertSame(1, $this->json($this->send($app, 'GET', '/api/admin/errors?status=404'))['total']);

        $occurrences = $this->json($this->send($app, 'GET', '/api/admin/errors/' . $loudest['fingerprint']));
        self::assertCount(3, $occurrences);
        self::assertSame(404, $this->send($app, 'GET', '/api/admin/errors/000000000000')->getStatusCode());

        self::assertSame(403, $this->send($app, 'DELETE', '/api/admin/errors', admin: false)->getStatusCode());
        self::assertSame(['deleted' => 1], $this->json($this->send($app, 'DELETE', '/api/admin/errors')));
        self::assertSame(0, $this->json($this->send($app, 'GET', '/api/admin/errors'))['total']);
    }

    public function testClearingOlderDaysKeepsTheNewestAndIsAudited(): void
    {
        [$app, $log] = $this->app();
        $audit = new class implements \Anotoki\Lib\Audit\AuditRecorder {
            /** @var list<array<mixed>> */
            public array $recorded = [];

            public function record(
                ?ServerRequestInterface $request,
                int|string|null $actorId,
                string $action,
                ?string $targetType = null,
                int|string|null $targetId = null,
                array $details = [],
                ?array $scope = null,
                ?string $session = null,
            ): void {
                $this->recorded[] = [$actorId, $action, $details];
            }
        };
        ErrorLogRoutes::admin($app, '/api/admin/errors', $log, $this->context(), $audit)->add($this->adminCheck());
        mkdir($this->logs, 0777, true);
        $today = gmdate('Y-m-d');
        $yesterday = gmdate('Y-m-d', time() - 86400);
        $lastWeek = gmdate('Y-m-d', time() - 8 * 86400);
        foreach ([$lastWeek, "$yesterday.2", $yesterday, $today] as $day) {
            file_put_contents($this->logs . "/errors-$day.jsonl", "{}\n");
        }
        file_put_contents($this->logs . '/errors-dropped.json', (string) json_encode([$lastWeek => 3, $today => 2]));

        self::assertSame(422, $this->send($app, 'DELETE', '/api/admin/errors?before=yesterday')->getStatusCode(), 'a date, or nothing');
        self::assertSame(422, $this->send($app, 'DELETE', '/api/admin/errors?before=2026-02-30')->getStatusCode(), 'a real one');
        self::assertCount(4, glob($this->logs . '/errors-*.jsonl') ?: [], 'a refusal deletes nothing');
        self::assertSame([], $audit->recorded);

        self::assertSame(403, $this->send($app, 'DELETE', "/api/admin/errors?before=$today", admin: false)->getStatusCode());
        self::assertSame(['deleted' => 3], $this->json($this->send($app, 'DELETE', "/api/admin/errors?before=$today")));
        self::assertSame([$this->logs . "/errors-$today.jsonl"], glob($this->logs . '/errors-*.jsonl'), 'today\'s file stays, every part of the days before goes');
        self::assertSame([$today => 2], $log->reader()->dropped(), 'the counts of the days kept stay');
        self::assertSame([7, 'errors.cleared', ['files' => 3, 'before' => $today]], $audit->recorded[0]);

        self::assertSame(['deleted' => 1], $this->json($this->send($app, 'DELETE', '/api/admin/errors')));
        self::assertSame([], glob($this->logs . '/errors-*.jsonl'));
        self::assertSame([], $log->reader()->dropped());
        self::assertSame([7, 'errors.cleared', ['files' => 1]], $audit->recorded[1]);
    }

    public function testDaysArePartedAndPruned(): void
    {
        $log = new ErrorLog($this->logs, ['key' => str_repeat('k', 32), 'maxBytes' => 1024]);
        mkdir($this->logs, 0777, true);
        $old = gmdate('Y-m-d', time() - 31 * 86400);
        file_put_contents($this->logs . "/errors-$old.jsonl", "{}\n");
        file_put_contents($this->logs . '/errors-' . gmdate('Y-m-d', time() - 29 * 86400) . '.jsonl', "{}\n");

        for ($i = 0; $i < 12; $i++) {
            $log->record(new RuntimeException('Distinct failure number ' . str_repeat('x', $i % 26) . chr(65 + ($i % 26)) . $i), null);
        }

        self::assertFileDoesNotExist($this->logs . "/errors-$old.jsonl", 'a day past 30 is gone');
        self::assertFileExists($this->logs . '/errors-' . gmdate('Y-m-d', time() - 29 * 86400) . '.jsonl', 'one within 30 stays');
        self::assertFileExists($this->logs . '/errors-' . gmdate('Y-m-d') . '.2.jsonl', 'a day goes on in parts');
        foreach (glob($this->logs . '/errors-*.jsonl') ?: [] as $file) {
            self::assertLessThan(1024 + 1024, filesize($file));
        }
        self::assertSame([], $log->reader()->dropped());
    }

    public function testOverItsSizeTheOldestDaysGoAndTodayIsNeverKeptOutByThem(): void
    {
        $log = new ErrorLog($this->logs, ['key' => str_repeat('k', 32), 'maxBytes' => 1024, 'totalBytes' => 4096]);
        mkdir($this->logs, 0777, true);
        // A scanner's 404s filled the whole log on three days before today.
        $days = [gmdate('Y-m-d', time() - 3 * 86400), gmdate('Y-m-d', time() - 2 * 86400), gmdate('Y-m-d', time() - 86400)];
        foreach ($days as $day) {
            file_put_contents($this->logs . "/errors-$day.jsonl", str_repeat("{}\n", 500));
        }

        $log->record(new RuntimeException('Today\'s first failure'), null);
        self::assertFileDoesNotExist($this->logs . "/errors-$days[0].jsonl", 'the oldest day went to make room');
        self::assertFileExists($this->logs . "/errors-$days[2].jsonl", 'only as many as it took');
        self::assertSame(['Today\'s first failure'], array_column($this->linesOf(gmdate('Y-m-d')), 'message'), 'today is written');

        // Today alone past the size: every day before goes, and only then are today's lines counted, not written.
        for ($i = 0; $i < 60; $i++) {
            $log->record(new RuntimeException('Distinct failure number ' . str_repeat('x', $i % 26) . chr(65 + ($i % 26)) . $i), null);
        }
        $today = gmdate('Y-m-d');
        self::assertSame(
            [],
            array_values(array_filter(glob($this->logs . '/errors-*.jsonl') ?: [], static fn(string $file): bool => !str_contains($file, $today))),
            'every day before today went first',
        );
        $total = 0;
        foreach (glob($this->logs . '/errors-*.jsonl') ?: [] as $file) {
            $total += filesize($file);
        }
        // A part is written to while it is under its size, so it may end a line past it: the size, a part, and a line.
        self::assertLessThan(4096 + 2 * 1024, $total, 'the whole log stays within its size and a part');
        $dropped = $log->reader()->dropped();
        self::assertGreaterThan(0, $dropped[$today] ?? 0, 'what today alone does not fit is counted');
        self::assertSame($dropped, $log->reader()->report(['days' => 1])['dropped']);
    }

    public function testOneKindWritesAtMostItsLinesADayAndTheRestAreCounted(): void
    {
        [$app, $log] = $this->app(['perFingerprintDay' => 3]);
        $app->get('/api/fail', static function (): ResponseInterface {
            throw new RuntimeException('The same failure');
        });
        for ($i = 0; $i < 5; $i++) {
            $this->send($app, 'GET', '/api/fail');
            $this->send($app, 'GET', '/api/nowhere-' . $i);
        }
        $this->send($app, 'GET', '/api/another', admin: false);

        $lines = $this->lines();
        self::assertSame(3, count(array_filter($lines, static fn(array $line): bool => $line['type'] === 'RuntimeException')), 'three of one failure');
        self::assertSame(3, count(array_filter($lines, static fn(array $line): bool => $line['status'] === 404)), 'three of a scanner\'s 404s, however many paths');
        self::assertSame([gmdate('Y-m-d') => 5], $log->reader()->dropped(), 'the rest counted');

        // Clearing the day clears its count too: the kinds start again.
        self::assertGreaterThan(0, $log->reader()->clear());
        self::assertSame([], glob($this->logs . '/errors-*.counts.json') ?: []);
        $this->send($app, 'GET', '/api/fail');
        self::assertCount(1, $this->lines());
    }

    public function testGenshinsLinesAreReadAsTheyWere(): void
    {
        mkdir($this->logs, 0777, true);
        $local = date('Y-m-d H:i:s', time() - 60);
        $legacy = [
            'at' => $local,
            'level' => 'warning',
            'status' => 404,
            'type' => 'Response',
            'message' => '{"error":"Not found"}',
            'file' => '',
            'line' => 0,
            'method' => 'GET',
            'path' => '/api/x',
            'user_id' => null,
            'session_id' => 'abc',
            'ip' => '203.0.113.1',
            'fingerprint' => 'abcdef012345',
        ];
        file_put_contents($this->logs . '/errors-' . date('Y-m-d') . '.jsonl', json_encode($legacy) . "\n");

        $report = (new ErrorLog($this->logs, ['key' => str_repeat('k', 32)]))->reader()->report(['days' => 2]);

        self::assertSame(1, $report['total']);
        $entry = $report['groups'][0]['latest'];
        self::assertSame(0, $entry['v']);
        self::assertSame((new \DateTimeImmutable($local))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z'), $entry['at'], 'its server-local time, read as such');
        self::assertSame('203.0.113.1', $entry['ip'], 'shown as it was written');
        self::assertSame(['abcdef012345', 404, 'warning'], [$entry['fingerprint'], $entry['status'], $entry['level']]);
    }

    public function testThePagesOwnErrorsAreTakenRedactedAndLimited(): void
    {
        [$app, $log] = $this->app(['clientLimits' => ['perHour' => 3, 'perDay' => 5]]);
        ErrorLogRoutes::client($app, '/api/client-errors', $log, $this->context());

        $response = $this->send(
            $app,
            'POST',
            '/api/client-errors',
            (string) json_encode([
                'type' => 'TypeError',
                'message' => 'Cannot read x of ana@example.com token ' . self::JWT,
                'page' => '/account/security?code=ABC123SECRET',
                'stack' => "TypeError: Cannot read\n    at https://iam.example.sk/main-AB12CD34EF56GH78.js:1:2345\n    at render (https://iam.example.sk/chunk.js?v=SECRET9:3:4)",
                'status' => 0,
            ]),
        );
        self::assertSame(204, $response->getStatusCode());
        $line = $this->lines()[0];
        self::assertSame(['client', 'error', 'TypeError', '/account/security', 7], [$line['source'], $line['level'], $line['type'], $line['path'], $line['user_id']]);
        self::assertSame('Cannot read x of {email} token {token}', $line['message']);
        self::assertSame(['at https://iam.example.sk/main-AB12CD34EF56GH78.js:1:2345', 'at render (https://iam.example.sk/chunk.js?{…}'], $line['trace']);
        self::assertStringNotContainsString('SECRET', $this->rawLog());

        // Every refusal the browser's reporter may meet, in the library's one shape: {code, message}, the 429 with
        // its wait in the body and in Retry-After - and none of them written into the log.
        foreach (
            [
                [422, 'message_required', '{"type":"Error"}', []],
                [413, 'too_large', (string) json_encode(['message' => str_repeat('a', 9000)]), []],
                [415, 'unsupported_media_type', 'message=x', ['Content-Type' => 'application/x-www-form-urlencoded']],
            ]
            as [$status, $code, $body, $headers]
        ) {
            $refused = $this->send($app, 'POST', '/api/client-errors', $body, $headers);
            self::assertSame([$status, $code], [$refused->getStatusCode(), $this->json($refused)['code']], $code);
            self::assertIsString($this->json($refused)['message']);
        }
        // A visitor is counted by their address bucket - an IPv6 address by its /64 - and the visitors' day by itself.
        $visitor = fn(string $message, string $address): int => $this->send(
            $app,
            'POST',
            '/api/client-errors',
            (string) json_encode(['message' => $message]),
            [],
            $address,
            admin: false,
        )->getStatusCode();
        self::assertSame([204, 204, 204], [$visitor('v1', '198.51.100.1'), $visitor('v2', '198.51.100.1'), $visitor('v3', '198.51.100.1')]);
        self::assertSame(429, $visitor('v4', '198.51.100.1'), 'three an hour from one address');
        self::assertSame([204, 204], [$visitor('v5', '2001:db8:1:1::5'), $visitor('v6', '2001:db8:1:1::6')]);
        self::assertSame(429, $visitor('v7', '2001:db8:1:2::5'), 'five a day from the visitors in all');

        // A signed-in person is counted by their account, from wherever they are - in a day of their own, which the
        // visitors' spent budget does not touch.
        self::assertSame(204, $this->send($app, 'POST', '/api/client-errors', '{"message":"two"}', [], '198.51.100.9')->getStatusCode(), 'the visitors\' day is not the signed-in people\'s');
        self::assertSame(204, $this->send($app, 'POST', '/api/client-errors', '{"message":"three"}', [], '2001:db8:9::1')->getStatusCode());
        $limited = $this->send($app, 'POST', '/api/client-errors', '{"message":"four"}', [], '203.0.113.200');
        self::assertSame([429, 'too_many'], [$limited->getStatusCode(), $this->json($limited)['code']], 'three an hour from one account, whatever its address');
        self::assertGreaterThan(0, (int) $limited->getHeaderLine('Retry-After'));
        self::assertSame($limited->getHeaderLine('Retry-After'), (string) $this->json($limited)['retry_after']);
        self::assertCount(8, $this->lines());
        $counts = (string) file_get_contents($this->logs . '/client-errors.json');
        foreach (['198.51.100', '2001:db8', 'account:', '"7"'] as $never) {
            self::assertStringNotContainsString($never, $counts, 'keyed hashes alone, never an address or an id');
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $options @return array{App, ErrorLog} */
    private function app(array $options = []): array
    {
        $app = AppFactory::create();
        $log = new ErrorLog(
            $this->logs,
            $options + [
                'root' => dirname(__DIR__, 3),
                'context' => $this->context(),
                'key' => str_repeat('k', 32),
                'app' => $app,
            ],
        );
        $app->addRoutingMiddleware();
        $errors = $app->addErrorMiddleware(false, false, false);
        $errors->setDefaultErrorHandler(
            $log->wrapHandler(static function (ServerRequestInterface $request, \Throwable $exception) use ($app): ResponseInterface {
                [$status, $code, $message] = match (true) {
                    $exception instanceof \Slim\Exception\HttpNotFoundException => [404, 'not_found', 'Not found.'],
                    $exception instanceof \Slim\Exception\HttpMethodNotAllowedException => [405, 'method_not_allowed', 'Method not allowed.'],
                    default => [500, 'server_error', 'Something went wrong on our side'],
                };
                $response = $app->getResponseFactory()->createResponse($status);
                $response->getBody()->write((string) json_encode(['code' => $code, 'error' => $message]));

                return $response->withHeader('Content-Type', 'application/json');
            }),
        );
        $app->add(ErrorLogMiddleware::outer($log));

        return [$app, $log];
    }

    /** Who acts: 7 for a request with X-Test-Admin, nobody without; the site's ADMIN with X-Test-Admin: yes. */
    private function context(): AdminContext
    {
        return new AdminContext(
            static fn(ServerRequestInterface $request): ?int => $request->hasHeader('X-Test-Admin') ? 7 : null,
            isAdmin: static fn(ServerRequestInterface $request): bool => $request->getHeaderLine('X-Test-Admin') === 'yes',
        );
    }

    private function adminCheck(): \Closure
    {
        return static function (ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface {
            return $request->getHeaderLine('X-Test-Admin') === 'yes' ? $handler->handle($request) : (new ResponseFactory())->createResponse(403);
        };
    }

    /** @param array<string, string> $headers */
    private function send(App $app, string $method, string $target, string $body = '', array $headers = [], string $address = '203.0.113.9', bool $admin = true): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://site.example' . $target, ['REMOTE_ADDR' => $address]);
        parse_str((string) parse_url($target, PHP_URL_QUERY), $query);
        $request = $request->withQueryParams($query)->withBody((new StreamFactory())->createStream($body));
        foreach ($headers + ['Content-Type' => 'application/json'] + ($admin ? ['X-Test-Admin' => 'yes'] : []) as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /** A function a password is handed to: its argument must never reach the log. */
    private static function changePassword(string $password): void
    {
        throw new RuntimeException('No account ana@example.com for that password; ask 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b');
    }

    /** A failure deep inside the work: a wrapper's cause. */
    private static function scrubFailure(string $message): PDOException
    {
        return new PDOException($message);
    }

    /** A wrapper's sentence, made on one line whatever its cause - so one fingerprint, with a cause or without. */
    private static function thrownFor(?\Throwable $cause): RuntimeException
    {
        return new RuntimeException('The accounts the IAM deleted were not checked again.', 0, $cause);
    }

    /** @return list<array<string, mixed>> */
    private function lines(): array
    {
        $lines = [];
        foreach (glob($this->logs . '/errors-*.jsonl') ?: [] as $file) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $lines[] = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
            }
        }

        return $lines;
    }

    /** @return list<array<string, mixed>> one day's lines */
    private function linesOf(string $day): array
    {
        $lines = [];
        foreach (glob($this->logs . "/errors-$day*.jsonl") ?: [] as $file) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $lines[] = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
            }
        }

        return $lines;
    }

    private function rawLog(): string
    {
        $raw = '';
        foreach (glob($this->logs . '/errors-*.jsonl') ?: [] as $file) {
            $raw .= file_get_contents($file);
        }

        return $raw;
    }

    /** @return array<mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
