<?php

declare(strict_types=1);

namespace Anotoki\Lib\Support;

/**
 * A file written whole or not at all: written aside under a name of its own,
 * then renamed into place - so a reader never sees half of it, and two
 * requests writing the same file never write into one copy. Renaming is
 * retried for a moment, as Windows can hold a fresh file briefly (Japanese
 * Academy's file_put_atomic()).
 */
final class AtomicFile
{
    /**
     * Writes $content to $path. With $exclusive, a file already at $path is
     * left as it is (and false answered). With $mode (0600 for what is the
     * site's alone), the file has it before a byte of it is written - never
     * readable by anybody else for a moment under the umask's 0644. Never
     * throws, never warns.
     */
    public static function write(string $path, string $content, bool $exclusive = false, ?int $mode = null): bool
    {
        if ($exclusive && file_exists($path)) {
            return false;
        }

        try {
            $temporary = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
        } catch (\Throwable) {
            return false;
        }
        // Made new and empty ('x'), its mode set, then written.
        $handle = @fopen($temporary, 'xb');
        if ($handle === false) {
            return false;
        }
        if ($mode !== null) {
            @chmod($temporary, $mode);
        }
        $written = @fwrite($handle, $content);
        $closed = @fclose($handle);
        if ($written !== strlen($content) || !$closed) {
            @unlink($temporary);

            return false;
        }

        for ($attempt = 0; $attempt < 8; $attempt++) {
            if ($exclusive && file_exists($path)) {
                @unlink($temporary);

                return false;
            }
            if (@rename($temporary, $path)) {
                return true;
            }
            usleep(25_000 * ($attempt + 1));
        }
        @unlink($temporary);

        return false;
    }
}
