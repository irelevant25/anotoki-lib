<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Backups;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\Http\BackupsRoutes;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\Migrator;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

/** The backups' routes on a real Slim app: the proof, the tickets, the ADMIN check, the gate while an update waits. */
final class BackupsRoutesTest extends BackupsTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->fill();
    }

    public function testTheListTheStatusAndAManualBackup(): void
    {
        $app = $this->app();

        $empty = $this->json($this->send($app, 'GET', '/api/admin/backups'));
        self::assertSame([], $empty['backups']);
        self::assertTrue($empty['status']['restorable']);
        self::assertTrue($empty['status']['copy_available']);
        self::assertFalse($empty['status']['encrypted']);
        self::assertNull($empty['status']['last_daily']);
        self::assertSame(['kind' => 'recent_sign_in'], $this->json($this->send($app, 'GET', '/api/admin/backups/proof')));

        $made = $this->send($app, 'POST', '/api/admin/backups', '{"description":"Before the season"}');
        self::assertSame(201, $made->getStatusCode());
        $backup = $this->json($made)['backup'];
        self::assertSame(['manual', 'Before the season', 7], [$backup['kind'], $backup['description'], $backup['created_by']]);
        self::assertArrayNotHasKey('schema', $backup);

        $listed = $this->json($this->send($app, 'GET', '/api/admin/backups'));
        self::assertSame([$backup['id']], array_column($listed['backups'], 'id'));
        self::assertTrue($listed['backups'][0]['restorable']);
        self::assertSame(1, $listed['status']['count']);
        $one = $this->json($this->send($app, 'GET', '/api/admin/backups/' . $backup['id']))['backup'];
        self::assertSame('people', array_column($one['tables'], 'name')[array_search('people', array_column($one['tables'], 'name'), true)]);
        self::assertSame(404, $this->send($app, 'GET', '/api/admin/backups/20261008-101530Z-manual-' . str_repeat('0', 32))->getStatusCode());
        self::assertSame(['backup.created'], $this->pdo->query('SELECT action FROM anotoki_audit_log')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame(7, (int) $this->value('SELECT actor_id FROM anotoki_audit_log'));
    }

    public function testNothingIsMadeDeletedDownloadedOrRestoredWithoutTheProof(): void
    {
        $app = $this->app();
        $backup = $this->json($this->send($app, 'POST', '/api/admin/backups'))['backup'];
        $id = $backup['id'];

        foreach ([
            ['POST', '/api/admin/backups', ''],
            ['DELETE', "/api/admin/backups/$id", ''],
            ['POST', "/api/admin/backups/$id/ticket", ''],
            ['POST', "/api/admin/backups/$id/restore", '{"confirm":"' . substr($id, -6) . '"}'],
        ] as [$method, $path, $body]) {
            $refused = $this->send($app, $method, $path, $body, authTime: time() - 3600);
            self::assertSame([403, 'reauth_required'], [$refused->getStatusCode(), $this->json($refused)['code']], "$method $path");
        }
        self::assertCount(1, $this->backupsWith()->list());
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM anotoki_audit_log WHERE action LIKE 'backup.%'"), 'no download, no delete, no restore');
    }

    public function testTheIamsProofIsItsPassword(): void
    {
        $app = $this->app(new AdminContext(
            static fn (): int => 1,
            static fn (ServerRequestInterface $request, array $body): ?array => ($body['password'] ?? null) === 'correct horse'
                ? null
                : ['status' => 422, 'code' => 'wrong_password', 'error' => 'The current password is not right'],
            AdminContext::PROOF_PASSWORD,
        ));
        self::assertSame(['kind' => 'password'], $this->json($this->send($app, 'GET', '/api/admin/backups/proof')));

        $wrong = $this->send($app, 'POST', '/api/admin/backups', '{"password":"wrong"}');
        self::assertSame([422, 'wrong_password'], [$wrong->getStatusCode(), $this->json($wrong)['code']]);
        $made = $this->send($app, 'POST', '/api/admin/backups', '{"password":"correct horse"}');
        self::assertSame(201, $made->getStatusCode());
        $id = $this->json($made)['backup']['id'];
        self::assertSame(200, $this->send($app, 'POST', "/api/admin/backups/$id/ticket", '{"password":"correct horse"}')->getStatusCode());
    }

    public function testATicketIsGoodForOneDownloadOfOneBackupWithinTheMinute(): void
    {
        $app = $this->app();
        $first = $this->json($this->send($app, 'POST', '/api/admin/backups'))['backup']['id'];
        $second = $this->json($this->send($app, 'POST', '/api/admin/backups'))['backup']['id'];

        $ticket = $this->json($this->send($app, 'POST', "/api/admin/backups/$first/ticket"));
        self::assertSame(60, $ticket['expires_in']);
        self::assertMatchesRegularExpression('~^/api/admin/backups/' . $first . '/file\?ticket=[A-Za-z0-9_-]{43}$~D', $ticket['url']);
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM anotoki_audit_log WHERE action = 'backup.downloaded'"));
        self::assertSame([], glob($this->storage . '/cache/backup-tickets/*' . substr($ticket['url'], -43) . '*') ?: [], 'only its hash is kept');

        $download = $this->send($app, 'GET', $ticket['url'], admin: false);
        self::assertSame(200, $download->getStatusCode(), 'a navigation sends no Bearer header: the ticket is the check');
        self::assertSame('application/octet-stream', $download->getHeaderLine('Content-Type'));
        self::assertSame('attachment; filename="shop-' . $first . '.anotoki-backup"', $download->getHeaderLine('Content-Disposition'));
        self::assertSame(['no-store', 'nosniff', 'no-referrer'], [$download->getHeaderLine('Cache-Control'), $download->getHeaderLine('X-Content-Type-Options'), $download->getHeaderLine('Referrer-Policy')]);
        $bytes = (string) file_get_contents($this->backups . "/$first.anotoki-backup");
        self::assertSame((string) strlen($bytes), $download->getHeaderLine('Content-Length'));
        self::assertSame($bytes, (string) $download->getBody());

        $again = $this->send($app, 'GET', $ticket['url'], admin: false);
        self::assertSame([403, 'ticket_invalid'], [$again->getStatusCode(), $this->json($again)['code']], 'used once');

        $forFirst = $this->json($this->send($app, 'POST', "/api/admin/backups/$first/ticket"))['url'];
        $stolen = str_replace("/$first/", "/$second/", $forFirst);
        self::assertSame(403, $this->send($app, 'GET', $stolen, admin: false)->getStatusCode(), 'for another backup');
        self::assertSame(403, $this->send($app, 'GET', $forFirst, admin: false)->getStatusCode(), 'and gone with that try');

        $late = $this->json($this->send($app, 'POST', "/api/admin/backups/$first/ticket"))['url'];
        foreach (glob($this->storage . '/cache/backup-tickets/*.ticket') ?: [] as $file) {
            $record = json_decode((string) file_get_contents($file), true);
            file_put_contents($file, (string) json_encode(['expires' => time() - 1] + $record));
        }
        self::assertSame(403, $this->send($app, 'GET', $late, admin: false)->getStatusCode(), 'past its minute');

        foreach (['', '?ticket=', '?ticket=' . str_repeat('A', 43), '?ticket[]=x'] as $query) {
            self::assertSame(403, $this->send($app, 'GET', "/api/admin/backups/$first/file$query", admin: false)->getStatusCode(), $query);
        }
    }

    public function testTheAdminRoutesAreTheAdminsAlone(): void
    {
        $app = $this->app();
        $id = $this->json($this->send($app, 'POST', '/api/admin/backups'))['backup']['id'];

        foreach ([
            ['GET', '/api/admin/backups'], ['GET', '/api/admin/backups/proof'], ['POST', '/api/admin/backups'],
            ['GET', "/api/admin/backups/$id"], ['DELETE', "/api/admin/backups/$id"], ['POST', "/api/admin/backups/$id/ticket"],
            ['GET', "/api/admin/backups/$id/preview"], ['POST', "/api/admin/backups/$id/restore"],
        ] as [$method, $path]) {
            self::assertSame(403, $this->send($app, $method, $path, admin: false)->getStatusCode(), "$method $path");
        }
        self::assertCount(1, $this->backupsWith()->list());
    }

    public function testARestoreThroughThePage(): void
    {
        $app = $this->app();
        $id = $this->json($this->send($app, 'POST', '/api/admin/backups'))['backup']['id'];
        $this->scramble();

        $preview = $this->json($this->send($app, 'GET', "/api/admin/backups/$id/preview"));
        self::assertTrue($preview['restorable']);
        self::assertSame(1, $preview['lost']);
        $mismatch = $this->send($app, 'POST', "/api/admin/backups/$id/restore", '{"confirm":"nope"}');
        self::assertSame([422, 'confirm_mismatch'], [$mismatch->getStatusCode(), $this->json($mismatch)['code']]);

        $restored = $this->send($app, 'POST', "/api/admin/backups/$id/restore", '{"confirm":"' . substr($id, -6) . '"}');
        self::assertSame(200, $restored->getStatusCode());
        self::assertSame($id, $this->json($restored)['restored']);
        self::assertSame(4, (int) $this->value('SELECT count(*) FROM people'));

        $deleted = $this->send($app, 'DELETE', "/api/admin/backups/$id");
        self::assertSame(['deleted' => true], $this->json($deleted));
        self::assertSame(['backup.created', 'backup.created', 'backup.restored', 'backup.deleted'], $this->pdo->query("SELECT action FROM anotoki_audit_log WHERE action LIKE 'backup.%' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN));

        $iam = $this->app(null, ['restore' => false]);
        $off = $this->send($iam, 'POST', "/api/admin/backups/$id/restore", '{"confirm":"' . substr($id, -6) . '"}', authTime: time() - 3600);
        self::assertSame([403, 'restore_disabled'], [$off->getStatusCode(), $this->json($off)['code']], 'said before any proof is asked');
    }

    public function testWhileAnUpdateWaitsTheBackupsAndTheErrorLogStayOpenButRestore(): void
    {
        $open = array_merge(BackupsRoutes::openPaths(), ErrorLogRoutes::openPaths());
        $id = '20261008-101530Z-manual-' . str_repeat('a', 32);
        foreach (['/api/admin/backups', '/api/admin/backups/proof', "/api/admin/backups/$id", "/api/admin/backups/$id/ticket", "/api/admin/backups/$id/file", "/api/admin/backups/$id/preview", '/api/admin/errors', '/api/admin/errors/0123456789ab'] as $path) {
            self::assertTrue(self::opens($open, $path), "$path is open");
        }
        foreach (["/api/admin/backups/$id/restore", '/api/admin/backups/x', '/api/admin/backupsX', "/api/admin/backups/$id/file/x", '/api/admin/errors/0123456789abc', '/api/admin/errors/x', "/api/admin/backups/$id\n"] as $path) {
            self::assertFalse(self::opens($open, $path), "$path is closed");
        }

        // On a site that blocks: the gate in front, an update waiting.
        $this->siteSet = $this->set('shop', ['002_waiting.sql' => 'CREATE TABLE waiting (id INT);']);
        $app = $this->app();
        $state = new SiteState(static fn (): ?string => null, static fn (): bool => true, fn (): Migrator => $this->siteMigrator($this->pdo));
        $app->add(new SiteGate($state, new ResponseFactory(), $open));
        $made = $this->send($app, 'POST', '/api/admin/backups', '{"description":"just before Apply"}');
        self::assertSame(201, $made->getStatusCode(), 'a backup just before Apply is the point');
        $backup = $this->json($made)['backup']['id'];
        $blocked = $this->send($app, 'POST', "/api/admin/backups/$backup/restore", '{"confirm":"' . substr($backup, -6) . '"}');
        self::assertSame([503, 'update_pending'], [$blocked->getStatusCode(), $this->json($blocked)['code']]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $options */
    private function app(?AdminContext $context = null, array $options = []): App
    {
        $context ??= new AdminContext(
            static fn (ServerRequestInterface $request): ?int => $request->getHeaderLine('X-Test-Admin') === 'yes' ? 7 : null,
            AdminContext::recentSignIn(static fn (ServerRequestInterface $request): ?int => ctype_digit($request->getHeaderLine('X-Test-Auth-Time')) ? (int) $request->getHeaderLine('X-Test-Auth-Time') : null),
        );
        $backups = $this->backupsWith($options);
        $app = AppFactory::create();
        BackupsRoutes::admin($app, '/api/admin/backups', $backups, $context)
            ->add(static fn (ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface => $request->getHeaderLine('X-Test-Admin') === 'yes'
                ? $handler->handle($request)
                : (new ResponseFactory())->createResponse(403));
        BackupsRoutes::file($app, '/api/admin/backups', $backups, $context);

        return $app;
    }

    private function send(App $app, string $method, string $target, string $body = '', bool $admin = true, ?int $authTime = null): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://site.example' . $target);
        parse_str((string) parse_url($target, PHP_URL_QUERY), $query);
        $request = $request->withQueryParams($query)
            ->withBody((new StreamFactory())->createStream($body))
            ->withHeader('X-Test-Auth-Time', (string) ($authTime ?? time() - 60));
        if ($body !== '') {
            $request = $request->withHeader('Content-Type', 'application/json');
        }

        return $app->handle($admin ? $request->withHeader('X-Test-Admin', 'yes') : $request);
    }

    /** @param list<string> $open */
    private static function opens(array $open, string $path): bool
    {
        foreach ($open as $pattern) {
            if (preg_match($pattern, $path) === 1) {
                return true;
            }
        }

        return false;
    }

    /** @return array<mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
