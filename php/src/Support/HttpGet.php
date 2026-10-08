<?php

declare(strict_types=1);

namespace Anotoki\Lib\Support;

/**
 * A GET with a timeout, for what the library asks the IAM: its key set, whether
 * a site requires signing in, the accounts it deleted. By curl when there is
 * curl, else by PHP's own streams. Redirects are never followed - the IAM
 * answers its public routes itself, and a redirect is a proxy's page or a
 * misconfigured issuer, which is no answer.
 *
 * The status says what happened: the answer's HTTP status, or 0 when there was
 * no answer at all (unreachable, timed out, refused, larger than MAX_BYTES) -
 * which is how a caller tells "the IAM said no" (a 404) from "the IAM is not
 * there".
 */
final class HttpGet
{
    /** The most an answer may hold: the library's answers are a few kilobytes (at most 500 ids a page). */
    public const MAX_BYTES = 4 * 1024 * 1024;

    /**
     * @param list<string> $headers
     * @return array{status: int, body: ?string}  the body of any answer; null with status 0
     */
    public static function fetch(string $url, float $timeout, array $headers = ['Accept: application/json']): array
    {
        $timeout = max(0.1, $timeout);

        if (function_exists('curl_init')) {
            return self::byCurl($url, $timeout, $headers);
        }

        return self::byStream($url, $timeout, $headers);
    }

    /**
     * @param list<string> $headers
     * @return array{status: int, body: ?string}
     */
    private static function byCurl(string $url, float $timeout, array $headers): array
    {
        $handle = curl_init($url);
        if ($handle === false) {
            return ['status' => 0, 'body' => null];
        }

        $body = '';
        $tooLarge = false;
        curl_setopt_array($handle, [
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT_MS => (int) ceil($timeout * 1000),
            CURLOPT_TIMEOUT_MS => (int) ceil($timeout * 1000),
            CURLOPT_HTTPHEADER => $headers,
            // Read in pieces and stop past the limit: an answer is never kept whole when it is too large.
            CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body, &$tooLarge): int {
                if (strlen($body) + strlen($chunk) > self::MAX_BYTES) {
                    $tooLarge = true;

                    return 0;
                }
                $body .= $chunk;

                return strlen($chunk);
            },
        ]);
        $done = curl_exec($handle);
        $status = $done === false || $tooLarge ? 0 : (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        // No curl_close(): the handle goes with the variable, the call has done nothing since PHP 8.0,
        // and PHP 8.5 deprecates it.

        return $status === 0 ? ['status' => 0, 'body' => null] : ['status' => $status, 'body' => $body];
    }

    /**
     * fopen() rather than file_get_contents(), so the status line comes from the stream itself: the
     * variable file_get_contents() fills in for it is deprecated in PHP 8.5.
     *
     * @param list<string> $headers
     * @return array{status: int, body: ?string}
     */
    private static function byStream(string $url, float $timeout, array $headers): array
    {
        $context = stream_context_create(['http' => [
            'timeout' => $timeout,
            'ignore_errors' => true,
            'follow_location' => 0,
            'header' => implode("\r\n", $headers) . "\r\n",
        ]]);
        $stream = @fopen($url, 'rb', false, $context);
        if ($stream === false) {
            return ['status' => 0, 'body' => null];
        }

        $meta = stream_get_meta_data($stream);
        $body = stream_get_contents($stream, self::MAX_BYTES + 1);
        fclose($stream);

        $lines = is_array($meta['wrapper_data'] ?? null) ? $meta['wrapper_data'] : [];
        $status = preg_match('#^HTTP/\S+\s+(\d{3})\b#', (string) ($lines[0] ?? ''), $match) === 1 ? (int) $match[1] : 0;

        if (!is_string($body) || strlen($body) > self::MAX_BYTES || $status === 0) {
            return ['status' => 0, 'body' => null];
        }

        return ['status' => $status, 'body' => $body];
    }
}
