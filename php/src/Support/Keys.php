<?php

declare(strict_types=1);

namespace Anotoki\Lib\Support;

use InvalidArgumentException;
use RuntimeException;

/**
 * The keys the library's modules use - each derived for one purpose, so that
 * no two purposes ever share a key, and a key of one never opens another.
 *
 * - derive(): HKDF-SHA256 of a site's secret (the IAM's master key, genshin's
 *   appSecret()), with the info "anotoki-lib/<purpose>/v1". The IAM's backups
 *   take derive(iamMasterKey(), 'iam-backup').
 * - installation(): for a site without a secret of its own - 32 random bytes
 *   made once in storage/anotoki-lib.key and kept there. It keys the HMACs
 *   that must not be reproducible from outside (the error log's client hashes,
 *   the feedback limits' buckets, signed preview links, the backups' seal); it
 *   lives on the same server as what it protects, so it never encrypts
 *   anything. It is as safe as the storage folder, and no safer: whoever can
 *   write that folder can delete the key and make one of their own (no read of
 *   the old one needed) - as they can the IAM's key set kept there, which tokens
 *   are checked with. It keeps out whoever cannot write the folder.
 */
final class Keys
{
    /** The file installation() keeps its key in, under the storage folder it is given. */
    public const INSTALLATION_FILE = 'anotoki-lib.key';

    /**
     * 32 bytes for one purpose: hash_hkdf('sha256', $secret, 32, "anotoki-lib/$purpose/v1", $salt).
     *
     * @param string $purpose small letters, digits and dashes ('iam-backup', 'error-log')
     */
    public static function derive(string $secret, string $purpose, string $salt = ''): string
    {
        if ($secret === '') {
            throw new InvalidArgumentException('A key is derived from a secret: this one is empty.');
        }
        if (preg_match('/^[a-z0-9][a-z0-9-]{0,62}$/D', $purpose) !== 1) {
            throw new InvalidArgumentException("A key's purpose is small letters, digits and dashes: \"$purpose\" is not.");
        }

        return hash_hkdf('sha256', $secret, 32, 'anotoki-lib/' . $purpose . '/v1', $salt);
    }

    /**
     * This installation's own key, 32 bytes: read from $storageDir/anotoki-lib.key,
     * made there the first time (one process makes it; every other reads the same:
     * make()). The folder gets a deny-all guard if it has none (GuardedDirectory).
     *
     * @throws RuntimeException when the key can be neither read nor made
     */
    public static function installation(string $storageDir): string
    {
        $storageDir = rtrim($storageDir, '/\\');
        $file = $storageDir . '/' . self::INSTALLATION_FILE;

        for ($attempt = 0; $attempt < 20; $attempt++) {
            $key = self::readKey($file);
            if ($key !== null) {
                return $key;
            }

            // An empty file a process of 0.4.x left behind when it died before writing (it made the file first,
            // then wrote it): nobody ever read a key from it.
            clearstatcache(true, $file);
            if (is_file($file) && filesize($file) === 0 && filemtime($file) < time() - 10) {
                @unlink($file);
            }

            if (!file_exists($file)) {
                // The folder that keeps the key is never served: its guard, where it has none (never over the site's).
                GuardedDirectory::ensure($storageDir);
                if (!self::make($storageDir, $file)) {
                    break;
                }
                continue;
            }
            // Being written this moment by a process of 0.4.x: read it again shortly.
            usleep(10_000);
        }

        throw new RuntimeException('The installation key ' . self::INSTALLATION_FILE . ' in the storage folder can be neither read nor made.');
    }

    /**
     * A new key, written whole into a file of its own - the site's own user's alone from its creation
     * (AtomicFile::aside(): tempnam(), 0600), so no handle opened before a chmod reads it - then linked into
     * place: link() makes the key file only where there is none, so of two processes making it at one moment one
     * key becomes it and the other process reads that one. Where the folder takes no hard link (or link() is
     * switched off), it is renamed into place where none is yet - two at one moment may each rename theirs, and
     * both read again the one that stayed. False when it cannot be written here at all.
     */
    private static function make(string $storageDir, string $file): bool
    {
        $temporary = AtomicFile::aside($storageDir);
        if ($temporary === null) {
            return false;
        }
        try {
            $made = bin2hex(random_bytes(32)) . "\n";
            if (@file_put_contents($temporary, $made) !== strlen($made)) {
                return false;
            }
            if (function_exists('link') && @link($temporary, $file)) {
                return true;
            }
            clearstatcache(true, $file);

            // Another process's came first (it is read), or no hard link here.
            return file_exists($file) || @rename($temporary, $file);
        } finally {
            @unlink($temporary);
        }
    }

    private static function readKey(string $file): ?string
    {
        $handle = @fopen($file, 'r');
        if ($handle === false) {
            return null;
        }
        $locked = flock($handle, LOCK_SH);
        $text = stream_get_contents($handle);
        if ($locked) {
            flock($handle, LOCK_UN);
        }
        fclose($handle);

        $text = is_string($text) ? trim($text) : '';

        return preg_match('/^[0-9a-f]{64}$/D', $text) === 1 ? (string) hex2bin($text) : null;
    }
}
