<?php

declare(strict_types=1);

namespace Anotoki\Lib\Support;

use Closure;
use Throwable;

/**
 * Work that belongs to a request but not to its answer - a daily backup, a
 * prune - done after the answer: the family's runner (genshin's and Piano
 * Academy's after_response.php, the build analyzer's App\Web\AfterResponse),
 * for a site that has none of its own (the IAM).
 *
 * The site queues work with defer() while it handles a request (the modules
 * take `defer: $after->defer(...)`), and calls run() once its answer is
 * written - after Slim's $app->run(). PHP-FPM and LiteSpeed close the
 * connection first (fastcgi_finish_request(), litespeed_finish_request());
 * where PHP cannot (mod_php, PHP's built-in server) the answer is flushed and
 * the work runs before the script ends, so the person waits a little longer. A
 * browser that goes away meanwhile does not stop it (ignore_user_abort()).
 * Each piece runs on its own: a failure is reported (to $onError, or PHP's
 * error_log as "[after] ...") and never stops the next piece. Work queued by a
 * piece runs too.
 *
 * One runner a request: shared() is the process's own, for code that has no
 * other way to reach it.
 */
final class AfterResponse
{
    private static ?self $shared = null;

    /** @var list<callable(): mixed> */
    private array $queue = [];

    public static function shared(): self
    {
        return self::$shared ??= new self();
    }

    /** Queues $work for after this request's answer. */
    public function defer(callable $work): void
    {
        // From here on a browser that leaves does not stop the script: the work runs whether or not anybody reads.
        self::keepRunning();
        $this->queue[] = $work;
    }

    /** How many pieces wait. */
    public function pending(): int
    {
        return count($this->queue);
    }

    /**
     * Ends the answer (where PHP can), then runs every piece, each on its own.
     *
     * @param null|Closure(Throwable): void $onError  told of each piece that failed; default: error_log()
     * @param bool $finish  false keeps the connection (the tests, a command line)
     */
    public function run(?Closure $onError = null, bool $finish = true): void
    {
        if ($this->queue === []) {
            return;
        }
        self::keepRunning();
        if ($finish && PHP_SAPI !== 'cli') {
            self::finishRequest();
        }

        // A piece may queue more; a runaway loop of them is cut off.
        for ($round = 0; $this->queue !== [] && $round < 100; $round++) {
            $work = $this->queue;
            $this->queue = [];
            foreach ($work as $piece) {
                try {
                    $piece();
                } catch (Throwable $e) {
                    try {
                        if ($onError !== null) {
                            $onError($e);
                        } else {
                            error_log('[after] ' . get_class($e) . ': ' . Redactor::text($e->getMessage()));
                        }
                    } catch (Throwable) {
                        // A reporter that fails is no reason to stop the next piece.
                    }
                }
            }
        }
        $this->queue = [];
    }

    /** A browser that leaves does not stop the script - where the host has not disabled the function (PHP 8 removes a disabled one). */
    public static function keepRunning(): void
    {
        if (function_exists('ignore_user_abort')) {
            @ignore_user_abort(true);
        }
    }

    /** As long as the host allows: a disabled set_time_limit() is removed by PHP 8, an ini may forbid it. */
    public static function allowSeconds(int $seconds): void
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit($seconds);
        }
    }

    private static function finishRequest(): void
    {
        if (function_exists('fastcgi_finish_request')) {
            @fastcgi_finish_request();

            return;
        }
        if (function_exists('litespeed_finish_request')) {
            @litespeed_finish_request();

            return;
        }
        while (ob_get_level() > 0) {
            @ob_end_flush();
        }
        @flush();
    }
}
