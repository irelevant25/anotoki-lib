<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Files;

use Anotoki\Lib\Files\FileRoot;
use Anotoki\Lib\Files\PathGuard;
use Anotoki\Lib\Files\UploadPolicy;
use Anotoki\Lib\Support\Refusal;
use InvalidArgumentException;

/**
 * The explorer's rules, each with the attack it stops. (The attacks' payloads are
 * harmless and put together as the test runs: a virus scanner takes a file that
 * spells out a real web shell away.)
 */
final class PathAndUploadRulesTest extends FilesTestCase
{
    /** @return iterable<string, array{string}> */
    public static function refusedPaths(): iterable
    {
        yield 'up' => ['..'];
        yield 'up inside' => ['characters/../../config/secret.local.php'];
        yield 'here' => ['./characters'];
        yield 'absolute' => ['/etc/passwd'];
        yield 'a drive' => ['C:/Windows/win.ini'];
        yield 'a Windows stream' => ['characters/raiden.png::$DATA'];
        yield 'a backslash' => ['characters\\..\\..\\config'];
        yield 'NUL' => ["characters/raiden.png\0.txt"];
        yield 'a newline' => ["characters\nraiden"];
        yield 'a dot-file' => ['.htaccess'];
        yield 'a dot-folder' => ['characters/.git/config'];
        yield 'a trailing dot' => ['characters/name.png.'];
        yield 'a trailing space' => ['characters/name.png '];
        yield 'a leading space' => [' characters'];
        yield 'an empty part' => ['characters//raiden'];
        yield 'a trailing slash' => ['characters/'];
        yield 'no name on Windows' => ['what?.png'];
        yield 'a pipe' => ['a|b'];
        yield 'too long a part' => [str_repeat('a', 256)];
        yield 'too long in all' => [implode('/', array_fill(0, 206, 'abcd'))];
        yield 'no UTF-8' => ["caf\xE9"];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('refusedPaths')]
    public function testAPathThatCouldLeaveTheRootIsRefused(string $path): void
    {
        self::assertNull(PathGuard::relative($path));
    }

    public function testAPlainPathIsTakenInNfc(): void
    {
        self::assertSame('', PathGuard::relative(''));
        self::assertSame('characters/raiden/Raiden Shogun.png', PathGuard::relative('characters/raiden/Raiden Shogun.png'));
        self::assertSame('php.png', PathGuard::relative('php.png'));
        self::assertSame(implode('/', array_fill(0, 205, 'abcd')), PathGuard::relative(implode('/', array_fill(0, 205, 'abcd'))), '1024 bytes in all');
        if (class_exists(\Normalizer::class)) {
            self::assertSame("\u{17E}", PathGuard::relative("z\u{30C}"), 'one way of writing a name');
        }
    }

    public function testResolvingWalksOnlyTheRootsOwnFolders(): void
    {
        $root = (string) PathGuard::root($this->assets);

        self::assertSame($root . '/characters/raiden/Raiden Shogun.png', PathGuard::resolve($root, 'characters/raiden/Raiden Shogun.png'));
        self::assertNull(PathGuard::resolve($root, 'characters/raiden/missing.png'));
        self::assertSame($root . '/characters/raiden/new.png', PathGuard::resolve($root, 'characters/raiden/new.png', mustExist: false));
        self::assertNull(PathGuard::resolve($root, 'nowhere/new.png', mustExist: false), 'its folder must be there');
        self::assertNull(PathGuard::resolve($root, 'characters/readme.txt/x', mustExist: false), 'a file is no folder');
        self::assertFalse(PathGuard::inside($this->base . '/assets-old/secret.png', $root), 'a sibling whose name begins like the root\'s');
        self::assertTrue(PathGuard::inside($root . '/x', $root));
        self::assertFalse(PathGuard::inside($root, $root));
        self::assertTrue(PathGuard::inside($root, $root, orRoot: true));
        self::assertNull(PathGuard::root($this->base . '/nowhere'));
        if (PHP_OS_FAMILY === 'Windows') {
            self::assertNull(PathGuard::resolve($root, 'Characters/raiden'), 'another case of a name is another name');
        }
    }

