<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Support;

/** A temporary folder of the test's own, made on first use and removed after the test. */
trait TempFolder
{
    private ?string $tempFolder = null;

    protected function folder(string $relative = ''): string
    {
        if ($this->tempFolder === null) {
            $this->tempFolder = str_replace('\\', '/', sys_get_temp_dir()) . '/anotoki_lib_test_' . bin2hex(random_bytes(6));
            mkdir($this->tempFolder, 0700, true);
        }
        $path = $relative === '' ? $this->tempFolder : $this->tempFolder . '/' . $relative;
        if ($relative !== '' && !str_contains(basename($relative), '.') && !is_dir($path)) {
            mkdir($path, 0700, true);
        }

        return $path;
    }

    protected function removeFolder(): void
    {
        if ($this->tempFolder !== null) {
            self::removeTreeAt($this->tempFolder);
            $this->tempFolder = null;
        }
    }

    private static function removeTreeAt(string $path): void
    {
        if (!file_exists($path)) {
            return;
        }
        if (is_dir($path) && !is_link($path)) {
            foreach (scandir($path) ?: [] as $entry) {
                if ($entry !== '.' && $entry !== '..') {
                    self::removeTreeAt($path . '/' . $entry);
                }
            }
            @rmdir($path);

            return;
        }
        @unlink($path);
    }
}
