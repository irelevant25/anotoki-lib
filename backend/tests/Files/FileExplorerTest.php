<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Files;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Files\FileExplorer;
use Anotoki\Lib\Files\FileRoot;
use Anotoki\Lib\Files\Http\FilesRoutes;
use Anotoki\Lib\Support\Refusal;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

/** The file explorer: listing, uploading, moving, the trash, previews - and its routes. */
final class FileExplorerTest extends FilesTestCase
{
    public function testAFolderIsListedWithoutItsHiddenFilesOrLinks(): void
    {
        $listing = $this->explorer()->list('assets');

        self::assertIsArray($listing);
        self::assertSame(['characters'], array_column($listing['folders'], 'name'));
        self::assertSame([], $listing['files'], 'no .hidden.png');
        $inside = $this->explorer()->list('assets', 'characters');
        self::assertSame([['name' => 'raiden', 'path' => 'characters/raiden', 'files' => 1]], $inside['folders']);
        self::assertSame(['readme.txt'], array_column($inside['files'], 'name'));
        self::assertSame('text', $inside['files'][0]['preview']);
        self::assertMatchesRegularExpression('~^/api/admin/files/raw\?root=assets&path=characters%2Freadme\.txt&exp=\d+&sig=[A-Za-z0-9_-]{43}$~D', $inside['files'][0]['url']);
        $found = $this->explorer()->list('assets', '', 'shogun');
        self::assertSame(['characters/raiden/Raiden Shogun.png'], array_column($found['files'], 'path'));
        self::assertSame('search', $found['mode']);

        foreach (['..', '../assets-old', 'characters/../..', '/etc', 'nowhere', 'characters/readme.txt'] as $path) {
            self::assertSame('not_found', $this->explorer()->list('assets', $path)->code ?? null, $path);
        }
        self::assertSame('root_not_found', $this->explorer()->list('config')->code ?? null);
    }

    public function testAnUploadIsNamedCheckedAndGuarded(): void
    {
        $explorer = $this->explorer();
        $png = (string) base64_decode(self::PNG);
        self::assertFileDoesNotExist($this->assets . '/.htaccess');

        $result = $explorer->upload('assets', 'characters/raiden', [
            $this->upload('5.0 - Epitome.PNG', $png),
            $this->upload('shell.php.png', $png),
            $this->upload('page.png', '<html><script>alert(1)</script></html>'),
            $this->upload('.htaccess', 'SetHandler application/x-httpd-php'),
            $this->upload('huge.png', str_repeat('x', 1024 * 1024 + 1)),
            $this->upload('lost.png', '', UPLOAD_ERR_INI_SIZE),
            $this->upload('Raiden Shogun.png', $png),
        ]);

        self::assertIsArray($result);
        self::assertSame([1, 6], [$result['uploaded'], $result['refused']]);
        self::assertSame(
            [
                ['uploaded', '5-0 - Epitome.png'],
                ['refused', 'name_runs_on_server'],
                ['refused', 'content_mismatch'],
                ['refused', 'name_invalid'],
                ['refused', 'too_large'],
                ['refused', 'too_large'],
                ['refused', 'exists'],
            ],
            array_map(static fn(array $file): array => [$file['status'], $file['status'] === 'refused' ? $file['code'] : $file['stored_as']], $result['files']),
        );
        self::assertFileExists($this->assets . '/characters/raiden/5-0 - Epitome.png');
        self::assertFileDoesNotExist($this->assets . '/characters/raiden/shell.php.png');
        self::assertFileDoesNotExist($this->assets . '/characters/raiden/shell-php.png');
        self::assertStringStartsWith('# What is uploaded here is data', (string) file_get_contents($this->assets . '/.htaccess'), 'the guard comes before the first write');
        self::assertSame([['assets', 'upload', 'characters/raiden/5-0 - Epitome.png', null]], $this->written);
        self::assertSame([], glob($this->storage . '/cache/uploads/*.part') ?: [], 'nothing left on its way in');

        $replaced = $explorer->upload('assets', 'characters/raiden', [$this->upload('Raiden Shogun.png', $png)], replace: true);
        self::assertSame('replaced', $replaced['files'][0]['status']);
        self::assertSame('folder_not_found', $explorer->upload('assets', '../assets-old', [$this->upload('a.png', $png)])->code ?? null);
        self::assertSame('read_only', $explorer->upload('public', '', [$this->upload('a.png', $png)])->code ?? null);
    }

