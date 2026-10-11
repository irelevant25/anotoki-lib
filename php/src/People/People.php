<?php

declare(strict_types=1);

namespace Anotoki\Lib\People;

use Anotoki\Lib\Admin\Schema as AdminSchema;
use Anotoki\Lib\Auth\IamClient;
use Anotoki\Lib\Feedback\Feedback;
use Anotoki\Lib\People\Http\PeopleUpkeep;
use Anotoki\Lib\Support\AfterResponse;
use Closure;
use InvalidArgumentException;
use LogicException;
use PDO;
use PDOException;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;
use Throwable;

/**
 * A site's people, put together once: its table (PeopleTable), its connection,
 * its IAM, and the hooks the scrub calls for the copies of names kept
 * elsewhere. What the middleware, the routes and a site's command line take.
 *
 *   $people = new People(
 *       new PeopleTable(name: 'username', lastSeen: null, nameFallback: fn (int $sub): string => "user$sub"),
 *       fn (): PDO => db(),
 *       $iam,
 *       hooks: [
 *           // genshin: the feedback's snapshots of who sent it
 *           function (PDO $pdo, int $sub, ?array $former): void {
 *               $pdo->prepare("UPDATE feedback SET username = ?, email = NULL, ip = NULL, user_agent = NULL WHERE user_id = ?")
 *                   ->execute(["deleted-$sub", $sub]);
 *           },
 *       ],
 *   );
 *
 * Hooks are fn(PDO $pdo, int $sub, ?array $former): void, inside the account's
 * transaction, on the scrub's connection. They must be idempotent - an id can
 * come again - and must only UPDATE: the person's data stays, nobody's now.
 * Text the person typed (answers, notes, a feedback's words) is kept.
 */
final class People
{
    /** @var list<Closure(PDO, int, ?array<string, mixed>): void> */
    public readonly array $hooks;

    /**
     * @param Closure(): PDO $pdo  the site's connection, made when a request needs it
     * @param list<Closure(PDO, int, ?array<string, mixed>): void> $hooks
     * @param ?Closure(string $url, float $timeout): array{status: int, body: ?string} $fetch  how the IAM is asked
     */
    public function __construct(
        public readonly PeopleTable $table,
        private readonly Closure $pdo,
        public readonly IamClient $iam,
        array $hooks = [],
        private readonly ?Closure $fetch = null,
    ) {
        foreach ($hooks as $hook) {
            if (!$hook instanceof Closure) {
                throw new InvalidArgumentException('People: every hook is a Closure(PDO $pdo, int $sub, ?array $former): void.');
            }
        }
        $this->hooks = array_values($hooks);
    }

    public function pdo(): PDO
    {
        return ($this->pdo)();
    }

    public function recorder(): PeopleRecorder
    {
        return new PeopleRecorder($this->table);
    }

    /** A scrubber on the site's connection - or on $pdo, a connection of its own. */
    public function scrubber(?PDO $pdo = null): Scrubber
    {
        return Scrubber::of($pdo ?? $this->pdo(), $this->table, $this->iam, $this->hooks, $this->fetch);
    }

    /**
     * The People page's Delete of one person: the site's $hook - what it keeps of them, gone, answered by label,
     * or null for nobody with that id - and, where the site has the admin tools' feedback, that person's
     * messages losing the address and browser they were sent with (Feedback::forgetPeople(), as the scrub of a
     * deleted account does; the words stay). In one transaction of the library's on $pdo, so both or neither:
     * the hook works on the $pdo it is given and begins no transaction of its own (a savepoint is fine). Its
     * $request is the page's - null when a restore does the delete again (afterRestore()).
     *
     * @param Closure(PDO, int, ?ServerRequestInterface): ?array<string, mixed> $hook
     * @return ?array<string, mixed> what the hook answered
     */
    public function delete(PDO $pdo, int $sub, Closure $hook, ?ServerRequestInterface $request = null): ?array
    {
        $own = !$pdo->inTransaction();
        if ($own) {
            $pdo->beginTransaction();
        }
        try {
            $deleted = $hook($pdo, $sub, $request);
            if ($deleted !== null && AdminSchema::has($pdo, AdminSchema::FEEDBACK_TABLE)) {
                Feedback::forgetPeopleOn($pdo, [$sub]);
            }
            if ($own) {
                if (!$pdo->inTransaction()) {
                    throw new LogicException('People: the delete hook ended the library\'s transaction - it begins, commits or rolls back none of its own (a savepoint is fine).');
                }
                $pdo->commit();
            }

            return $deleted;
        } catch (Throwable $e) {
            if ($own && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e instanceof PDOException && str_contains($e->getMessage(), 'already an active transaction')) {
                throw new LogicException('People: the delete hook runs inside the library\'s transaction (0.4.2) - it begins none of its own (a savepoint is fine).', 0, $e);
            }
            throw $e;
        }
    }

