<?php

declare(strict_types=1);

namespace Anotoki\Lib\Admin\Http;

use Anotoki\Lib\Support\JsonBody;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Support\Utf8;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Handlers\Strategies\RequestResponse;
use Slim\Interfaces\RouteInterface;

/**
 * What the admin tools' route helpers share. Internal to the library.
 *
 * @internal
 */
final class Routes
{
    /** The route's handler gets ($request, $response), whatever the app's default invocation strategy. */
    public static function plain(RouteInterface $route): RouteInterface
    {
        return $route->setInvocationStrategy(new RequestResponse());
    }

    /**
     * A request's JSON object as an array - read from the raw stream (Support\JsonBody), at most $limit
     * bytes. With $optional, nothing at all is an empty object (a POST that carries only a password where
     * the site asks for one, say, carries nothing elsewhere). Anything but an object: 422 invalid_body.
     *
     * @return array<string, mixed>|Refusal
     */
    public static function body(ServerRequestInterface $request, int $limit, bool $optional = false): array|Refusal
    {
        if ($optional) {
            $stream = $request->getBody();
            $size = $stream->getSize();
            $declared = trim($request->getHeaderLine('Content-Length'));
            if ($declared === '0' || ($declared === '' && $size === 0)) {
                return [];
            }
            if ($size !== null && $size <= $limit) {
                if ($stream->isSeekable()) {
                    $stream->rewind();
                }
                if (trim($stream->getContents()) === '') {
                    return [];
                }
            }
        }

        $body = JsonBody::read($request, $limit);
        if ($body instanceof Refusal) {
            return $body;
        }
        $map = JsonBody::map($body);
        if ($map === null) {
            return Refusal::invalid('invalid_body', 'Send a JSON object.');
        }
        $fields = [];
        foreach ($map as $key => $value) {
            $fields[(string) $key] = self::plainValue($value);
        }

        return $fields;
    }

    /** A positive whole number from a query parameter, or $default. */
    public static function int(mixed $value, int $default, int $min = 1, int $max = PHP_INT_MAX): int
    {
        if (is_int($value)) {
            return max($min, min($max, $value));
        }
        if (is_string($value) && preg_match('/^\d{1,9}$/D', $value) === 1) {
            return max($min, min($max, (int) $value));
        }

        return $default;
    }

    /** A query parameter as a string, '' for anything else (an array a crafted query makes of it, say). */
    public static function text(mixed $value, int $limit = 200): string
    {
        return is_string($value) ? Utf8::prefix(trim($value), $limit) : '';
    }

    /** JSON objects inside a body as arrays, lists as lists - so the modules read one kind of value. */
    private static function plainValue(mixed $value): mixed
    {
        if ($value instanceof \stdClass) {
            $out = [];
            foreach (get_object_vars($value) as $key => $inner) {
                $out[(string) $key] = self::plainValue($inner);
            }

            return $out;
        }
        if (is_array($value)) {
            return array_map(self::plainValue(...), $value);
        }

        return $value;
    }
}
