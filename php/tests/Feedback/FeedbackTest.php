<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Feedback;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Feedback\Feedback;
use Anotoki\Lib\Feedback\Http\FeedbackRoutes;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

/** Feedback on a real Slim app and database: what the open form keeps, what it lets through, and the admin page. */
final class FeedbackTest extends DatabaseTestCase
{
    private const KEY = 'feedback-test-key-0123456789abcdef';

    /** The proxy the site trusts, and the header it writes whole. */
    private const PROXY = '173.245.48.1';

    /** @var list<callable> */
    private array $deferred = [];

    /** @var list<array<string, mixed>> */
    private array $notified = [];

    protected function setUp(): void
    {
        parent::setUp();
        self::assertNull($this->migrator([Schema::migrationSet()])->apply()['error']);
    }

    public function testAMessageKeepsWhatTheTokenSaysAndNoAddressOfTheSender(): void
    {
        $app = $this->app();

        $response = $this->post($app, [
            'kind' => 'bug', 'section' => 'Characters', 'subject' => ' Wrong talent ', 'message' => "  The numbers\nare off.  ",
            'page' => '/characters/raiden?token=SECRET#talents', 'language' => 'SK', 'user_id' => 999, 'id' => 5,
            'details' => ['steps' => 'Open it', 'unknown' => 'dropped'],
        ], person: ['id' => 42, 'email' => 'ana@example.com']);

        self::assertSame(201, $response->getStatusCode());
        self::assertSame(['ok' => true], $this->json($response), 'no id handed out');
        $row = $this->rows('SELECT * FROM anotoki_feedback')[0];
        self::assertSame(
            ['bug', 'new', 'Characters', 'Wrong talent', "The numbers\nare off.", 'ana@example.com', 42, '/characters/raiden', 'sk', 'TestBrowser/1.0'],
            [$row['kind'], $row['status'], $row['section'], $row['subject'], $row['message'], $row['contact_email'], $row['user_id'], $row['page'], $row['language'], $row['user_agent']],
            'the id from the token, never the body; the account\'s address; the page without its query'
        );
        self::assertSame(['steps' => 'Open it'], json_decode($row['details'], true));
        self::assertSame(hash_hmac('sha256', '203.0.113.9', self::KEY), $row['client_hash']);
        self::assertStringNotContainsString('203.0.113.9', (string) json_encode($row), 'the address itself is kept nowhere');
        self::assertStringNotContainsString('SECRET', (string) json_encode($row));

        $this->post($app, ['kind' => 'idea', 'message' => 'Anonymous', 'email' => 'mine@example.com', 'anonymous' => true], person: ['id' => 42, 'email' => 'ana@example.com']);
        $row = $this->rows("SELECT user_id, contact_email FROM anotoki_feedback WHERE message = 'Anonymous'")[0];
        self::assertSame([null, null], [$row['user_id'], $row['contact_email']], 'without my name: no id and no address');
    }