    public function testFoldersRenamesAndMoves(): void
    {
        $explorer = $this->explorer();

        self::assertSame(['path' => 'characters/zhongli'], $explorer->makeFolder('assets', 'characters/zhongli'));
        self::assertSame('exists', $explorer->makeFolder('assets', 'characters/zhongli')->code ?? null);
        self::assertSame('name_runs_on_server', $explorer->makeFolder('assets', 'characters/x.php')->code ?? null);
        self::assertSame('name_invalid', $explorer->makeFolder('assets', 'characters/.git')->code ?? null);
        self::assertSame('folder_not_found', $explorer->makeFolder('assets', 'nowhere/zhongli')->code ?? null);

        $renamed = $explorer->move('assets', 'characters/raiden/Raiden Shogun.png', 'characters/raiden/Raiden.v2.PNG');
        self::assertSame(['from' => 'characters/raiden/Raiden Shogun.png', 'to' => 'characters/raiden/Raiden-v2.png', 'op' => 'rename'], $renamed);
        self::assertSame('name_runs_on_server', $explorer->move('assets', 'characters/raiden/Raiden-v2.png', 'characters/raiden/x.php.png')->code ?? null);
        $moved = $explorer->move('assets', 'characters/raiden/Raiden-v2.png', 'characters/zhongli/Raiden-v2.png');
        self::assertSame('move', $moved['op'] ?? null);
        self::assertSame('into_itself', $explorer->move('assets', 'characters', 'characters/zhongli/characters')->code ?? null);
        self::assertSame('exists', $explorer->move('assets', 'characters/raiden', 'characters/zhongli')->code ?? null);
        self::assertSame('content_mismatch', $explorer->move('assets', 'characters/readme.txt', 'characters/readme.png')->code ?? null, 'a new extension only for bytes that are of it');
        self::assertSame('not_found', $explorer->move('assets', 'characters/../../config/secret.local.php', 'stolen.txt')->code ?? null);
        self::assertSame('not_found', $explorer->move('assets', 'characters/readme.txt', '../readme.txt')->code ?? null, 'no path out of the root');
        self::assertFileExists($this->assets . '/characters/zhongli/Raiden-v2.png');
        self::assertSame(['folder', 'rename', 'move'], array_column($this->written, 1));
    }