    public function testALinkOutOfTheRootIsNeverFollowed(): void
    {
        $root = (string) PathGuard::root($this->assets);
        if (!$this->linkFolder($this->base . '/config', $this->assets . '/characters/config-link')) {
            self::markTestSkipped('This system lets this process make neither a symbolic link nor a junction.');
        }

        self::assertNull(PathGuard::resolve($root, 'characters/config-link'));
        self::assertNull(PathGuard::resolve($root, 'characters/config-link/secret.local.php'));
        self::assertNull(PathGuard::resolve($root, 'characters/config-link/new.png', mustExist: false), 'nothing written through it either');
        self::assertNotContains('config-link', array_column($this->explorer()->list('assets', 'characters')['folders'], 'name'), 'listing passes it by');
        self::assertSame('not_found', $this->explorer()->list('assets', 'characters/config-link')->code ?? null);
        self::assertSame('folder_not_found', $this->explorer()->upload('assets', 'characters/config-link', [$this->upload('a.png', (string) base64_decode(self::PNG))])->code ?? null);
    }

    /** @return iterable<string, array{string, bool}> */
    public static function scriptNames(): iterable
    {
        yield 'a double extension' => ['shell.php.png', true];
        yield 'in capitals' => ['shell.PHP.png', true];
        yield 'phtml' => ['a.phtml.jpg', true];
        yield 'phar' => ['a.phar', true];
        yield '.htaccess' => ['.htaccess', true];
        yield '.user.ini' => ['.user.ini', true];
        yield 'index.php' => ['index.php', true];
        yield 'markup a browser runs' => ['x.svg.png', true];
        yield 'a script a browser runs' => ['x.js.png', true];
        yield 'html' => ['page.html', true];
        yield 'a picture called php' => ['php.png', false];
        yield 'a picture' => ['Raiden Shogun.png', false];
        yield 'a dotted title' => ['5.0 - Epitome.png', false];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('scriptNames')]
    public function testANameAServerCouldRunIsKnown(string $name, bool $runs): void
    {
        self::assertSame($runs, UploadPolicy::runsOnServer($name));
    }

    public function testAnUploadKeepsOneExtensionOfItsRootsList(): void
    {
        $root = new FileRoot('assets', $this->assets, write: true, extensions: ['png', 'jpg']);
        $code = static fn (string|Refusal $name): string => $name instanceof Refusal ? $name->code : $name;

        self::assertSame('5-0 - Epitome Invocation.png', $code(UploadPolicy::storedName('5.0 - Epitome Invocation.PNG', $root)), 'one extension, small; every other dot a dash');
        self::assertSame('name_runs_on_server', $code(UploadPolicy::storedName('shell.php.png', $root)));
        self::assertSame('name_runs_on_server', $code(UploadPolicy::storedName('index.php', $root)));
        self::assertSame('name_invalid', $code(UploadPolicy::storedName('.htaccess', $root)));
        self::assertSame('name_invalid', $code(UploadPolicy::storedName('.user.ini', $root)));
        self::assertSame('name_invalid', $code(UploadPolicy::storedName('../x.png', $root)));
        self::assertSame('name_invalid', $code(UploadPolicy::storedName('C:\\x.png', $root)));
        self::assertSame('name_invalid', $code(UploadPolicy::storedName('x.png.', $root)));
        self::assertSame('extension_not_allowed', $code(UploadPolicy::storedName('x.gif', $root)));
        self::assertSame('extension_not_allowed', $code(UploadPolicy::storedName('README', $root)));
        self::assertSame('Raiden.png', $code(UploadPolicy::newName('Raiden.png', $root, false)));
        self::assertSame('voice-overs', $code(UploadPolicy::newName('voice-overs', $root, true)));
        self::assertSame('name_runs_on_server', $code(UploadPolicy::newName('cgi.php', $root, true)), 'no folder named so either');
    }