    public function testEveryRefusalHasItsCode(): void
    {
        $app = $this->app(['subjectRequiredFor' => ['bug']]);
        $cases = [
            'kind_unknown' => ['kind' => 'Bug', 'message' => 'x'],
            'message_required' => ['kind' => 'idea', 'message' => '   '],
            'too_long' => ['kind' => 'idea', 'message' => str_repeat('a', 10001)],
            'subject_too_long' => ['kind' => 'idea', 'message' => 'x', 'subject' => str_repeat('s', 201)],
            'subject_required' => ['kind' => 'bug', 'message' => 'x'],
            'section_unknown' => ['kind' => 'idea', 'message' => 'x', 'section' => 'Nowhere'],
            'email_invalid' => ['kind' => 'idea', 'message' => 'x', 'email' => 'not an address'],
        ];
        foreach ($cases as $code => $body) {
            $response = $this->post($app, $body);
            self::assertSame([422, $code], [$response->getStatusCode(), $this->json($response)['code']], $code);
        }
        $long = $this->post($app, ['kind' => 'idea', 'message' => 'x', 'details' => ['steps' => str_repeat('s', 2001)]]);
        self::assertSame(['too_long', 'steps'], [$this->json($long)['code'], $this->json($long)['field']]);
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => str_repeat('ž', 10000)])->getStatusCode(), 'ten thousand characters, not bytes');

        self::assertSame(413, $this->post($app, ['kind' => 'idea', 'message' => str_repeat('a', 70000)])->getStatusCode(), 'a body over 64 KB');
        self::assertSame(415, $this->send($app, 'POST', '/api/feedback', 'kind=idea&message=x', ['Content-Type' => 'application/x-www-form-urlencoded'])->getStatusCode());
        self::assertSame(1, (int) $this->value('SELECT count(*) FROM anotoki_feedback'));
    }

    public function testTheHoneypotKeepsNothingAndSaysTheSame(): void
    {
        $app = $this->app();

        $response = $this->post($app, ['kind' => 'idea', 'message' => 'Buy things', 'website' => 'https://spam.example']);

        self::assertSame([202, ['ok' => true]], [$response->getStatusCode(), $this->json($response)]);
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM anotoki_feedback'));
    }

    public function testTheLimitsCountTheTrustedProxysAddressNeverAForwardedHeader(): void
    {
        $app = $this->app(['limits' => ['perHour' => 3, 'perDay' => 4, 'allPerDay' => 5]]);

        // A sender who writes a new X-Forwarded-For (and CF-Connecting-IP) every time, from an untrusted address.
        for ($i = 1; $i <= 3; $i++) {
            $response = $this->post($app, ['kind' => 'idea', 'message' => "try $i"], headers: ['X-Forwarded-For' => "10.0.0.$i", 'CF-Connecting-IP' => "10.1.0.$i"]);
            self::assertSame(201, $response->getStatusCode(), "try $i");
        }
        $limited = $this->post($app, ['kind' => 'idea', 'message' => 'try 4'], headers: ['X-Forwarded-For' => '10.0.0.4', 'CF-Connecting-IP' => '10.1.0.4']);
        self::assertSame([429, 'too_many'], [$limited->getStatusCode(), $this->json($limited)['code']], 'the headers of a stranger change nothing');
        self::assertGreaterThan(3500, (int) $limited->getHeaderLine('Retry-After'));
        self::assertSame($limited->getHeaderLine('Retry-After'), (string) $this->json($limited)['retry_after']);

        // Through the trusted proxy, its header names the sender.
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'via proxy'], headers: ['CF-Connecting-IP' => '198.51.100.7'], address: self::PROXY)->getStatusCode());
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'via proxy 2'], headers: ['CF-Connecting-IP' => '198.51.100.8'], address: self::PROXY)->getStatusCode());
        $everybody = $this->post($app, ['kind' => 'idea', 'message' => 'one more'], headers: ['CF-Connecting-IP' => '198.51.100.9'], address: self::PROXY);
        self::assertSame(429, $everybody->getStatusCode(), 'five a day from everybody');
        self::assertStringContainsString('tomorrow', $this->json($everybody)['message']);

        $this->pdo->exec("UPDATE anotoki_feedback SET created_at = now() - interval '2 hours' WHERE message LIKE 'try %'");
        $this->pdo->exec("DELETE FROM anotoki_feedback WHERE message LIKE 'via proxy%'");
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'later'])->getStatusCode(), 'the hour is over');
        self::assertSame(429, $this->post($app, ['kind' => 'idea', 'message' => 'and later'])->getStatusCode(), 'four a day from one address');
    }

    public function testOnlySignedInWhereTheSiteSaysSo(): void
    {
        $app = $this->app(['signedInOnly' => true]);

        self::assertSame(401, $this->post($app, ['kind' => 'idea', 'message' => 'x'])->getStatusCode());
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'x'], person: ['id' => 3])->getStatusCode());
    }

    public function testTheAdminPage(): void
    {
        $audit = new AuditLog(fn (): PDO => $this->pdo);
        $app = $this->app([], $audit);
        $this->post($app, ['kind' => 'bug', 'subject' => 'Broken', 'message' => 'It broke', 'section' => 'Characters', 'details' => ['steps' => 'Click the talent']], person: ['id' => 42]);
        $this->post($app, ['kind' => 'idea', 'message' => 'More weapons']);
        $this->post($app, ['kind' => 'other', 'message' => 'Hello'], address: '198.51.100.30');

        self::assertSame(403, $this->send($app, 'GET', '/api/admin/feedback', admin: false)->getStatusCode());
        self::assertSame(['unread' => 3], $this->json($this->send($app, 'GET', '/api/admin/feedback/unread')));
        $page = $this->json($this->send($app, 'GET', '/api/admin/feedback'));
        self::assertSame([3, 1, 25], [$page['total'], $page['page'], $page['pageSize']]);
        self::assertSame(['Hello', 'More weapons', 'It broke'], array_column($page['items'], 'message'));
        self::assertArrayNotHasKey('client_hash', $page['items'][0], 'the bucket\'s hash never leaves the server');
        self::assertSame('Ana', $page['items'][2]['user_name']);
        self::assertSame(1, $this->json($this->send($app, 'GET', '/api/admin/feedback?search=talent'))['total'], 'the extra fields are searched too');
        self::assertSame(1, $this->json($this->send($app, 'GET', '/api/admin/feedback?kind=bug&status=new&section=Characters'))['total']);
        self::assertSame(0, $this->json($this->send($app, 'GET', '/api/admin/feedback?search=100%25'))['total']);
        $facets = $this->json($this->send($app, 'GET', '/api/admin/feedback/facets'));
        self::assertSame(['bug', 'idea', 'other'], $facets['kinds']);
        self::assertSame(['new' => 3, 'read' => 0, 'resolved' => 0, 'spam' => 0], $facets['byStatus']);
        self::assertSame(['Characters', 'Weapons'], $facets['sections']);

        $id = (int) $page['items'][1]['id'];
        $opened = $this->json($this->send($app, 'GET', "/api/admin/feedback/$id"))['message'];
        self::assertSame('read', $opened['status'], 'opening a new one makes it read');
        self::assertSame(['unread' => 2], $this->json($this->send($app, 'GET', '/api/admin/feedback/unread')));
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM anotoki_audit_log'), 'reading is no decision');

        $resolved = $this->json($this->send($app, 'PUT', "/api/admin/feedback/$id/status", '{"status":"resolved"}'))['message'];
        self::assertSame(['resolved', 7, 'Bo'], [$resolved['status'], $resolved['handled_by'], $resolved['handled_by_name']]);
        self::assertSame(422, $this->send($app, 'PUT', "/api/admin/feedback/$id/status", '{"status":"done"}')->getStatusCode());
        self::assertSame(404, $this->send($app, 'PUT', '/api/admin/feedback/999/status', '{"status":"spam"}')->getStatusCode());
        self::assertSame(['deleted' => true], $this->json($this->send($app, 'DELETE', "/api/admin/feedback/$id")));
        self::assertSame(404, $this->send($app, 'DELETE', "/api/admin/feedback/$id")->getStatusCode());
        self::assertSame(403, $this->send($app, 'DELETE', '/api/admin/feedback/' . $page['items'][0]['id'], admin: false)->getStatusCode());

        $entries = $this->rows('SELECT actor_id, action, target_type, target_id, details FROM anotoki_audit_log ORDER BY id');
        self::assertSame([[7, 'feedback.status_changed', 'feedback', (string) $id], [7, 'feedback.deleted', 'feedback', (string) $id]], array_map(
            static fn (array $row): array => [$row['actor_id'], $row['action'], $row['target_type'], $row['target_id']],
            $entries
        ));
        self::assertSame(['to' => 'resolved', 'from' => 'read'], json_decode((string) $entries[0]['details'], true));
    }

    public function testWithoutItsTableFeedbackIsUnavailable(): void
    {
        $this->pdo->exec('DROP TABLE anotoki_feedback');
        $app = $this->app();

        $response = $this->post($app, ['kind' => 'idea', 'message' => 'x']);
        self::assertSame([503, 'feature_unavailable', '60'], [$response->getStatusCode(), $this->json($response)['code'], $response->getHeaderLine('Retry-After')]);
        self::assertSame(503, $this->send($app, 'GET', '/api/admin/feedback/unread')->getStatusCode());
    }

    public function testWhatIsKeptNoLongerGoesAndAPersonIsForgotten(): void
    {
        $feedback = $this->feedback();
        $app = $this->app();
        foreach (['spam old', 'spam new', 'resolved old', 'resolved new', 'new old'] as $message) {
            $this->post($app, ['kind' => 'idea', 'message' => $message, 'email' => 'x@example.com'], person: ['id' => 5]);
        }
        $this->pdo->exec("UPDATE anotoki_feedback SET status = 'spam', handled_at = now() - interval '31 days' WHERE message = 'spam old'");
        $this->pdo->exec("UPDATE anotoki_feedback SET status = 'spam', handled_at = now() - interval '29 days' WHERE message = 'spam new'");
        $this->pdo->exec("UPDATE anotoki_feedback SET status = 'resolved', handled_at = now() - interval '366 days' WHERE message = 'resolved old'");
        $this->pdo->exec("UPDATE anotoki_feedback SET status = 'resolved', handled_at = now() - interval '300 days' WHERE message = 'resolved new'");
        $this->pdo->exec("UPDATE anotoki_feedback SET created_at = now() - interval '400 days' WHERE message = 'new old'");

        self::assertSame(['spam' => 1, 'resolved' => 1, 'client_hash' => 1], $feedback->prune());
        self::assertSame(['new old', 'resolved new', 'spam new'], $this->pdo->query('SELECT message FROM anotoki_feedback ORDER BY message')->fetchAll(PDO::FETCH_COLUMN));
        self::assertNull($this->value("SELECT client_hash FROM anotoki_feedback WHERE message = 'new old'"), 'kept, without its bucket\'s hash');

        self::assertSame(3, $feedback->forgetPeople([5, 'x']));
        self::assertSame([[null, null, 5]], array_values(array_unique(array_map(
            static fn (array $row): array => [$row['contact_email'], $row['user_agent'], $row['user_id']],
            $this->rows('SELECT contact_email, user_agent, user_id FROM anotoki_feedback')
        ), SORT_REGULAR)), 'the message stays; the address and the browser go');
    }

    public function testThePruneRunsOnceADayAfterTheAnswer(): void
    {
        $storage = $this->path('storage');
        $feedback = $this->feedback(['storage' => $storage]);

        $feedback->pruneIfDue();
        $feedback->pruneIfDue();
        self::assertCount(1, $this->deferred, 'once a day');
        ($this->deferred[0])();
        self::assertFileExists($storage . '/cache/anotoki-feedback-prune.stamp');
    }

    public function testASiteMayBeToldOfEveryMessageAfterTheAnswer(): void
    {
        $app = $this->app(['notify' => function (array $message): void {
            $this->notified[] = $message;
        }]);

        $this->post($app, ['kind' => 'idea', 'message' => 'Tell me']);

        self::assertSame([], $this->notified, 'not before the answer');
        foreach ($this->deferred as $work) {
            $work();
        }
        self::assertSame('Tell me', $this->notified[0]['message']);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $options */
    private function feedback(array $options = []): Feedback
    {
        return new Feedback(fn (): PDO => $this->pdo, $options + [
            'key' => self::KEY,
            'sections' => ['Characters', 'Weapons'],
            'fields' => ['steps' => 2000, 'expected' => 2000],
            'defer' => function (callable $work): void {
                $this->deferred[] = $work;
            },
        ]);
    }

    /** @param array<string, mixed> $options */
    private function app(array $options = [], ?AuditLog $audit = null): App
    {
        $feedback = $this->feedback($options);
        $context = new AdminContext(
            static fn (ServerRequestInterface $request): ?int => $request->getHeaderLine('X-Test-Admin') === 'yes' ? 7 : null,
            null,
            AdminContext::PROOF_RECENT_SIGN_IN,
            // The site's address: a trusted proxy's header from the trusted proxy alone, else the connection's.
            static function (ServerRequestInterface $request): string {
                $address = (string) ($request->getServerParams()['REMOTE_ADDR'] ?? '');
                $forwarded = $request->getHeaderLine('CF-Connecting-IP');

                return $address === self::PROXY && filter_var($forwarded, FILTER_VALIDATE_IP) !== false ? $forwarded : $address;
            },
        );
        $app = AppFactory::create();
        FeedbackRoutes::public($app, '/api/feedback', $feedback, $context, static function (ServerRequestInterface $request): ?array {
            $person = $request->getHeaderLine('X-Test-Person');

            return $person === '' ? null : json_decode($person, true);
        });
        FeedbackRoutes::admin($app, '/api/admin/feedback', $feedback, $context, $audit, static fn (array $ids): array => array_intersect_key([42 => 'Ana', 7 => 'Bo'], array_flip($ids)))
            ->add(static fn (ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface => $request->getHeaderLine('X-Test-Admin') === 'yes'
                ? $handler->handle($request)
                : (new ResponseFactory())->createResponse(403));

        return $app;
    }

    /**
     * @param array<string, mixed> $body
     * @param ?array<string, mixed> $person
     * @param array<string, string> $headers
     */
    private function post(App $app, array $body, ?array $person = null, array $headers = [], string $address = '203.0.113.9'): ResponseInterface
    {
        if ($person !== null) {
            $headers['X-Test-Person'] = (string) json_encode($person);
        }

        return $this->send($app, 'POST', '/api/feedback', (string) json_encode($body), $headers, $address, false);
    }

    /** @param array<string, string> $headers */
    private function send(App $app, string $method, string $target, string $body = '', array $headers = [], string $address = '203.0.113.9', bool $admin = true): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://site.example' . $target, ['REMOTE_ADDR' => $address]);
        parse_str((string) parse_url($target, PHP_URL_QUERY), $query);
        $request = $request->withQueryParams($query)->withBody((new StreamFactory())->createStream($body))->withHeader('User-Agent', 'TestBrowser/1.0');
        foreach ($headers + ['Content-Type' => 'application/json'] + ($admin ? ['X-Test-Admin' => 'yes'] : []) as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /** @return array<mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