    public function testTheTrashKeepsWhatWasDeletedUntilItIsEmptied(): void
    {
        $explorer = $this->explorer();

        $deleted = $explorer->delete('assets', 'characters/raiden/Raiden Shogun.png');
        self::assertIsArray($deleted);
        self::assertMatchesRegularExpression('~^characters/raiden/\d{8}-\d{6}__Raiden Shogun\.png$~D', (string) $deleted['trashed']);
        self::assertFileDoesNotExist($this->assets . '/characters/raiden/Raiden Shogun.png');
        self::assertFileExists($this->storage . '/trash/.htaccess', 'the trash is guarded');
        $again = $explorer->delete('assets', 'characters/readme.txt');
        self::assertIsArray($again);

        $trash = $explorer->trash('assets');
        self::assertSame(['Raiden Shogun.png', 'readme.txt'], array_values(array_intersect(['Raiden Shogun.png', 'readme.txt'], array_column($trash, 'name'))));
        self::assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/D', (string) $trash[0]['deleted_at']);

        self::assertSame(['path' => 'characters/raiden/Raiden Shogun.png'], $explorer->restore('assets', (string) $deleted['trashed']));
        self::assertFileExists($this->assets . '/characters/raiden/Raiden Shogun.png');
        self::assertSame('not_found', $explorer->restore('assets', (string) $deleted['trashed'])->code ?? null, 'restored once');
        self::assertSame('not_found', $explorer->restore('assets', '../../config/secret.local.php')->code ?? null);

        // Something FTP put in the trash with a name a server would run: it stays there.
        file_put_contents($this->storage . '/trash/assets/20261008-101010__shell.php.png', 'x');
        self::assertSame('name_runs_on_server', $explorer->restore('assets', '20261008-101010__shell.php.png')->code ?? null);
        // A file of that name came back meanwhile: no restore over it.
        $third = $explorer->delete('assets', 'characters/raiden/Raiden Shogun.png');
        file_put_contents($this->assets . '/characters/raiden/Raiden Shogun.png', base64_decode(self::PNG));
        self::assertSame('exists', $explorer->restore('assets', (string) $third['trashed'])->code ?? null);
        // Its folder went: made again.
        $folderFile = $explorer->delete('assets', 'characters/raiden/Raiden Shogun.png');
        rmdir($this->assets . '/characters/raiden');
        self::assertSame(['path' => 'characters/raiden/Raiden Shogun.png'], $explorer->restore('assets', (string) $folderFile['trashed']));

        // One file at a time: only what the trash put there, never the folder's own index.html.
        self::assertSame('not_found', $explorer->emptyTrash('assets', 'index.html')->code ?? null);
        self::assertFileExists($this->storage . '/trash/assets/index.html');
        self::assertSame(['deleted' => 1, 'bytes' => strlen('Plain words.'), 'failed' => 0], $explorer->emptyTrash('assets', (string) $again['trashed']));
        $emptied = $explorer->emptyTrash('assets');
        self::assertSame([2, 0], [$emptied['deleted'], $emptied['failed']]);
        self::assertSame([], $explorer->trash('assets'));
        self::assertFileExists($this->storage . '/trash/assets/.htaccess', 'its own guard stays');

        mkdir($this->assets . '/empty');
        self::assertSame(['path' => 'empty', 'trashed' => null], $explorer->delete('assets', 'empty'));
        self::assertSame('folder_not_empty', $explorer->delete('assets', 'characters')->code ?? null);
        self::assertSame('read_only', $explorer->delete('public', 'secret.png')->code ?? null);
    }

    public function testASnapshotTellsWhatIsNewAndFollowsTheExplorersOwnWrites(): void
    {
        $roots = [new FileRoot('assets', $this->assets, write: true, extensions: ['png', 'txt'], snapshot: true)];
        $explorer = $this->explorer([], $roots);

        $before = $explorer->list('assets');
        self::assertNull($before['status']['scanned_at'], 'never scanned: nothing walked on a listing');
        self::assertSame(['scanned_at', 'previous_scanned_at', 'total', 'new_count'], array_keys($explorer->rescan('assets')));
        file_put_contents($this->assets . '/characters/by-ftp.png', base64_decode(self::PNG));
        $status = $explorer->rescan('assets');
        self::assertSame([3, 1], [$status['total'], $status['new_count']]);
        self::assertSame(['characters/by-ftp.png'], array_column($explorer->list('assets', '', '', 1, true)['files'], 'path'));

        $explorer->upload('assets', 'characters', [$this->upload('uploaded.png', (string) base64_decode(self::PNG))]);
        $explorer->move('assets', 'characters/readme.txt', 'characters/raiden/readme.txt');
        $explorer->makeFolder('assets', 'weapons');
        $listing = $explorer->list('assets', 'characters');
        self::assertSame(['by-ftp.png', 'uploaded.png'], array_column($listing['files'], 'name'));
        self::assertSame([['name' => 'raiden', 'path' => 'characters/raiden', 'files' => 2]], $listing['folders']);
        self::assertSame(['characters', 'weapons'], array_column($explorer->list('assets')['folders'], 'name'), 'an empty folder shows');
    }

