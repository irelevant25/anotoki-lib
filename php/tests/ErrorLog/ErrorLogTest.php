<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\ErrorLog;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\ErrorLog\ErrorLog;
use Anotoki\Lib\ErrorLog\ErrorLogMiddleware;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Tests\Support\TemporaryFolder;
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
        self::assertSame('php/tests/ErrorLog/ErrorLogTest.php', $line['file'], 'relative to the site\'s root');
        self::assertSame(['POST', '/api/admin/users/{id}/password', '/api/admin/users/42/password'], [$line['method'], $line['route'], $line['path']]);
        self::assertSame(7, $line['user_id']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{12}$/D', $line['client']);
        self::assertSame(substr(hash_hmac('sha256', '203.0.113.9', str_repeat('k', 32)), 0, 12), $line['client']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{12}$/D', $line['fingerprint']);
        self::assertStringStartsWith('php/tests/ErrorLog/ErrorLogTest.php:', $line['trace'][0]);
        self::assertStringEndsWith('ErrorLogTest::changePassword()', $line['trace'][0], 'the frame names the call, never its arguments');
        self::assertLessThanOrEqual(12, count($line['trace']));
        self::assertArrayNotHasKey('ip', $line);
        self::assertArrayNotHasKey('session_id', $line);
        self::assertFileExists($this->logs . '/.htaccess');
    }

    public function testAnAnswerIsWrittenWithItsCodeAndSentenceOnly(): void
    {
        [$app] = $this->app();
        $app->get('/api/things/{id}', function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            $response->getBody()->write((string) json_encode(['code' => 'not_found', 'error' => 'No thing for ana@example.com', 'echo' => 'BODY-FIELD-SECRET']));

            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        });
        $app->get('/api/forbidden', static fn (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response->withStatus(403));
        $app->get('/api/broken', static fn (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response->withStatus(400));
        $app->get('/api/busy', static fn (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response->withStatus(503));

        $this->send($app, 'GET', '/api/things/12?x=QUERY');
        $this->send($app, 'GET', '/api/forbidden');
        $this->send($app, 'GET', '/api/broken');
        $this->send($app, 'GET', '/api/busy');
        $this->send($app, 'GET', '/api/nowhere');

        $lines = $this->lines();
        self::assertSame([[404, 'Response', 'not_found', 'No thing for {email}', '/api/things/{id}'], [503, 'Response', null, '', '/api/busy'], [404, 'HttpNotFoundException', 'not_found', 'Not found.', null]], array_map(
            static fn (array $line): array => [$line['status'], $line['type'], $line['code'], $line['message'], $line['route']],
            $lines
        ), 'by default every 5xx and 404, 405, 413, 415, 429 - never 400 or 403');
        self::assertStringNotContainsString('BODY-FIELD-SECRET', $this->rawLog());
        self::assertStringNotContainsString('QUERY', $this->rawLog());
        self::assertSame('warning', $lines[0]['level']);
        self::assertSame('error', $lines[1]['level']);

        [$every] = $this->app(['responses' => static fn (int $status): bool => $status >= 400]);
        $every->get('/api/forbidden', static fn (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface => $response->withStatus(403));
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

    public function testTheLogsOwnRoutesAreNeverWrittenDown(): void
    {
        [$app, $log] = $this->app();
        ErrorLogRoutes::admin($app, '/api/admin/errors', $log, $this->context())->add($this->adminCheck());

        self::assertSame(404, $this->send($app, 'GET', '/api/admin/errors/zzzzzzzzzzzz')->getStatusCode());
        self::assertSame(405, $this->send($app, 'PUT', '/api/admin/errors')->getStatusCode());
        self::assertSame(403, $this->send($app, 'GET', '/api/admin/errors', admin: false)->getStatusCode());
        self::assertFileDoesNotExist($this->logs . '/errors-' . gmdate('Y-m-d') . '.jsonl');
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
        self::assertSame([3, 'RuntimeException', 'It failed 3 times', '/api/fail/{n}'], [$loudest['count'], $loudest['type'], $loudest['message'], $loudest['route']], 'one group for the three: the number is no part of its fingerprint');
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

    public function testDaysArePartedPrunedAndCapped(): void
    {
        $log = new ErrorLog($this->logs, ['key' => str_repeat('k', 32), 'maxBytes' => 1024, 'totalBytes' => 4096]);
        mkdir($this->logs, 0777, true);
        $old = gmdate('Y-m-d', time() - 31 * 86400);
        file_put_contents($this->logs . "/errors-$old.jsonl", "{}\n");
        file_put_contents($this->logs . '/errors-' . gmdate('Y-m-d', time() - 29 * 86400) . '.jsonl', "{}\n");

        for ($i = 0; $i < 60; $i++) {
            $log->record(new RuntimeException('Distinct failure number ' . str_repeat('x', $i % 26) . chr(65 + $i % 26) . $i), null);
        }

        self::assertFileDoesNotExist($this->logs . "/errors-$old.jsonl", 'a day past 30 is gone');
        self::assertFileExists($this->logs . '/errors-' . gmdate('Y-m-d', time() - 29 * 86400) . '.jsonl', 'one within 30 stays');
        $today = gmdate('Y-m-d');
        self::assertFileExists($this->logs . "/errors-$today.2.jsonl", 'a day goes on in parts');
        $total = 0;
        foreach (glob($this->logs . '/errors-*.jsonl') ?: [] as $file) {
            $total += filesize($file);
            self::assertLessThan(1024 + 1024, filesize($file));
        }
        self::assertLessThan(4096 + 1024, $total, 'the whole log stays within its cap and a part');
        $dropped = $log->reader()->dropped();
        self::assertGreaterThan(0, $dropped[$today] ?? 0, 'the lines that did not fit are counted');
        self::assertSame($dropped, $log->reader()->report(['days' => 1])['dropped']);
    }

    public function testGenshinsLinesAreReadAsTheyWere(): void
    {
        mkdir($this->logs, 0777, true);
        $local = date('Y-m-d H:i:s', time() - 60);
        $legacy = ['at' => $local, 'level' => 'warning', 'status' => 404, 'type' => 'Response', 'message' => '{"error":"Not found"}', 'file' => '', 'line' => 0,
            'method' => 'GET', 'path' => '/api/x', 'user_id' => null, 'session_id' => 'abc', 'ip' => '203.0.113.1', 'fingerprint' => 'abcdef012345'];
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

        $response = $this->send($app, 'POST', '/api/client-errors', (string) json_encode([
            'type' => 'TypeError',
            'message' => 'Cannot read x of ana@example.com token ' . self::JWT,
            'page' => '/account/security?code=ABC123SECRET',
            'stack' => "TypeError: Cannot read\n    at https://iam.example.sk/main-AB12CD34EF56GH78.js:1:2345\n    at render (https://iam.example.sk/chunk.js?v=SECRET9:3:4)",
            'status' => 0,
        ]));
        self::assertSame(204, $response->getStatusCode());
        $line = $this->lines()[0];
        self::assertSame(['client', 'error', 'TypeError', '/account/security', 7], [$line['source'], $line['level'], $line['type'], $line['path'], $line['user_id']]);
        self::assertSame('Cannot read x of {email} token {token}', $line['message']);
        self::assertSame(['at https://iam.example.sk/main-AB12CD34EF56GH78.js:1:2345', 'at render (https://iam.example.sk/chunk.js?{…}'], $line['trace']);
        self::assertStringNotContainsString('SECRET', $this->rawLog());

        self::assertSame(422, $this->send($app, 'POST', '/api/client-errors', '{"type":"Error"}')->getStatusCode());
        self::assertSame(413, $this->send($app, 'POST', '/api/client-errors', (string) json_encode(['message' => str_repeat('a', 9000)]))->getStatusCode());
        self::assertSame(415, $this->send($app, 'POST', '/api/client-errors', 'message=x', ['Content-Type' => 'application/x-www-form-urlencoded'])->getStatusCode());
        self::assertSame(204, $this->send($app, 'POST', '/api/client-errors', '{"message":"two"}')->getStatusCode());
        self::assertSame(204, $this->send($app, 'POST', '/api/client-errors', '{"message":"three"}')->getStatusCode());
        $limited = $this->send($app, 'POST', '/api/client-errors', '{"message":"four"}');
        self::assertSame([429, 'too_many'], [$limited->getStatusCode(), $this->json($limited)['code']], 'three an hour from one address');
        self::assertGreaterThan(0, (int) $limited->getHeaderLine('Retry-After'));
        self::assertSame(204, $this->send($app, 'POST', '/api/client-errors', '{"message":"other address"}', [], '198.51.100.1')->getStatusCode());
        self::assertSame(204, $this->send($app, 'POST', '/api/client-errors', '{"message":"other again"}', [], '198.51.100.1')->getStatusCode());
        self::assertSame(429, $this->send($app, 'POST', '/api/client-errors', '{"message":"a third"}', [], '198.51.100.2')->getStatusCode(), 'five a day from everybody');
        self::assertCount(5, $this->lines());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $options @return array{App, ErrorLog} */
    private function app(array $options = []): array
    {
        $app = AppFactory::create();
        $log = new ErrorLog($this->logs, $options + [
            'root' => dirname(__DIR__, 3),
            'context' => $this->context(),
            'key' => str_repeat('k', 32),
            'app' => $app,
        ]);
        $app->addRoutingMiddleware();
        $errors = $app->addErrorMiddleware(false, false, false);
        $errors->setDefaultErrorHandler($log->wrapHandler(static function (ServerRequestInterface $request, \Throwable $exception) use ($app): ResponseInterface {
            [$status, $code, $message] = match (true) {
                $exception instanceof \Slim\Exception\HttpNotFoundException => [404, 'not_found', 'Not found.'],
                $exception instanceof \Slim\Exception\HttpMethodNotAllowedException => [405, 'method_not_allowed', 'Method not allowed.'],
                default => [500, 'server_error', 'Something went wrong on our side'],
            };
            $response = $app->getResponseFactory()->createResponse($status);
            $response->getBody()->write((string) json_encode(['code' => $code, 'error' => $message]));

            return $response->withHeader('Content-Type', 'application/json');
        }));
        $app->add(ErrorLogMiddleware::outer($log));

        return [$app, $log];
    }

    private function context(): AdminContext
    {
        return new AdminContext(static fn (): int => 7);
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
