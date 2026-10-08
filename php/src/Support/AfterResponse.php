<?php

declare(strict_types=1);

namespace Anotoki\Lib\Support;

use Throwable;

/**
 * Work for after the answer has gone - a clean-up, the scrub of the IAM's
 * deleted accounts - so nobody waits for it. The hosting has no cron: ordinary
 * traffic carries such work, a request at a time.
 *
 * run() sends the answer first - PHP-FPM and LiteSpeed close the connection
 * (fastcgi_finish_request(), litespeed_finish_request()); elsewhere (Apache's
 * mod_php, php -S) the answer is flushed and the browser waits that moment
 * longer - then does each piece on its own: a failure is said in the log, never
 * reaches the answer, nor stops the next piece. A visitor who goes away
 * meanwhile stops nothing (ignore_user_abort).
 *
 * A site calls run() after its app has answered ($app->run(); AfterResponse::run();),
 * and if it does not, the work runs at the end of the request all the same (a
 * shutdown function, registered on the first add()). On the command line -
 * tests, a site's own tools - nothing is registered, and nothing is flushed:
 * whoever added the work runs it.
 */
final class AfterResponse
{
    /** @var list<callable(): mixed> */
    private static array $work = [];

    private static bool $registered = false;

    public static function add(callable $work): void
    {
        self::$work[] = $work;

        if (!self::$registered && PHP_SAPI !== 'cli') {
            self::$registered = true;
            register_shutdown_function([self::class, 'run']);
        }
    }

    /** Sends the answer, then does the work waiting, each piece on its own. */
    public static function run(): void
    {
        if (self::$work === []) {
            return;
        }

        if (PHP_SAPI !== 'cli') {
            ignore_user_abort(true);
            if (function_exists('fastcgi_finish_request')) {
                fastcgi_finish_request();
            } elseif (function_exists('litespeed_finish_request')) {
                litespeed_finish_request();
            } else {
                while (ob_get_level() > 0) {
                    @ob_end_flush();
                }
                flush();
            }
        }

        while (($work = array_shift(self::$work)) !== null) {
            try {
                $work();
            } catch (Throwable $e) {
                Log::say('[anotoki] after the answer: ' . get_class($e) . ': ' . $e->getMessage());
            }
        }
    }

    /** How many pieces wait. */
    public static function pending(): int
    {
        return count(self::$work);
    }

    /** Forgets the work waiting (a test that does not want it done). */
    public static function clear(): void
    {
        self::$work = [];
    }
}
