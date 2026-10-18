<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\ErrorLog;

use Anotoki\Lib\Tests\Support\TemporaryFolder;
use PHPUnit\Framework\TestCase;

/**
 * PHP's own errors - warnings, notices, a fatal error - in a PHP process of
 * their own, as a site's request would meet them: PHPUnit's error handler is
 * not there to catch them first.
 */
final class PhpErrorsTest extends TestCase
{
    use TemporaryFolder;

    private const SCRIPT = <<<'PHP'
<?php
declare(strict_types=1);
require $argv[1];
$log = new Anotoki\Lib\ErrorLog\ErrorLog($argv[2], ['key' => str_repeat('k', 32), 'root' => $argv[3]]);
switch ($argv[4]) {
    case 'warnings':
        $log->installPhpHandlers();
        for ($i = 0; $i < 100; $i++) {
            $list = [];
            $missing = $list['missing'];
        }
        $quiet = @file_get_contents($argv[3] . '/no/such/file');
        trigger_error('An old way of doing it', E_USER_DEPRECATED);
        echo "done\n";
        break;
    case 'site-handler':
        // A site that turns warnings into exceptions (the survey, Piano Academy), its handler set first.
        set_error_handler(static function (int $type, string $message, string $file, int $line): bool {
            throw new ErrorException($message, 0, $type, $file, $line);
        });
        $log->installPhpHandlers();
        try {
            $list = [];
            $missing = $list['missing'];
        } catch (ErrorException $e) {
            echo "caught\n";
            $log->record($e, null, 500);
        }
        break;
    case 'fatal':
        $log->installPhpHandlers();
        ini_set('memory_limit', '16M');
        $secret = 'FATAL-SECRET-ARGUMENT';
        $big = str_repeat('x', 64 * 1024 * 1024);
        echo "never\n";
        break;
}
PHP;

    protected function tearDown(): void
    {
        $this->removeTemporaryFolders();
    }

    public function testAWarningInALoopIsOneLineAndWhatAtSilencesIsNone(): void
    {
        [$output, $lines] = $this->runChild('warnings');

        self::assertStringContainsString('done', $output, 'PHP\'s own handling went on (the handler answers false)');
        self::assertCount(2, $lines, 'one warning (of a hundred), one deprecation, nothing of the silenced one');
        self::assertSame(['php', 'warning', 'E_WARNING', 'Undefined array key "missing"', 0], [$lines[0]['source'], $lines[0]['level'], $lines[0]['type'], $lines[0]['message'], $lines[0]['status']]);
        self::assertSame(['notice', 'E_USER_DEPRECATED', 'An old way of doing it'], [$lines[1]['level'], $lines[1]['type'], $lines[1]['message']]);
        self::assertStringStartsWith('ErrorLog_child_', basename((string) $lines[0]['file']));
    }

    public function testASitesHandlerThatThrowsStillRunsAndItsExceptionIsTheLine(): void
    {
        [$output, $lines] = $this->runChild('site-handler');

        self::assertStringContainsString('caught', $output);
        self::assertCount(1, $lines);
        self::assertSame(['server', 'ErrorException', 'Undefined array key "missing"'], [$lines[0]['source'], $lines[0]['type'], $lines[0]['message']]);
    }

    public function testAFatalErrorIsWrittenDown(): void
    {
        [$output, $lines] = $this->runChild('fatal');

        self::assertStringNotContainsString('never', $output);
        self::assertCount(1, $lines);
        self::assertSame(['php', 'error', 500, 'E_ERROR'], [$lines[0]['source'], $lines[0]['level'], $lines[0]['status'], $lines[0]['type']]);
        self::assertStringStartsWith('Allowed memory size of 16777216 bytes exhausted', $lines[0]['message']);
        self::assertStringNotContainsString('FATAL-SECRET', (string) json_encode($lines));
    }

    /** @return array{string, list<array<string, mixed>>} what the process printed, and the log's lines */
    private function runChild(string $mode): array
    {
        $folder = $this->temporaryFolder();
        $script = $folder . '/ErrorLog_child_' . $mode . '.php';
        file_put_contents($script, self::SCRIPT);
        $logs = $folder . '/logs';
        $process = proc_open(
            [PHP_BINARY, '-d', 'display_errors=stderr', $script, dirname(__DIR__, 3) . '/vendor/autoload.php', $logs, $folder, $mode],
            // Files, not pipes: a full pipe the parent does not read would stop the child for good.
            [1 => ['file', $folder . '/out.txt', 'w'], 2 => ['file', $folder . '/err.txt', 'w']],
            $pipes
        );
        self::assertIsResource($process);
        proc_close($process);
        $output = (string) file_get_contents($folder . '/out.txt') . (string) file_get_contents($folder . '/err.txt');

        $lines = [];
        foreach (glob($logs . '/errors-*.jsonl') ?: [] as $file) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $lines[] = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
            }
        }

        return [$output, $lines];
    }
}