    public function testTheBytesMustBeWhatTheNameSays(): void
    {
        $base = $this->base;
        $check = static function (string $content, string $extension) use ($base): ?string {
            // A file of its own each time: a virus scanner may hold the last one a moment.
            $file = $base . '/probe-' . bin2hex(random_bytes(4));
            file_put_contents($file, $content);

            return UploadPolicy::contentRefusal($file, $extension)?->code;
        };
        $png = (string) base64_decode(self::PNG);
        $open = '<' . '?';

        self::assertNull($check($png, 'png'));
        self::assertSame('content_mismatch', $check('<html><body><script>void 0</script></body></html>', 'png'), 'an HTML page named .png');
        self::assertSame('content_mismatch', $check("GIF89a\x01\x00\x01\x00\x80\x00\x00<script>void 0</script>", 'gif'), 'a GIF that carries a script');
        self::assertSame('content_mismatch', $check($png, 'jpg'), 'a PNG named .jpg');
        self::assertSame('content_mismatch', $check($open . 'php echo 1;', 'jpg'), 'PHP code named .jpg');
        self::assertSame('content_mismatch', $check('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'png'), 'SVG named .png');
        self::assertNull($check('OggS' . str_repeat("\0", 60), 'ogg'));
        self::assertNull($check('ID3' . str_repeat("\0", 60), 'mp3'));
        self::assertSame('content_mismatch', $check('ID3', 'ogg'));
        self::assertNull($check("Plain words, žltý kôň.\n", 'txt'));
        self::assertSame('content_mismatch', $check("text\0with a NUL", 'txt'));
        self::assertSame('content_mismatch', $check("caf\xE9", 'txt'));
        self::assertNull($check("%PDF-1.7\n", 'pdf'));
        self::assertSame('content_mismatch', $check('', 'png'));
    }

    public function testTheGuardHoldsOnlyRulesThatCannotTakeTheFolderDown(): void
    {
        $folder = $this->base . '/uploads';
        mkdir($folder);

        self::assertTrue(UploadPolicy::ensureGuard($folder));
        $rules = array_values(array_filter(
            preg_split('/\R/', (string) file_get_contents($folder . '/.htaccess')) ?: [],
            static fn (string $line): bool => $line !== '' && $line[0] !== '#'
        ));
        self::assertSame([
            'RemoveHandler .php .phtml .phar .pht .php3 .php4 .php5 .php6 .php7 .php8 .phps .cgi .pl .py .sh .asp .aspx .jsp .shtml',
            'RemoveType .php .phtml .phar .pht .php3 .php4 .php5 .php6 .php7 .php8 .phps .cgi .pl .py .sh .asp .aspx .jsp .shtml',
        ], $rules, 'genshin\'s rules word for word: never php_flag, Options or Require');

        file_put_contents($folder . '/.htaccess', "# the site's own\n");
        self::assertTrue(UploadPolicy::ensureGuard($folder));
        self::assertSame("# the site's own\n", file_get_contents($folder . '/.htaccess'), 'never written over');
        self::assertFalse(UploadPolicy::ensureGuard($this->base . '/nowhere'));
    }

    public function testARootTakesOnlyWhatTheExplorerKnowsTheBytesOf(): void
    {
        foreach ([['svg'], ['php'], ['html'], ['exe']] as $extensions) {
            try {
                new FileRoot('assets', $this->assets, write: true, extensions: $extensions);
                self::fail(implode(',', $extensions) . ' was taken');
            } catch (InvalidArgumentException) {
                // refused
            }
        }
        foreach (['raw', 'roots', 'Assets', '../x', ''] as $name) {
            try {
                new FileRoot($name, $this->assets);
                self::fail("the name $name was taken");
            } catch (InvalidArgumentException) {
                // refused
            }
        }
        $this->expectException(InvalidArgumentException::class);
        new FileRoot('assets', $this->assets, write: true);
    }
}