    /**
     * For Backups' `afterRestore`: what a restore must do again, as one fn(array $manifest, PDO $pdo).
     *
     * A restore puts the database back as it was when the backup was made; the audit log is never restored,
     * so it still says what was done since. On the restore's connection, then:
     *   1. every person.data_deleted the audit log holds from the backup's time on: the People page's delete
     *      again (delete(): the site's $delete, their feedback forgotten), in the order they were done - and
     *      every feedback.deleted from then on: the message deleted again;
     *   2. the scrub of the IAM's deleted accounts, at once: the restore brought back the scrub's place of the
     *      backup's day, and with it the names of whoever the IAM deleted since. One that does not finish - the
     *      IAM out of reach, its time up with more to read, a run already going - leaves the upkeep's hourly
     *      stamp to go after the answer (this request's own upkeep claims the hour first), so the next request
     *      runs the scrub again;
     *   3. the site's own work after a restore ($then: Piano Academy's new generations), when it has some.
     * What could not be done is thrown, all of it in one RuntimeException: the restore's after_restore_error,
     * which the Backups page shows and the site's onError hears - never a restore that looks complete with a
     * deleted person's data, or name, back. (The pattern the survey, Piano Academy and genshin wrote by hand.)
     *
     * @param ?Closure(PDO, int, ?ServerRequestInterface): ?array<string, mixed> $delete  the People page's hook -
     *        PeopleRoutes' delete:, its request null here; without it, no person's delete is done again
     * @param ?Closure(callable): void $defer  the site's after-the-answer runner (PeopleUpkeep's); default
     *        AfterResponse::shared()
     * @param ?Closure(array<string, mixed>, PDO): void $then  the site's own work after a restore
     * @return Closure(array<string, mixed>, PDO): void
     */
    public function afterRestore(?Closure $delete = null, ?Closure $defer = null, ?Closure $then = null): Closure
    {
        return function (array $manifest, PDO $pdo) use ($delete, $defer, $then): void {
            $failed = [];
            $since = is_string($manifest['created_at'] ?? null) ? $manifest['created_at'] : null;
            if ($since !== null && AdminSchema::has($pdo, AdminSchema::AUDIT_TABLE)) {
                if ($delete !== null) {
                    foreach (self::doneSince($pdo, 'person.data_deleted', 'user', $since) as $sub) {
                        try {
                            $this->delete($pdo, (int) $sub, $delete);
                        } catch (Throwable $e) {
                            $failed[] = "What was deleted of person $sub after this backup was made was not deleted again (" . rtrim($e->getMessage(), '.') . ').';
                        }
                    }
                }
                if (AdminSchema::has($pdo, AdminSchema::FEEDBACK_TABLE)) {
                    try {
                        foreach (self::doneSince($pdo, 'feedback.deleted', 'feedback', $since) as $id) {
                            Feedback::deleteOn($pdo, (int) $id);
                        }
                    } catch (Throwable $e) {
                        $failed[] = 'The feedback deleted after this backup was made was not all deleted again (' . rtrim($e->getMessage(), '.') . ').';
                    }
                }
            }

            $scrub = $this->scrubAgain($pdo, $defer);
            if ($scrub !== null) {
                $failed[] = $scrub;
            }
            if ($then !== null) {
                try {
                    $then($manifest, $pdo);
                } catch (Throwable $e) {
                    $failed[] = $e->getMessage();
                }
            }
            if ($failed !== []) {
                throw new RuntimeException(implode(' ', $failed));
            }
        };
    }

    /** The scrub at once, after a restore: null when it went through every id, else why not (the stamp then goes after the answer). */
    private function scrubAgain(PDO $pdo, ?Closure $defer): ?string
    {
        $run = $this->scrubber($pdo)->run();
        if ($run['state'] === 'done') {
            return null;
        }

        $cache = $this->iam->cacheDirectory();
        if ($cache !== null) {
            $forget = static function () use ($cache): void {
                @unlink($cache . '/' . PeopleUpkeep::STAMP);
            };
            $defer !== null ? $defer($forget) : AfterResponse::shared()->defer($forget);
        }
        $why = match ($run['state']) {
            'unreachable', 'stopped' => lcfirst(rtrim((string) $run['error'], '.')),
            'more' => 'its time ran out with more of the IAM\'s list to read',
            'busy' => 'another check was running',
            'not_ready' => 'what it needs is not there: ' . implode('; ', $run['problems']),
            default => 'it ended ' . $run['state'],
        };

        return "The accounts the IAM deleted were not checked again ($why). Whoever it deleted since this backup was made may be named here "
            . 'until they are: the check runs again with the next request, and at once with Check now on the People page.';
    }

    /**
     * The ids an audit entry of $action names, from $since on (the backup's time; an entry of that very moment
     * counts), each once, in the order first done. Ids only: a target that is no id is passed over.
     *
     * @return list<string>
     */
    private static function doneSince(PDO $pdo, string $action, string $targetType, string $since): array
    {
        $statement = $pdo->prepare(
            'SELECT target_id FROM ' . AdminSchema::AUDIT_TABLE . '
              WHERE action = ? AND target_type = ? AND created_at >= CAST(? AS timestamptz) AND target_id IS NOT NULL
              GROUP BY target_id ORDER BY min(created_at), min(id)'
        );
        $statement->execute([$action, $targetType, $since]);

        return array_values(array_filter(
            array_map('strval', $statement->fetchAll(PDO::FETCH_COLUMN)),
            static fn (string $id): bool => preg_match('/^[1-9][0-9]{0,17}$/D', $id) === 1,
        ));
    }
}
