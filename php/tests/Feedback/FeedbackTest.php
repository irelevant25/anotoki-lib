<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Feedback;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Feedback\Feedback;
use Anotoki\Lib\Feedback\Http\FeedbackRoutes;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\LogLines;
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
            ['bug', 'new', 'Characters', 'Wrong talent', "The numbers\nare off.", null, 42, '/characters/raiden', 'sk', 'TestBrowser/1.0'],
            [$row['kind'], $row['status'], $row['section'], $row['subject'], $row['message'], $row['contact_email'], $row['user_id'], $row['page'], $row['language'], $row['user_agent']],
            'the id from the token, never the body; no address the form did not send - never the account\'s filled in here; the page without its query'
        );
        self::assertSame(['steps' => 'Open it'], json_decode($row['details'], true));
        self::assertArrayNotHasKey('client_hash', $row, 'nothing of where it came from on the message: no address, no hash of one');
        self::assertStringNotContainsString('203.0.113.9', (string) json_encode($row), 'the address itself is kept nowhere');
        self::assertStringNotContainsString(hash_hmac('sha256', '203.0.113.9', self::KEY), (string) json_encode($row));
        self::assertStringNotContainsString('SECRET', (string) json_encode($row));

        $this->post($app, ['kind' => 'idea', 'message' => 'Anonymous', 'email' => 'mine@example.com', 'anonymous' => true], person: ['id' => 42, 'email' => 'ana@example.com']);
        $row = $this->rows("SELECT user_id, contact_email FROM anotoki_feedback WHERE message = 'Anonymous'")[0];
        self::assertSame([null, null], [$row['user_id'], $row['contact_email']], 'without my name: no id and no address');

        // The address the form sent - the account's as the page wrote it in, or one typed over it - and only that.
        $this->post($app, ['kind' => 'idea', 'message' => 'Answer me', 'email' => 'ana@example.com'], person: ['id' => 42, 'email' => 'ana@example.com']);
        self::assertSame('ana@example.com', $this->value("SELECT contact_email FROM anotoki_feedback WHERE message = 'Answer me'"));
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
        // An address a mail link would read as more than an address: "?bcc=" adds a recipient, the rest end it.
        foreach ([
            'jan.novak%40gmail.com?bcc=attacker%40evil.example&x=@example.com', 'a?b@example.com', 'a&b@example.com',
            'a=b@example.com', 'a%b@example.com', 'a#b@example.com', "a\tb@example.com", 'a b@example.com',
        ] as $address) {
            $refused = $this->post($app, ['kind' => 'idea', 'message' => 'x', 'email' => $address]);
            self::assertSame([422, 'email_invalid', 'email'], [$refused->getStatusCode(), $this->json($refused)['code'], $this->json($refused)['field']], $address);
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

        $kept = $this->post($app, ['kind' => 'idea', 'message' => 'A real one']);
        $response = $this->post($app, ['kind' => 'idea', 'message' => 'Buy things', 'website' => 'https://spam.example']);

        self::assertSame([$kept->getStatusCode(), (string) $kept->getBody()], [$response->getStatusCode(), (string) $response->getBody()], 'word for word a kept message\'s answer');
        self::assertSame([201, ['ok' => true]], [$response->getStatusCode(), $this->json($response)]);
        self::assertSame(['A real one'], $this->pdo->query('SELECT message FROM anotoki_feedback')->fetchAll(PDO::FETCH_COLUMN));
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

        // Two hours on, and the proxy's two senders forgotten: one address's hour is over, its day is not.
        $this->ageLimits(7200, without: [hash_hmac('sha256', '198.51.100.7', self::KEY), hash_hmac('sha256', '198.51.100.8', self::KEY)]);
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'later'])->getStatusCode(), 'the hour is over');
        self::assertSame(429, $this->post($app, ['kind' => 'idea', 'message' => 'and later'])->getStatusCode(), 'four a day from one address');
        $this->ageLimits(86400);
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'a day on'])->getStatusCode(), 'and a day on, the day is over too');
    }

    public function testTheLimitsAreCountedApartAndForgottenADayLater(): void
    {
        $app = $this->app();
        $this->post($app, ['kind' => 'idea', 'message' => 'one']);
        $this->post($app, ['kind' => 'idea', 'message' => 'two'], address: '198.51.100.4');

        self::assertFalse(in_array('client_hash', array_column($this->rows("SELECT column_name FROM information_schema.columns WHERE table_name = 'anotoki_feedback'"), 'column_name'), true), 'no column for it');
        $count = $this->limits();
        self::assertSame(['v', 'visitors', 'accounts'], array_keys($count), 'a keyed hash of each sender and when - nothing else');
        self::assertEqualsCanonicalizing([hash_hmac('sha256', '203.0.113.9', self::KEY), hash_hmac('sha256', '198.51.100.4', self::KEY)], array_keys($count['visitors']));
        $raw = (string) file_get_contents($this->path('storage/' . Feedback::LIMITS_FILE));
        self::assertStringNotContainsString('203.0.113.9', $raw);
        self::assertStringNotContainsString('one', $raw, 'nothing of a message');
        self::assertFileExists($this->path('storage/cache/.htaccess'), 'in a denied folder');

        // A signed-in sender is counted by their account - a keyed hash of it too.
        $this->post($app, ['kind' => 'idea', 'message' => 'mine'], person: ['id' => 42]);
        self::assertSame([hash_hmac('sha256', 'account:42', self::KEY)], array_keys($this->limits()['accounts']));

        // A day later the times are gone with the next message: the count holds that message's alone.
        $this->ageLimits(86401);
        $this->post($app, ['kind' => 'idea', 'message' => 'three'], address: '198.51.100.5');
        self::assertSame([hash_hmac('sha256', '198.51.100.5', self::KEY)], array_keys($this->limits()['visitors']));
        self::assertSame([], $this->limits()['accounts']);
    }

    public function testSignedInSendersNeverSpendTheVisitorsBudget(): void
    {
        $app = $this->app(['limits' => ['perHour' => 3, 'perDay' => 10, 'allPerDay' => 2]]);

        // A few networks spend the visitors' budget for the day.
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'a'], address: '2001:db8:1::1')->getStatusCode());
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'b'], address: '2001:db8:2::1')->getStatusCode());
        self::assertSame(429, $this->post($app, ['kind' => 'idea', 'message' => 'c'], address: '2001:db8:3::1')->getStatusCode(), 'the visitors\' budget is spent');

        // People with an account are counted by it, never against the visitors' budget - signed in "without my name" too.
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'd'], person: ['id' => 42], address: '2001:db8:3::1')->getStatusCode());
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'e', 'anonymous' => true], person: ['id' => 42])->getStatusCode());
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'f'], person: ['id' => 7])->getStatusCode());
        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'g'], person: ['id' => 42])->getStatusCode());
        $own = $this->post($app, ['kind' => 'idea', 'message' => 'h'], person: ['id' => 42]);
        self::assertSame([429, 'too_many'], [$own->getStatusCode(), $this->json($own)['code']], 'their own limit, three an hour here');
        self::assertSame([null, null], $this->pdo->query("SELECT user_id, contact_email FROM anotoki_feedback WHERE message = 'e'")->fetch(PDO::FETCH_NUM), 'counted by the account, kept without it');

        // A count 0.4.1 wrote (`sent`) is read as the visitors'.
        file_put_contents($this->path('storage/' . Feedback::LIMITS_FILE), (string) json_encode(['v' => 1, 'sent' => [hash_hmac('sha256', '198.51.100.20', self::KEY) => [time() - 60, time() - 30]]]));
        self::assertSame(429, $this->post($app, ['kind' => 'idea', 'message' => 'i'], address: '198.51.100.21')->getStatusCode(), 'two visitors already today');
    }

    public function testFeedbackNeedsTheStorageFolderToCountIn(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        new Feedback(fn (): PDO => $this->pdo, ['key' => self::KEY]);
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

        // Nothing of the site's on the group: its own check refuses a bare request and anybody but the ADMIN.
        foreach (['/api/admin/feedback', '/api/admin/feedback/unread', '/api/admin/feedback/facets'] as $path) {
            $bare = $this->send($app, 'GET', $path, admin: false);
            self::assertSame([401, 'sign_in_required'], [$bare->getStatusCode(), $this->json($bare)['code']], "a bare request to $path");
            $other = $this->send($app, 'GET', $path, headers: ['X-Test-Admin' => 'no'], admin: false);
            self::assertSame([403, 'forbidden'], [$other->getStatusCode(), $this->json($other)['code']], "somebody else at $path");
            self::assertStringNotContainsString('Hello', (string) $other->getBody());
        }
        self::assertSame(['unread' => 3], $this->json($this->send($app, 'GET', '/api/admin/feedback/unread')));
        $page = $this->json($this->send($app, 'GET', '/api/admin/feedback'));
        self::assertSame([3, 1, 25], [$page['total'], $page['page'], $page['pageSize']]);
        self::assertSame(['Hello', 'More weapons', 'It broke'], array_column($page['items'], 'message'));
        self::assertArrayNotHasKey('client_hash', $page['items'][0], 'nothing of where a message came from');
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
        self::assertSame(401, $this->send($app, 'DELETE', '/api/admin/feedback/' . $page['items'][0]['id'], admin: false)->getStatusCode());
        self::assertSame(403, $this->send($app, 'DELETE', '/api/admin/feedback/' . $page['items'][0]['id'], headers: ['X-Test-Admin' => 'no'], admin: false)->getStatusCode());
        self::assertSame(2, (int) $this->value('SELECT count(*) FROM anotoki_feedback'), 'neither deleted anything');

        $entries = $this->rows('SELECT actor_id, action, target_type, target_id, details FROM anotoki_audit_log ORDER BY id');
        self::assertSame([[7, 'feedback.status_changed', 'feedback', (string) $id], [7, 'feedback.deleted', 'feedback', (string) $id]], array_map(
            static fn (array $row): array => [$row['actor_id'], $row['action'], $row['target_type'], $row['target_id']],
            $entries
        ));
        self::assertSame(['to' => 'resolved', 'from' => 'read'], json_decode((string) $entries[0]['details'], true));
        self::assertSame(
            ['kind' => $opened['kind'], 'status' => 'resolved', 'created_at' => $opened['created_at']],
            json_decode((string) $entries[1]['details'], true),
            'the time it was sent beside its id: a restore deletes it again by both (People::replay())',
        );
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

        self::assertSame(['spam' => 1, 'resolved' => 1], $feedback->prune());
        self::assertSame(['new old', 'resolved new', 'spam new'], $this->pdo->query('SELECT message FROM anotoki_feedback ORDER BY message')->fetchAll(PDO::FETCH_COLUMN));

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

    public function testANotifyThatFailsWithNoRunnerIsTheLibrarysLogLineRedacted(): void
    {
        LogLines::take();
        $app = $this->app(['defer' => null, 'notify' => static function (array $message): void {
            throw new \RuntimeException('no mail went to owner@example.test');
        }]);

        self::assertSame(201, $this->post($app, ['kind' => 'idea', 'message' => 'Tell me'])->getStatusCode(), 'the message is kept all the same');
        self::assertSame(['[feedback] no mail went to {email}'], LogLines::take());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $options */
    private function feedback(array $options = []): Feedback
    {
        return new Feedback(fn (): PDO => $this->pdo, $options + [
            'key' => self::KEY,
            'storage' => $this->path('storage'),
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
            // X-Test-Admin: yes is the site's ADMIN (7); any other value somebody else (9); none, nobody.
            static fn (ServerRequestInterface $request): ?int => $request->hasHeader('X-Test-Admin') ? ($request->getHeaderLine('X-Test-Admin') === 'yes' ? 7 : 9) : null,
            null,
            AdminContext::PROOF_RECENT_SIGN_IN,
            // The site's address: a trusted proxy's header from the trusted proxy alone, else the connection's.
            static function (ServerRequestInterface $request): string {
                $address = (string) ($request->getServerParams()['REMOTE_ADDR'] ?? '');
                $forwarded = $request->getHeaderLine('CF-Connecting-IP');

                return $address === self::PROXY && filter_var($forwarded, FILTER_VALIDATE_IP) !== false ? $forwarded : $address;
            },
            isAdmin: static fn (ServerRequestInterface $request): bool => $request->getHeaderLine('X-Test-Admin') === 'yes',
        );
        $app = AppFactory::create();
        FeedbackRoutes::public($app, '/api/feedback', $feedback, $context, static function (ServerRequestInterface $request): ?array {
            $person = $request->getHeaderLine('X-Test-Person');

            return $person === '' ? null : json_decode($person, true);
        });
        // Nothing of the site's on the group: the library's own check is the ADMIN's.
        FeedbackRoutes::admin($app, '/api/admin/feedback', $feedback, $context, $audit, static fn (array $ids): array => array_intersect_key([42 => 'Ana', 7 => 'Bo'], array_flip($ids)));

        return $app;
    }

    /** @return array<string, mixed> the limits' count as the file holds it */
    private function limits(): array
    {
        return json_decode((string) file_get_contents($this->path('storage/' . Feedback::LIMITS_FILE)), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Time passing, for the limits: every time in their count $seconds earlier, and the buckets $without gone.
     *
     * @param list<string> $without
     */
    private function ageLimits(int $seconds, array $without = []): void
    {
        $count = $this->limits();
        foreach (['visitors', 'accounts'] as $kind) {
            foreach ($count[$kind] as $sender => $times) {
                $count[$kind][$sender] = array_map(static fn (int $at): int => $at - $seconds, $times);
            }
            $count[$kind] = (object) array_diff_key($count[$kind], array_flip($without));
        }
        file_put_contents($this->path('storage/' . Feedback::LIMITS_FILE), (string) json_encode($count));
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
