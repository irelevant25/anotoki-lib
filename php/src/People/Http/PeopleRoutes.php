<?php

declare(strict_types=1);

namespace Anotoki\Lib\People\Http;

use Anotoki\Lib\People\People;
use Anotoki\Lib\People\PeopleColumn;
use Anotoki\Lib\People\PeopleTable;
use Anotoki\Lib\People\Scrubber;
use Anotoki\Lib\Support\JsonResponse;
use Anotoki\Lib\Support\Refusal;
use Closure;
use InvalidArgumentException;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Handlers\Strategies\RequestResponse;
use Slim\Interfaces\RouteCollectorProxyInterface;
use Slim\Interfaces\RouteGroupInterface;
use Slim\Interfaces\RouteInterface;

/**
 * The People page's API, on the site's Slim app - one for every site, the
 * page itself built on the library's UI kit later. The library decides
 * nobody's permissions: the site adds its check to the group (its ADMIN, from
 * the token: RequireRole::admin()).
 *
 *   GET    $base?q=&page=   the people, newest seen first, 50 a page:
 *                           {people: [{sub, name, first_seen_at, last_seen_at, anonymized_at, iam_url,
 *                                      ...the site's columns}],
 *                            columns: [{key, label, kind}], total, page, page_size,
 *                            visitors: {count, ...} | null, sync: {since, checked_at, ok_at, error, scrubbed} | null,
 *                            ready, problems}
 *                           q finds a name (any case, anywhere in it) or an id (all of its digits).
 *   DELETE $base/{sub}      the site's delete hook: 200 {deleted: {label: n}, note?} | 404 not_found
 *   POST   $base/sync       the scrub, now: {run, sync}
 *
 * - sub is a decimal string, as the tokens carry it (an id can outgrow a
 *   JavaScript number); iam_url is the account's page in the IAM's admin
 *   panel, for the IAM's administrators.
 * - $columns: the site's own (PeopleColumn), filled for one page at a time.
 * - $visitors: fn(PDO): ?array - the visitors line ({count, ...}), or null.
 * - $delete: fn(PDO $pdo, int $sub, ServerRequestInterface $request): ?array - deletes what the site keeps of
 *   the person (Piano Academy's progress, a backup copy first at Japanese Academy, the build analyzer's
 *   game accounts) and answers what went, by label, or null when there is nobody with that id. Without
 *   it, no DELETE route.
 * - $error: fn(ResponseInterface, Refusal): ResponseInterface - the site's error body; by default {code, message}.
 *
 * Every handler is called as ($request, $response) whatever the app's invocation strategy, and every
 * answer is no-store JSON.
 */
final class PeopleRoutes
{
    public const PAGE_SIZE = 50;

    /** The longest search taken: a name is shorter. */
    private const QUERY_MAX = 200;

    /**
     * @param list<PeopleColumn> $columns
     * @param ?Closure(PDO): ?array<string, mixed> $visitors
     * @param ?Closure(PDO, int, ServerRequestInterface): ?array<string, mixed> $delete
     * @param ?Closure(ResponseInterface, Refusal): ResponseInterface $error
     */
    public static function admin(
        RouteCollectorProxyInterface $app,
        string $base,
        People $people,
        array $columns = [],
        ?Closure $visitors = null,
        ?Closure $delete = null,
        ?Closure $error = null,
    ): RouteGroupInterface {
        $keys = [];
        foreach ($columns as $column) {
            if (!$column instanceof PeopleColumn) {
                throw new InvalidArgumentException('PeopleRoutes: every column is a PeopleColumn.');
            }
            if (isset($keys[$column->key])) {
                throw new InvalidArgumentException("PeopleRoutes: two columns are called {$column->key}.");
            }
            $keys[$column->key] = true;
        }

        return $app->group($base, function (RouteCollectorProxyInterface $group) use ($people, $columns, $visitors, $delete, $error): void {
            self::plain($group->get('', function (ServerRequestInterface $request, ResponseInterface $response) use ($people, $columns, $visitors, $error): ResponseInterface {
                $query = $request->getQueryParams();
                $search = is_string($query['q'] ?? null) ? trim($query['q']) : '';
                $page = is_string($query['page'] ?? null) && ctype_digit($query['page']) && (int) $query['page'] >= 1 && strlen($query['page']) < 7 ? (int) $query['page'] : 1;
                if (mb_strlen($search, 'UTF-8') > self::QUERY_MAX) {
                    return self::refuse($response, Refusal::invalid('invalid_query', 'That search is longer than any name.'), $error);
                }

                $pdo = $people->pdo();
                if ($people->table->columns($pdo) === null) {
                    return self::refuse($response, new Refusal(503, 'people_unavailable', "There is no table {$people->table->table} yet."), $error)->withHeader('Retry-After', '60');
                }

                return JsonResponse::write($response, 200, self::list($pdo, $people, $columns, $visitors, $search, $page));
            }));

            if ($delete !== null) {
                self::plain($group->delete('/{sub}', function (ServerRequestInterface $request, ResponseInterface $response) use ($people, $delete, $error): ResponseInterface {
                    $sub = (string) $request->getAttribute('sub');
                    $deleted = preg_match('/^[1-9][0-9]{0,17}$/D', $sub) === 1 ? $delete($people->pdo(), (int) $sub, $request) : null;
                    if ($deleted === null) {
                        return self::refuse($response, new Refusal(404, 'not_found', 'There is nobody with that id here.'), $error);
                    }

                    return JsonResponse::write($response, 200, array_key_exists('deleted', $deleted) ? $deleted : ['deleted' => $deleted]);
                }));
            }

            self::plain($group->post('/sync', function (ServerRequestInterface $request, ResponseInterface $response) use ($people): ResponseInterface {
                $pdo = $people->pdo();
                $run = $people->scrubber($pdo)->run();

                return JsonResponse::write($response, 200, ['run' => $run, 'sync' => Scrubber::status($pdo)]);
            }));
        });
    }

