<?php

declare(strict_types=1);

namespace Anotoki\Lib\Files;

use InvalidArgumentException;

/**
 * One folder the file explorer shows - named by the site:
 * `new FileRoot('assets', $path, label: 'Assets', write: true, extensions: [...], snapshot: true)`.
 *
 * Read only unless `write`; a written root takes only `extensions` (each one
 * the explorer knows the bytes of: UploadPolicy::FAMILIES, never one a server
 * or a browser could run), at most `maxBytes` a file, and gets its guard
 * .htaccess before the first write (`guard`). A root of many files (genshin's
 * 88,000) is listed from a `snapshot` taken by "Rescan" and kept in step by the
 * explorer's own writes; a small one is read as it is.
 */
final class FileRoot
{
    /** @var list<string> */
    public readonly array $extensions;

    /**
     * @param list<string> $extensions
     */
    public function __construct(
        public readonly string $name,
        public readonly string $path,
        public readonly string $label = '',
        public readonly bool $write = false,
        array $extensions = [],
        public readonly int $maxBytes = 50 * 1024 * 1024,
        public readonly bool $snapshot = false,
        public readonly bool $guard = true,
    ) {
        if (preg_match('/^[a-z][a-z0-9_-]{0,31}$/D', $name) !== 1 || in_array($name, ['raw', 'roots'], true)) {
            throw new InvalidArgumentException("A file root is named in small letters, digits, _ and - (and is not raw or roots): \"$name\" is not.");
        }
        $list = [];
        foreach ($extensions as $extension) {
            $extension = strtolower(ltrim((string) $extension, '.'));
            if (!isset(UploadPolicy::FAMILIES[$extension]) || in_array($extension, UploadPolicy::DENIED_PARTS, true)) {
                throw new InvalidArgumentException("The file explorer cannot take .$extension files: it knows the bytes of " . implode(', ', array_keys(UploadPolicy::FAMILIES)) . '.');
            }
            $list[] = $extension;
        }
        if ($write && $list === []) {
            throw new InvalidArgumentException("The root $name is written into: say which extensions it takes.");
        }
        if ($maxBytes < 1) {
            throw new InvalidArgumentException('A root\'s largest file must be at least a byte.');
        }
        $this->extensions = array_values(array_unique($list));
    }
}
