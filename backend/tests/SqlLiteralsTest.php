<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests;

use FilesystemIterator;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * No SQL the library writes holds a backslash before a quote. Before PHP 8.4, PDO reads the SQL it prepares
 * by MySQL's rule: it takes \' inside a quoted literal for an escaped quote, so the literal seems to run on
 * and the placeholders after it are missed (SQLSTATE[HY093]) - 0.4.0's `ESCAPE '\'` clauses on PHP 8.2.
 * Whether a query breaks depends on what follows the literal, so this reads every string of the library's
 * code instead, on every PHP.
 */
final class SqlLiteralsTest extends TestCase
{
    public function testTheRuleCatchesWhatBroke(): void
    {
        $broke = <<<'PHP'
        "action LIKE ? ESCAPE '\\'"
        PHP;
        $fixed = <<<'PHP'
        'action LIKE ?'
        PHP;
        $quotesEscapedForPhp = <<<'PHP'
        'SELECT 1 WHERE a.attgenerated <> \'\''
        PHP;
        $backslashesForCopy = <<<'PHP'
        'SELECT \\\\N'
        PHP;

        self::assertTrue(self::misread($broke), '0.4.0\'s clause');
        self::assertFalse(self::misread($fixed));
        self::assertFalse(self::misread($quotesEscapedForPhp), 'a quote PHP escapes is no backslash in the SQL');
        self::assertFalse(self::misread($backslashesForCopy), 'backslashes before no quote');
    }

    public function testNoSqlOfTheLibraryHasABackslashBeforeAQuote(): void
    {
        $root = dirname(__DIR__);
        $found = [];
        $read = 0;
        foreach (['src', 'testing'] as $folder) {
            $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root . '/' . $folder, FilesystemIterator::SKIP_DOTS));
            foreach ($files as $file) {
                if ($file->getExtension() !== 'php') {
                    continue;
                }
                $read++;
                foreach (token_get_all((string) file_get_contents($file->getPathname())) as $token) {
                    if (is_array($token) && in_array($token[0], [T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE], true) && self::misread($token[1], $token[0] === T_ENCAPSED_AND_WHITESPACE)) {
                        $found[] = $folder . substr(str_replace('\\', '/', $file->getPathname()), strlen(str_replace('\\', '/', $root . '/' . $folder))) . ':' . $token[2];
                    }
                }
            }
        }

        self::assertGreaterThan(50, $read, 'the library\'s code was read');
        self::assertSame([], $found);
    }

    /**
     * Whether a PHP string literal (as written in the code) is SQL with a quote after an odd run of backslashes:
     * what PDO's SQL reading before PHP 8.4 takes for an escaped quote.
     *
     * @param bool $part  a part of an interpolated (double-quoted or heredoc) string, without its quotes
     */
    private static function misread(string $literal, bool $part = false): bool
    {
        if ($part) {
            $value = self::doubleQuoted($literal);
        } else {
            $literal = ltrim($literal, 'bB');
            $body = substr($literal, 1, -1);
            $value = $literal[0] === "'" ? strtr($body, ['\\\\' => '\\', "\\'" => "'"]) : self::doubleQuoted($body);
        }
        if (preg_match('/\b(?:SELECT|INSERT|UPDATE|DELETE|WHERE|LIKE|ILIKE|ESCAPE|VALUES)\b/', $value) !== 1) {
            return false;
        }
        $backslash = '\\\\';

        return preg_match('/(?<!' . $backslash . ')(?:' . $backslash . $backslash . ')*' . $backslash . "'/", $value) === 1;
    }

    /** The value of a double-quoted string's body, as far as backslashes and quotes go. */
    private static function doubleQuoted(string $body): string
    {
        return strtr($body, ['\\\\' => '\\', '\\"' => '"', '\\$' => '$']);
    }
}
