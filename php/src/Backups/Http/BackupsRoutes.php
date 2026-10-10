<?php

declare(strict_types=1);

namespace Anotoki\Lib\Backups\Http;

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Admin\Http\FileStreams;
use Anotoki\Lib\Admin\Http\Routes;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Support\JsonResponse;
use Anotoki\Lib\Support\Refusal;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\StreamFactoryInterface;
use Slim\Interfaces\RouteCollectorProxyInterface;
use Slim\Interfaces\RouteGroupInterface;
use Slim\Interfaces\RouteInterface;

/**
 * The backups' routes, on the site's Slim app.
 *
 * admin() - for the site's ADMIN alone (the site's check on the returned group;
 * the IAM's CSRF header on its writes, as on every first-party write):
 *   GET    $base                    {backups: [... restorable], status}
 *   GET    $base/proof              {kind: password | recent_sign_in} - what the page asks for
 *   POST   $base                    {description?, password?} -> 201 {backup}        the proof; audited
 *   GET    $base/{id}               {backup} (with its tables)
 *   DELETE $base/{id}               {password?} -> {deleted: true}                   the proof; audited
 *   POST   $base/{id}/ticket        {password?} -> {url, expires_in: 60}             the proof; audited backup.downloaded
 *   GET    $base/{id}/preview       Backups::preview()
 *   POST   $base/{id}/restore       {confirm: the id's last 6 characters, password?} the proof; audited
 *
 * file() - the download itself, OUTSIDE the admin check: a browser's navigation
 * sends no Bearer header, so the single-use ticket is the check.
 *   GET    $base/{id}/file?ticket=  the archive, as an attachment; 403 ticket_invalid
 *
 * Open while an update waits (no table needed; a backup just before Apply is
 * the point), but never restore: openPaths($base) in the site's gate.
 */
final class BackupsRoutes
{
    public static function admin(RouteCollectorProxyInterface $app, string $base, Backups $backups, AdminContext $context): RouteGroupInterface
    {
        $prefix = $app->getBasePath() . $base;

        return $app->group($base, function (RouteCollectorProxyInterface $group) use ($backups, $context, $prefix): void {
            $id = '/{id:' . Backups::ID_PATTERN . '}';

            Routes::plain($group->get('', function (ServerRequestInterface $request, ResponseInterface $response) use ($backups): ResponseInterface {
                $status = $backups->status();
                $list = $backups->list();
                foreach ($list as $index => $backup) {
                    $list[$index]['restorable'] = $status['restorable'] && is_array($status['schema'])
                        && ($backup['schema']['migrations_sha256'] ?? null) === $status['schema']['migrations_sha256']
                        && ($backup['schema']['columns_sha256'] ?? null) === $status['schema']['columns_sha256'];
                    unset($list[$index]['schema']);
                }

                return JsonResponse::write($response, 200, ['backups' => $list, 'status' => $status]);
            }));

            Routes::plain($group->get('/proof', function (ServerRequestInterface $request, ResponseInterface $response) use ($context): ResponseInterface {
                return JsonResponse::write($response, 200, ['kind' => $context->proofKind($request)]);
            }));

            Routes::plain($group->post('', function (ServerRequestInterface $request, ResponseInterface $response) use ($backups, $context): ResponseInterface {
                $body = Routes::body($request, 8192, optional: true);
                if ($body instanceof Refusal) {
                    return $context->refuse($response, $body);
                }
                $proof = $context->proof($request, $body);
                if ($proof !== null) {
                    return $context->refuse($response, $proof);
                }
                $description = is_string($body['description'] ?? null) ? $body['description'] : null;
                $backup = $backups->create(Backups::MANUAL, $description, $context->actorId($request), $request);
                if ($backup instanceof Refusal) {
                    return $context->refuse($response, $backup);
                }

                return JsonResponse::write($response, 201, ['backup' => self::shown($backup)]);
            }));

            Routes::plain($group->get($id, function (ServerRequestInterface $request, ResponseInterface $response) use ($backups, $context): ResponseInterface {
                $backup = $backups->get((string) $request->getAttribute('id'));
                if ($backup === null) {
                    return $context->refuse($response, new Refusal(404, 'not_found', 'There is no such backup.'));
                }

                return JsonResponse::write($response, 200, ['backup' => $backup]);
            }));

            Routes::plain($group->delete($id, function (ServerRequestInterface $request, ResponseInterface $response) use ($backups, $context): ResponseInterface {
                $body = Routes::body($request, 4096, optional: true);
                if ($body instanceof Refusal) {
                    return $context->refuse($response, $body);
                }
                if ($backups->get((string) $request->getAttribute('id')) === null) {
                    return $context->refuse($response, new Refusal(404, 'not_found', 'There is no such backup.'));
                }
                $proof = $context->proof($request, $body);
                if ($proof !== null) {
                    return $context->refuse($response, $proof);
                }
                $deleted = $backups->delete((string) $request->getAttribute('id'), $context->actorId($request), $request);
                if ($deleted instanceof Refusal) {
                    return $context->refuse($response, $deleted);
                }

                return JsonResponse::write($response, 200, ['deleted' => true]);
            }));

            Routes::plain($group->post($id . '/ticket', function (ServerRequestInterface $request, ResponseInterface $response) use ($backups, $context, $prefix): ResponseInterface {
                $body = Routes::body($request, 4096, optional: true);
                if ($body instanceof Refusal) {
                    return $context->refuse($response, $body);
                }
                $backupId = (string) $request->getAttribute('id');
                if ($backups->get($backupId) === null) {
                    return $context->refuse($response, new Refusal(404, 'not_found', 'There is no such backup.'));
                }
                $proof = $context->proof($request, $body);
                if ($proof !== null) {
                    return $context->refuse($response, $proof);
                }
                $ticket = $backups->ticket($backupId, $context->actorId($request), $request);
                if ($ticket instanceof Refusal) {
                    return $context->refuse($response, $ticket);
                }

                return JsonResponse::write($response, 200, [
                    'url' => $prefix . '/' . $backupId . '/file?ticket=' . rawurlencode($ticket['ticket']),
                    'expires_in' => $ticket['expires_in'],
                ]);
            }));

            Routes::plain($group->get($id . '/preview', function (ServerRequestInterface $request, ResponseInterface $response) use ($backups, $context): ResponseInterface {
                $preview = $backups->preview((string) $request->getAttribute('id'));
                if ($preview instanceof Refusal) {
                    return $context->refuse($response, $preview);
                }

                return JsonResponse::write($response, 200, $preview);
            }));

            Routes::plain($group->post($id . '/restore', function (ServerRequestInterface $request, ResponseInterface $response) use ($backups, $context): ResponseInterface {
                if (!$backups->restoreEnabled()) {
                    return $context->refuse($response, new Refusal(403, 'restore_disabled', 'Restoring a backup is switched off on this site.'));
                }
                $body = Routes::body($request, 4096);
                if ($body instanceof Refusal) {
                    return $context->refuse($response, $body);
                }
                $backupId = (string) $request->getAttribute('id');
                if ($backups->get($backupId) === null) {
                    return $context->refuse($response, new Refusal(404, 'not_found', 'There is no such backup.'));
                }
                $confirm = is_string($body['confirm'] ?? null) ? $body['confirm'] : '';
                if (!hash_equals(substr($backupId, -6), $confirm)) {
                    return $context->refuse($response, Refusal::invalid('confirm_mismatch', 'Type the last six characters of the backup\'s name to restore it.'));
                }
                $proof = $context->proof($request, $body);
                if ($proof !== null) {
                    return $context->refuse($response, $proof);
                }
                $result = $backups->restore($backupId, $context->actorId($request), $request);
                if ($result instanceof Refusal) {
                    return $context->refuse($response, $result);
                }

                return JsonResponse::write($response, 200, $result);
            }));
        });
    }

