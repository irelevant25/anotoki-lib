<?php

declare(strict_types=1);

namespace Anotoki\Lib\Admin;

use Anotoki\Lib\Support\JsonResponse;
use Anotoki\Lib\Support\Refusal;
use Closure;
use InvalidArgumentException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Throwable;

/**
 * What the library's admin tools need to know of the site they run in, given
 * once as closures - the site's own answers, never the library's guesses:
 *
 * - actorId(request): who is acting - the person's id from the session (the
 *   IAM) or the token (the sites: the IAM's sub), never from a body; null for
 *   nobody;
 * - proof(request, body): the proof a dangerous action asks for - a backup
 *   downloaded, made, deleted or restored. Null when it is given; otherwise the
 *   refusal ({status, code, error}, a Refusal, or false). The IAM:
 *   accountProof() (the password, or a sign-in of the last 15 minutes); the
 *   sites: recentSignIn() below (the token's auth_time, ten minutes);
 * - proofKind(request): 'password' or 'recent_sign_in' - which one the page
 *   asks for (a password field, or "Sign in again");
 * - clientKey(request): the address a request comes from as the site counts
 *   it for its limits - the trusted proxy's header from a trusted proxy, its
 *   IPv6 /64 - never X-Forwarded-For believed from anybody. Default: the
 *   connection's REMOTE_ADDR, which behind Cloudflare is the edge's (a bucket
 *   shared by strangers: stricter, never looser);
 * - error(response, refusal): the site's error body. Default: the library's
 *   {code, message, ...extra}.
 *
 * The admin checks themselves - ADMIN, the IAM's session and CSRF header - are
 * the site's middleware on each route group the library returns.
 */
final class AdminContext
{
    public const PROOF_PASSWORD = 'password';
    public const PROOF_RECENT_SIGN_IN = 'recent_sign_in';

    /**
     * @param Closure(ServerRequestInterface): (int|string|null) $actorId
     * @param null|Closure(ServerRequestInterface, array<string, mixed>): mixed $proof  null when proven (or an array
     *        with `proof`, the IAM's accountProof() success), else {status, code, error|message} or a Refusal
     * @param string|Closure(ServerRequestInterface): string $proofKind  'password' or 'recent_sign_in'
     * @param null|Closure(ServerRequestInterface): string $clientKey
     * @param null|Closure(ResponseInterface, Refusal): ResponseInterface $error
     */
    public function __construct(
        private readonly Closure $actorId,
        private readonly ?Closure $proof = null,
        private readonly string|Closure $proofKind = self::PROOF_RECENT_SIGN_IN,
        private readonly ?Closure $clientKey = null,
        private readonly ?Closure $error = null,
    ) {
        if (is_string($proofKind) && !in_array($proofKind, [self::PROOF_PASSWORD, self::PROOF_RECENT_SIGN_IN], true)) {
            throw new InvalidArgumentException("The proof is 'password' or 'recent_sign_in', not \"$proofKind\".");
        }
    }

    /**
     * A proof for a site that judges people by the IAM's token: a sign-in of the
     * last $seconds (ten minutes), from the token's auth_time; otherwise
     * 403 reauth_required - the page offers "Sign in again" (the SDK's
     * signIn({prompt: 'login'})).
     *
     * @param Closure(ServerRequestInterface): ?int $authTime  the token's auth_time (Unix seconds), null when it has none
     * @return Closure(ServerRequestInterface, array<string, mixed>): ?Refusal
     */
    public static function recentSignIn(Closure $authTime, int $seconds = 600): Closure
    {
        return static function (ServerRequestInterface $request) use ($authTime, $seconds): ?Refusal {
            $at = $authTime($request);
            if (is_int($at) && $at >= time() - $seconds && $at <= time() + 60) {
                return null;
            }

            return new Refusal(403, 'reauth_required', 'This needs a sign-in of the last ' . intdiv($seconds, 60) . ' minutes. Sign in again, then try once more.');
        };
    }

    /** Who is acting: the site's answer, or null when it has none (or fails). */
    public function actorId(ServerRequestInterface $request): int|string|null
    {
        try {
            $actor = ($this->actorId)($request);
        } catch (Throwable) {
            return null;
        }

        return is_int($actor) || (is_string($actor) && $actor !== '') ? $actor : null;
    }

    /** 'password' or 'recent_sign_in': which proof the page asks for. */
    public function proofKind(ServerRequestInterface $request): string
    {
        $kind = is_string($this->proofKind) ? $this->proofKind : ($this->proofKind)($request);

        return $kind === self::PROOF_PASSWORD ? self::PROOF_PASSWORD : self::PROOF_RECENT_SIGN_IN;
    }

    /**
     * Null when the request carries the proof; otherwise why not. A site that
     * gave no proof has none to give: refused, never waved through.
     *
     * @param array<string, mixed> $body
     */
    public function proof(ServerRequestInterface $request, array $body): ?Refusal
    {
        if ($this->proof === null) {
            return new Refusal(403, 'proof_unavailable', 'This site has not said how its administrators prove who they are, so this cannot be done here.');
        }

        $answer = ($this->proof)($request, $body);

        return match (true) {
            $answer === null, $answer === true => null,
            $answer instanceof Refusal => $answer,
            is_array($answer) && isset($answer['proof']) && !isset($answer['status']) => null,
            is_array($answer) && is_int($answer['status'] ?? null) => new Refusal(
                $answer['status'],
                is_string($answer['code'] ?? null) ? $answer['code'] : 'proof_failed',
                is_string($answer['error'] ?? null) ? $answer['error'] : (is_string($answer['message'] ?? null) ? $answer['message'] : 'That did not prove who you are.'),
            ),
            default => new Refusal(403, 'proof_failed', 'That did not prove who you are.'),
        };
    }

    /** The address bucket the site's limits count for this request. */
    public function clientKey(ServerRequestInterface $request): string
    {
        if ($this->clientKey !== null) {
            try {
                $key = ($this->clientKey)($request);
                if (is_string($key) && $key !== '') {
                    return $key;
                }
            } catch (Throwable) {
                // The connection's own address below.
            }
        }
        $address = $request->getServerParams()['REMOTE_ADDR'] ?? '';

        return is_string($address) && $address !== '' ? $address : '?';
    }

    /** The refusal as the site answers one. */
    public function refuse(ResponseInterface $response, Refusal $refusal): ResponseInterface
    {
        $response = $this->error !== null
            ? ($this->error)($response, $refusal)
            : JsonResponse::write($response, $refusal->status, $refusal->body());
        if ($refusal->status === 503 && !$response->hasHeader('Retry-After')) {
            $response = $response->withHeader('Retry-After', '60');
        }
        if ($refusal->status === 429 && is_int($refusal->extra['retry_after'] ?? null) && !$response->hasHeader('Retry-After')) {
            $response = $response->withHeader('Retry-After', (string) $refusal->extra['retry_after']);
        }

        return $response->hasHeader('Cache-Control') ? $response : $response->withHeader('Cache-Control', 'no-store');
    }
}