    public function testAPreviewLinkIsSignedForMinutesAndServesOnlyPicturesSoundAndShortTextInline(): void
    {
        $explorer = $this->explorer();
        file_put_contents($this->assets . '/characters/by-ftp.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        file_put_contents($this->assets . '/characters/long.txt', str_repeat('a', 70000));
        $link = static function (string $url): array {
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

            return $query;
        };

        $png = $link($explorer->previewUrl('assets', 'characters/raiden/Raiden Shogun.png'));
        $file = $explorer->raw($png['root'], $png['path'], $png['exp'], $png['sig']);
        self::assertSame(['image/png', true], [$file['type'] ?? null, $file['inline'] ?? null]);
        self::assertNull($explorer->raw($png['root'], 'characters/readme.txt', $png['exp'], $png['sig']), 'another file');
        self::assertNull($explorer->raw($png['root'], $png['path'], (string) ((int) $png['exp'] + 1), $png['sig']), 'another time');
        self::assertNull($explorer->raw($png['root'], $png['path'], $png['exp'], strrev($png['sig'])));
        self::assertNull($explorer->raw('public', $png['path'], $png['exp'], $png['sig']), 'another root');
        $expired = (string) (time() - 1);
        self::assertNull($this->signedRaw($explorer, 'assets', 'characters/raiden/Raiden Shogun.png', $expired));

        $svg = $link($explorer->previewUrl('assets', 'characters/by-ftp.svg'));
        self::assertSame(
            ['application/octet-stream', false],
            array_values(array_intersect_key((array) $explorer->raw($svg['root'], $svg['path'], $svg['exp'], $svg['sig']), ['type' => 1, 'inline' => 1])),
            'an SVG only as a download',
        );
        $text = $link($explorer->previewUrl('assets', 'characters/readme.txt'));
        self::assertSame('text/plain; charset=utf-8', $explorer->raw($text['root'], $text['path'], $text['exp'], $text['sig'])['type'] ?? null);
        $long = $link($explorer->previewUrl('assets', 'characters/long.txt'));
        self::assertFalse($explorer->raw($long['root'], $long['path'], $long['exp'], $long['sig'])['inline'] ?? null, 'a long text is a download');
        $traversal = $link($explorer->previewUrl('assets', '../config/secret.local.php'));
        self::assertNull($explorer->raw($traversal['root'], $traversal['path'], $traversal['exp'], $traversal['sig']), 'signed or not, the guard refuses it');
    }

    public function testARootIsTheSitesDataNeverItsCodeItsSecretsOrTheLibrarysStorage(): void
    {
        foreach (
            [
                'the site itself, with its config/*.local.php' => $this->base,
                'the config folder' => $this->base . '/config',
            ]
            as $why => $path
        ) {
            try {
                new FileRoot('site', $path);
                self::fail("$why taken as a root");
            } catch (\InvalidArgumentException $e) {
                self::assertStringContainsString('the site\'s own files', $e->getMessage(), $why);
            }
        }
        mkdir($this->base . '/backend/vendor/slim', 0777, true);
        mkdir($this->base . '/keys', 0777, true);
        file_put_contents($this->base . '/keys/anotoki-lib.key', str_repeat('0', 64) . "\n");
        foreach (['its vendor folder' => $this->base . '/backend', 'the library\'s key' => $this->base . '/keys'] as $why => $path) {
            try {
                new FileRoot('site', $path);
                self::fail("$why taken as a root");
            } catch (\InvalidArgumentException) {
                self::assertTrue(true, $why);
            }
        }

        foreach (['the storage folder' => $this->storage, 'inside it' => $this->storage . '/trash', 'around it' => $this->base . '/around'] as $why => $path) {
            if ($why === 'around it') {
                mkdir($path . '/storage', 0777, true);
                $storage = $path . '/storage';
            } else {
                @mkdir($path, 0777, true);
                $storage = $this->storage;
            }
            try {
                new \Anotoki\Lib\Files\FileExplorer([new FileRoot('data', $path)], ['storage' => $storage, 'key' => str_repeat('k', 32)]);
                self::fail("a root $why taken");
            } catch (\InvalidArgumentException $e) {
                self::assertStringContainsString('storage folder', $e->getMessage(), $why);
            }
        }
        self::assertSame(['assets', 'public'], array_column($this->explorer()->roots(), 'name'), 'a site\'s data folders are taken as before');
    }

    public function testAnUploadLeftOnItsWayInGoesAnHourLater(): void
    {
        $incoming = $this->storage . '/cache/uploads';
        mkdir($incoming, 0777, true);
        file_put_contents($old = $incoming . '/' . str_repeat('a', 24) . '.part', 'left by a timeout');
        touch($old, time() - 3700);
        file_put_contents($fresh = $incoming . '/' . str_repeat('b', 24) . '.part', 'on its way in now');
        file_put_contents($other = $incoming . '/notes.txt', 'not the explorer\'s');
        touch($other, time() - 3700);

        $this->explorer()->upload('assets', 'characters', [$this->upload('Fresh.png', (string) base64_decode(self::PNG))]);

        self::assertFileDoesNotExist($old);
        self::assertFileExists($fresh, 'one younger than an hour may be another upload\'s');
        self::assertFileExists($other, 'only the explorer\'s own names');
    }

    public function testMountedInsideGroupsUnderABasePathThePreviewLinkNamesTheRawRouteWhereItIs(): void
    {
        $explorer = $this->explorer();
        $context = $this->context();
        $app = AppFactory::create();
        $app->setBasePath('/site');
        $app->group('/api/admin', function ($admin) use ($explorer, $context): void {
            FilesRoutes::admin($admin, '/files', $explorer, $context);
        });
        $app->group('/api/media', function ($media) use ($explorer, $context): void {
            FilesRoutes::raw($media, '/raw', $explorer, $context);
        });

        $url = $this->json($this->send($app, 'GET', '/site/api/admin/files/assets?path=characters%2Fraiden'))['files'][0]['url'];
        self::assertStringStartsWith('/site/api/media/raw?', $url, 'the groups\' prefixes and the base path, all');
        self::assertSame((string) base64_decode(self::PNG), (string) $this->send($app, 'GET', $url, admin: false)->getBody());
    }

    public function testTheRoutesForTheAdminAndTheSignedPreview(): void
    {
        $app = $this->app();

        // Nothing of the site's on the group: its own check refuses a bare request, and anybody but the ADMIN.
        $bare = $this->send($app, 'GET', '/api/admin/files/roots', admin: false);
        self::assertSame([401, 'sign_in_required'], [$bare->getStatusCode(), $this->json($bare)['code']]);
        $other = $this->send($app, 'DELETE', '/api/admin/files/assets?path=characters%2Freadme.txt', admin: false, headers: ['X-Test-Admin' => 'no']);
        self::assertSame([403, 'forbidden'], [$other->getStatusCode(), $this->json($other)['code']]);
        self::assertFileExists($this->assets . '/characters/readme.txt');
        self::assertSame(['assets', 'public'], array_column($this->json($this->send($app, 'GET', '/api/admin/files/roots'))['roots'], 'name'));
        self::assertSame(404, $this->send($app, 'GET', '/api/admin/files/assets?path=%2e%2e%2Fassets-old')->getStatusCode(), '%2e%2e arrives as ..');
        self::assertSame(['characters'], array_column($this->json($this->send($app, 'GET', '/api/admin/files/assets'))['folders'], 'name'));

        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', 'https://site.example/api/admin/files/assets/upload')
            ->withParsedBody(['path' => 'characters', 'replace' => '0'])
            ->withUploadedFiles(['files' => [$this->upload('New.png', (string) base64_decode(self::PNG)), $this->upload('x.php.png', 'x')]])
            ->withHeader('X-Test-Admin', 'yes');
        $uploaded = $this->json($app->handle($request));
        self::assertSame([1, 1], [$uploaded['uploaded'], $uploaded['refused']]);
        self::assertSame([['file.uploaded', 'file', 'assets:characters/New.png']], $this->audited);

        self::assertSame(201, $this->send($app, 'POST', '/api/admin/files/assets/folder', '{"path":"weapons"}')->getStatusCode());
        self::assertSame(
            'file.renamed',
            $this->json($this->send($app, 'POST', '/api/admin/files/assets/move', '{"from":"characters/New.png","to":"characters/Newer.png"}'))['op'] === 'rename' ? $this->audited[2][0] : null,
        );
        $deleted = $this->json($this->send($app, 'DELETE', '/api/admin/files/assets?path=characters%2FNewer.png'));
        self::assertNotNull($deleted['trashed']);
        self::assertCount(1, $this->json($this->send($app, 'GET', '/api/admin/files/assets/trash'))['items']);
        self::assertSame(['path' => 'characters/Newer.png'], $this->json($this->send($app, 'POST', '/api/admin/files/assets/trash/restore', '{"trashed":"' . $deleted['trashed'] . '"}')));
        self::assertSame(['folder.created', 'file.renamed', 'file.deleted', 'file.restored'], array_slice(array_column($this->audited, 0), 1));

        // The preview: outside the admin check, its signature the check.
        $listing = $this->json($this->send($app, 'GET', '/api/admin/files/assets?path=characters%2Fraiden'));
        $url = $listing['files'][0]['url'];
        $preview = $this->send($app, 'GET', $url, admin: false);
        self::assertSame(200, $preview->getStatusCode());
        self::assertSame((string) base64_decode(self::PNG), (string) $preview->getBody());
        self::assertSame(
            ['image/png', "sandbox; default-src 'none'", 'nosniff', 'same-origin', 'private, no-store', 'bytes'],
            [
                $preview->getHeaderLine('Content-Type'),
                $preview->getHeaderLine('Content-Security-Policy'),
                $preview->getHeaderLine('X-Content-Type-Options'),
                $preview->getHeaderLine('Cross-Origin-Resource-Policy'),
                $preview->getHeaderLine('Cache-Control'),
                $preview->getHeaderLine('Accept-Ranges'),
            ],
        );
        self::assertStringStartsWith('inline; filename="Raiden Shogun.png"', $preview->getHeaderLine('Content-Disposition'));
        $range = $this->send($app, 'GET', $url, admin: false, headers: ['Range' => 'bytes=0-7']);
        self::assertSame(
            [206, 'bytes 0-7/' . strlen((string) base64_decode(self::PNG)), "\x89PNG\r\n\x1a\n"],
            [$range->getStatusCode(), $range->getHeaderLine('Content-Range'), (string) $range->getBody()],
        );
        $altered = str_replace('raiden%2FRaiden', 'raiden%2FRaiden%20', $url);
        self::assertSame(404, $this->send($app, 'GET', $altered, admin: false)->getStatusCode());
        self::assertSame("sandbox; default-src 'none'", $this->send($app, 'GET', $altered, admin: false)->getHeaderLine('Content-Security-Policy'));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** @var list<array{string, ?string, ?string}> */
    private array $audited = [];

    /** X-Test-Admin: yes is the site's ADMIN (7); any other value somebody else (9); none, nobody. */
    private function context(): AdminContext
    {
        return new AdminContext(
            static fn(ServerRequestInterface $request): ?int => $request->hasHeader('X-Test-Admin') ? ($request->getHeaderLine('X-Test-Admin') === 'yes' ? 7 : 9) : null,
            isAdmin: static fn(ServerRequestInterface $request): bool => $request->getHeaderLine('X-Test-Admin') === 'yes',
        );
    }

    private function app(): App
    {
        $explorer = $this->explorer();
        $context = $this->context();
        $app = AppFactory::create();
        $audit = new class ($this) implements \Anotoki\Lib\Audit\AuditRecorder {
            public function __construct(private readonly FileExplorerTest $test) {}

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
                $this->test->audit($action, $targetType, $targetId === null ? null : (string) $targetId);
            }
        };
        FilesRoutes::admin($app, '/api/admin/files', $explorer, $context, $audit);
        FilesRoutes::raw($app, '/api/admin/files/raw', $explorer, $context);

        return $app;
    }

    /** @internal for the test's AuditLog */
    public function audit(string $action, ?string $type, ?string $id): void
    {
        $this->audited[] = [$action, $type, $id];
    }

    /** @param array<string, string> $headers */
    private function send(App $app, string $method, string $target, string $body = '', bool $admin = true, array $headers = []): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://site.example' . $target);
        $query = [];
        foreach (explode('&', (string) parse_url($target, PHP_URL_QUERY)) as $pair) {
            if ($pair !== '') {
                [$name, $value] = array_pad(explode('=', $pair, 2), 2, '');
                $query[rawurldecode($name)] = rawurldecode($value);
            }
        }
        $request = $request->withQueryParams($query)->withBody((new StreamFactory())->createStream($body));
        if ($body !== '') {
            $request = $request->withHeader('Content-Type', 'application/json');
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($admin ? $request->withHeader('X-Test-Admin', 'yes') : $request);
    }

    private function signedRaw(FileExplorer $explorer, string $root, string $path, string $expires): ?array
    {
        $signature = rtrim(strtr(base64_encode(hash_hmac('sha256', $root . "\n" . $path . "\n" . $expires, str_repeat('k', 32), true)), '+/', '-_'), '=');

        return $explorer->raw($root, $path, $expires, $signature);
    }

    /** @return array<mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