    /** GET $base/{id}/file?ticket= - the download, its ticket its only check (see the class). */
    public static function file(
        RouteCollectorProxyInterface $app,
        string $base,
        Backups $backups,
        AdminContext $context,
        ?StreamFactoryInterface $streams = null,
    ): RouteInterface {
        return Routes::plain($app->get($base . '/{id:' . Backups::ID_PATTERN . '}/file', function (ServerRequestInterface $request, ResponseInterface $response) use ($backups, $context, $streams): ResponseInterface {
            $ticket = $request->getQueryParams()['ticket'] ?? null;
            $file = is_string($ticket) ? $backups->redeem((string) $request->getAttribute('id'), $ticket) : null;
            if ($file === null) {
                return $context->refuse($response, new Refusal(403, 'ticket_invalid', 'This download link was used already, has run out, or is no link of this backup. Ask for the download again.'))
                    ->withHeader('Referrer-Policy', 'no-referrer');
            }

            return FileStreams::send($request, $response, $file['path'], FileStreams::factory($streams))
                ->withHeader('Content-Type', 'application/octet-stream')
                ->withHeader('Content-Disposition', 'attachment; filename="' . $file['filename'] . '"')
                ->withHeader('Cache-Control', 'no-store')
                ->withHeader('X-Content-Type-Options', 'nosniff')
                ->withHeader('Referrer-Policy', 'no-referrer');
        }));
    }

    /**
     * The routes open while an update waits, as the SiteGate's open paths - exactly these, never a
     * prefix, and never restore ('~^/api/admin/backups(/proof|/[A-Za-z0-9-]{20,80}(/(ticket|file|preview))?)?$~D').
     *
     * @return list<string>
     */
    public static function openPaths(string $base = '/api/admin/backups'): array
    {
        return ['~^' . preg_quote($base, '~') . '(/proof|/[A-Za-z0-9-]{20,80}(/(ticket|file|preview))?)?$~D'];
    }

    /**
     * @param array<string, mixed> $backup
     * @return array<string, mixed>
     */
    private static function shown(array $backup): array
    {
        unset($backup['schema']);

        return $backup;
    }
}
