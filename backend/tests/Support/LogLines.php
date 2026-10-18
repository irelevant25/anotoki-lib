<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Support;

/**
 * What the library said to the error log during the tests (the bootstrap
 * sends Anotoki\Lib\Support\Log here): read by the tests that expect a line,
 * and kept out of the test run's own output.
 */
final class LogLines
{
    /** @var list<string> */
    public static array $lines = [];

    /** The lines said since the last take(), and forgets them. @return list<string> */
    public static function take(): array
    {
        $lines = self::$lines;
        self::$lines = [];

        return $lines;
    }
}
