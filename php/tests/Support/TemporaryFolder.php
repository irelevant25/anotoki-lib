<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Support;

/**
 * A folder of the test's own in the system's temporary folder, removed after
 * it (a test case that needs no database uses this; DatabaseTestCase has its own).
 */
trait TemporaryFolder
{
    /** @var list<string> */
    private array $temporaryFolders = [];

    /** A new empty folder (its real path, with / separators). */
    protected function temporaryFolder(): string
    {
        $folder = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'anotoki_lib_test_' . bin2hex(random_bytes(6));
        mkdir($folder, 0777, true);
        $real = str_replace('\\', '/', (string) realpath($folder));
        $this->temporaryFolders[] = $real;

        return $real;
    }

    protected function removeTemporaryFolders(): void
    {
        foreach ($this->temporaryFolders as $folder) {
            self::removeFolder($folder);
        }
        $this->temporaryFolders = [];
    }

    protected static function removeFolder(string $path): void
    {
        // A link - or a Windows junction, which PHP may take for neither a link nor a folder, and whose real path
        // is its target's (or none, once the target went) - is removed itself, never walked into.
        $real = realpath($path);
        if (is_link($path) || (PHP_OS_FAMILY === 'Windows' && !is_file($path) && ($real === false || str_replace('\\', '/', $real) !== str_replace('\\', '/', $path)))) {
            if (!@rmdir($path)) {
                @unlink($path);
            }

            return;
        }
        if (is_file($path)) {
            @unlink($path);

            return;
        }
        if (!is_dir($path)) {
            return;
        }
        foreach (scandir($path) ?: [] as $entry) {
            if ($entry !== '.' && $entry !== '..') {
                self::removeFolder($path . '/' . $entry);
            }
        }
        @rmdir($path);
    }
}
