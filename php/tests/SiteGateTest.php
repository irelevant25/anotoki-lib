<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests;

use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use InvalidArgumentException;
use PDOException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

final class SiteGateTest extends DatabaseTestCase
{
    /** The paths a site keeps open while an update waits, as the sites will name them. */
    private const OPEN = ['/api/auth/config', '~^/api/translations/[a-z]{2,3}$~', '/api/health', '~^/api/admin/migrations(/.*)?$~'];

    /** How many times the gate asked for the state. */
    private int $computed = 0;

    /** Each state gets a folder of its own. */
    private int $folders = 0;

    public function testNotSetUpAndNeverInstalledAnswersEveryPathWithTheSetupPage(): void
    {
        $gate = $this->gate($this->state(SiteState::NOT_SET_UP, installed: false));

        foreach (['/api/auth/config', '/api/translations/en', '/api/anything', '/'] as $path) {
            $response = $this->through($gate, $path);
            self::assertSame(503, $response->getStatusCode(), $path);
            self::assertSame(
                '{"code":"not_set_up","installed":false,"message":"This site is not set up yet. Its setup page connects it to its database.","setup":"/setup.php"}',
                (string) $response->getBody()
            );
            self::assertSame('application/json; charset=utf-8', $response->getHeaderLine('Content-Type'));
            self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
            self::assertFalse($response->hasHeader('Retry-After'));
        }

        $elsewhere = new SiteGate($this->state(SiteState::NOT_SET_UP, installed: false), new ResponseFactory(), [], '/api/site-status', '/install/setup.php');
        self::assertSame('/install/setup.php', $this->body($this->through($elsewhere, '/api/x'))['setup']);
    }

    public function testNotSetUpButInstalledNeverOffersTheSetupPage(): void
    {
        $response = $this->through($this->gate($this->state(SiteState::NOT_SET_UP, installed: true)), '/api/anything');

        self::assertSame(503, $response->getStatusCode());
        self::assertSame(
            ['code' => 'not_set_up', 'installed' => true, 'message' => 'The site is not available right now. Try again in a few minutes.'],
            $this->body($response)
        );
    }

    public function testTheStatusPathAlwaysPassesWithoutAskingTheState(): void
    {
        foreach ([SiteState::NOT_SET_UP, SiteState::UPDATE_PENDING, SiteState::UNAVAILABLE, SiteState::READY] as $which) {
            $this->computed = 0;
            $gate = $this->gate($this->state($which));
            self::assertSame(200, $this->through($gate, '/api/site-status')->getStatusCode(), $which);
            self::assertSame(0, $this->computed, $which);
        }

        $custom = new SiteGate($this->state(SiteState::NOT_SET_UP), new ResponseFactory(), [], '/status');
        self::assertSame(200, $this->through($custom, '/status')->getStatusCode());
        self::assertSame(503, $this->through($custom, '/api/site-status')->getStatusCode());
    }

    public function testWhileAnUpdateWaitsOnlyTheOpenPathsPass(): void
    {
        $gate = $this->gate($this->state(SiteState::UPDATE_PENDING));

        foreach (['/api/auth/config', '/api/translations/sk', '/api/health', '/api/admin/migrations', '/api/admin/migrations/apply'] as $open) {
            self::assertSame(200, $this->through($gate, $open)->getStatusCode(), $open);
        }

        foreach (['/api/auth/config/', '/api/translations/sk/x', '/api/translations/', '/api/healthy', '/api/admin/migrationsx', '/api/me', '/'] as $closed) {
            $response = $this->through($gate, $closed, 'POST');
            self::assertSame(503, $response->getStatusCode(), $closed);
            self::assertSame('{"code":"update_pending","message":"The site is being updated. Try again in a few minutes."}', (string) $response->getBody());
            self::assertSame('60', $response->getHeaderLine('Retry-After'));
            self::assertSame('application/json; charset=utf-8', $response->getHeaderLine('Content-Type'));
            self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        }
    }

    public function testThePathIsReadDecoded(): void
    {
        $gate = $this->gate($this->state(SiteState::UPDATE_PENDING));

        self::assertSame(200, $this->through($gate, '/api/%61uth/config')->getStatusCode());
        self::assertSame(200, $this->through($gate, '/api/site%2Dstatus')->getStatusCode());
    }

    public function testASiteThatDoesNotBlockKeepsAnsweringWhileAnUpdateWaits(): void
    {
        $gate = $this->gate($this->state(SiteState::UPDATE_PENDING, block: false));

        self::assertSame(200, $this->through($gate, '/api/me')->getStatusCode());
        self::assertSame(200, $this->through($gate, '/api/admin/users', 'POST')->getStatusCode());
    }

    public function testUnavailableAndReadyPass(): void
    {
        self::assertSame(200, $this->through($this->gate($this->state(SiteState::UNAVAILABLE)), '/api/me')->getStatusCode());
        self::assertSame(200, $this->through($this->gate($this->state(SiteState::READY)), '/api/me')->getStatusCode());
    }

    public function testTheStateIsComputedOncePerRequest(): void
    {
        foreach ([SiteState::NOT_SET_UP, SiteState::UPDATE_PENDING, SiteState::READY] as $which) {
            $gate = $this->gate($this->state($which));
            $this->computed = 0;
            $this->through($gate, '/api/me');
            self::assertSame(1, $this->computed, $which);
        }
    }

    public function testAnOpenPathThatIsNoRegularExpressionIsRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new SiteGate($this->state(SiteState::READY), new ResponseFactory(), ['~^/api/(unclosed~']);
    }

    /** A SiteState in the state named, counting how often it is asked. */
    private function state(string $which, bool $installed = false, bool $block = true): SiteState
    {
        $problem = function () use ($which): ?string {
            $this->computed++;

            return $which === SiteState::NOT_SET_UP ? 'config/database.local.php is missing.' : null;
        };

        $files = $which === SiteState::UPDATE_PENDING ? ['001_a.sql' => 'CREATE TABLE a (id int);'] : [];
        $set = $this->set('site' . ++$this->folders, $files);
        $migrator = function () use ($which, $set): Migrator {
            if ($which === SiteState::UNAVAILABLE) {
                throw new PDOException('SQLSTATE[08006] [7] connection to server failed');
            }

            return $this->migrator([$set]);
        };

        return new SiteState($problem, fn (): bool => $installed, $migrator, $block);
    }

    private function gate(SiteState $state): SiteGate
    {
        return new SiteGate($state, new ResponseFactory(), self::OPEN);
    }

    private function through(SiteGate $gate, string $path, string $method = 'GET'): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://site.example' . $path);

        return $gate->process($request, new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $response = (new ResponseFactory())->createResponse(200);
                $response->getBody()->write('passed');

                return $response;
            }
        });
    }

    /** @return array<string, mixed> */
    private function body(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