    /**
     * One page of the list (GET $base's answer).
     *
     * @param list<PeopleColumn> $columns
     * @param ?Closure(PDO): ?array<string, mixed> $visitors
     * @return array<string, mixed>
     */
    public static function list(PDO $pdo, People $people, array $columns, ?Closure $visitors, string $search, int $page): array
    {
        $t = $people->table;
        $have = $t->columns($pdo) ?? [];
        $table = PeopleTable::quote($t->table);
        $id = PeopleTable::quote($t->id);
        $name = PeopleTable::quote($t->name);
        $time = static fn (?string $column): string => $column !== null && isset($have[$column]) ? PeopleTable::epochOf(PeopleTable::quote($column)) : 'NULL';

        $where = "$id > 0";
        $parameters = [];
        if ($search !== '') {
            $where .= " AND (strpos(lower($name::text), lower(CAST(? AS text))) > 0" . (preg_match('/^[1-9][0-9]{0,17}$/D', $search) === 1 ? " OR $id = CAST(? AS bigint)" : '') . ')';
            $parameters[] = $search;
            if (preg_match('/^[1-9][0-9]{0,17}$/D', $search) === 1) {
                $parameters[] = $search;
            }
        }

        $order = [];
        foreach ([$t->lastSeen, $t->firstSeen] as $column) {
            if ($column !== null && isset($have[$column])) {
                $order[] = PeopleTable::quote($column) . ' DESC NULLS LAST';
            }
        }
        $order[] = "$id DESC";

        $count = $pdo->prepare("SELECT count(*) FROM $table WHERE $where");
        $count->execute($parameters);
        $total = (int) $count->fetchColumn();

        $rows = $pdo->prepare(
            "SELECT $id, $name, {$time($t->firstSeen)}, {$time($t->lastSeen)}, {$time($t->anonymizedAt)}
               FROM $table WHERE $where ORDER BY " . implode(', ', $order) . ' LIMIT ' . self::PAGE_SIZE . ' OFFSET ' . (($page - 1) * self::PAGE_SIZE)
        );
        $rows->execute($parameters);

        $iso = static fn (mixed $epoch): ?string => $epoch === null ? null : gmdate('Y-m-d\TH:i:s\Z', (int) $epoch);
        $list = [];
        $subs = [];
        foreach ($rows->fetchAll(PDO::FETCH_NUM) as [$sub, $personName, $first, $last, $anonymized]) {
            $subs[] = (int) $sub;
            $list[] = [
                'sub' => (string) $sub,
                'name' => $personName === null ? null : (string) $personName,
                'first_seen_at' => $iso($first),
                'last_seen_at' => $iso($last),
                'anonymized_at' => $iso($anonymized),
                'iam_url' => $people->iam->userAdminUrl((string) $sub),
            ];
        }
        foreach ($columns as $column) {
            $values = $subs === [] ? [] : ($column->values)($pdo, $subs);
            foreach ($list as $index => $row) {
                $list[$index][$column->key] = $column->answer($values[(int) $row['sub']] ?? $values[$row['sub']] ?? null);
            }
        }

        return [
            'people' => $list,
            'columns' => array_map(static fn (PeopleColumn $column): array => $column->describe(), $columns),
            'total' => $total,
            'page' => $page,
            'page_size' => self::PAGE_SIZE,
            'visitors' => $visitors === null ? null : $visitors($pdo),
            'sync' => Scrubber::status($pdo),
            'ready' => $t->ready($pdo),
            'problems' => $t->problems($pdo),
        ];
    }

    private static function plain(RouteInterface $route): void
    {
        $route->setInvocationStrategy(new RequestResponse());
    }

    /** @param ?Closure(ResponseInterface, Refusal): ResponseInterface $error */
    private static function refuse(ResponseInterface $response, Refusal $refusal, ?Closure $error): ResponseInterface
    {
        if ($error === null) {
            return JsonResponse::write($response, $refusal->status, $refusal->body());
        }

        return $error($response->withStatus($refusal->status), $refusal)->withStatus($refusal->status)->withHeader('Cache-Control', 'no-store');
    }
}
