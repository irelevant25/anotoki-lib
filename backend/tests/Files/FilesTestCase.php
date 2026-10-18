<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Files;

use Anotoki\Lib\Files\FileExplorer;
use Anotoki\Lib\Files\FileRoot;
use Anotoki\Lib\Tests\Support\TemporaryFolder;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\UploadedFile;

/**
 * A site's folders for the explorer's tests: a written root `assets`, a
 * sibling beside it whose name begins like it (`assets-old`), the site's
 * secrets one level up, and the storage folder.
 */
abstract class FilesTestCase extends TestCase
{
    use TemporaryFolder;

    /** A real PNG, one pixel. */
    protected const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    protected string $base;
    protected string $assets;
    protected string $storage;

    /** @var list<array{string, string, string, ?string}> what afterWrite was told */
    protected array $written = [];

    protected function setUp(): void
    {
        $this->base = $this->temporaryFolder();
        $this->assets = $this->base . '/assets';
        $this->storage = $this->base . '/storage';
        mkdir($this->assets . '/characters/raiden', 0777, true);
        mkdir($this->base . '/assets-old', 0777, true);
        mkdir($this->base . '/config', 0777, true);
        mkdir($this->storage, 0777, true);
        file_put_contents($this->base . '/assets-old/secret.png', base64_decode(self::PNG));
        file_put_contents($this->base . '/config/secret.local.php', "<?php return ['key' => 'SECRET'];");
        file_put_contents($this->assets . '/characters/raiden/Raiden Shogun.png', base64_decode(self::PNG));
        file_put_contents($this->assets . '/characters/readme.txt', 'Plain words.');
        file_put_contents($this->assets . '/.hidden.png', base64_decode(self::PNG));
    }

    protected function tearDown(): void
    {
        $this->removeTemporaryFolders();
    }

    /** @param array<string, mixed> $options */
    protected function explorer(array $options = [], ?array $roots = null): FileExplorer
    {
        return new FileExplorer(
            $roots ?? [
                new FileRoot('assets', $this->assets, label: 'Assets', write: true, extensions: ['png', 'jpg', 'gif', 'ogg', 'mp3', 'txt', 'pdf'], maxBytes: 1024 * 1024),
                new FileRoot('public', $this->base . '/assets-old', label: 'Old'),
            ],
            $options + [
                'storage' => $this->storage,
                'key' => str_repeat('k', 32),
                'afterWrite' => function (string $root, string $op, string $path, ?string $from): void {
                    $this->written[] = [$root, $op, $path, $from];
                },
            ],
        );
    }

    /** An upload as PHP hands it over: a temporary file and the name the browser sent. */
    protected function upload(string $clientName, string $content, int $error = UPLOAD_ERR_OK): UploadedFile
    {
        $temporary = $this->base . '/upload-' . bin2hex(random_bytes(6));
        file_put_contents($temporary, $content);

        return new UploadedFile($temporary, $clientName, 'application/octet-stream', strlen($content), $error);
    }

    /**
     * A link from $link to the folder $target: a symbolic link where the system lets this process make one,
     * else (Windows) a junction. False when neither can be made.
     */
    protected function linkFolder(string $target, string $link): bool
    {
        if (@symlink($target, $link)) {
            return true;
        }
        if (PHP_OS_FAMILY !== 'Windows') {
            return false;
        }
        exec('mklink /J ' . escapeshellarg(str_replace('/', '\\', $link)) . ' ' . escapeshellarg(str_replace('/', '\\', $target)) . ' 2>NUL', $output, $code);

        return $code === 0 && is_dir($link);
    }
}
