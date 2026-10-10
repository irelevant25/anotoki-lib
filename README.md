# anotoki-lib

What the anotoki sites share - the IAM, genshin, the survey site, Piano Academy,
Japanese Academy and the build analyzer - in one library with two halves and one
version:

| Half | Package | Where |
| --- | --- | --- |
| PHP 8.2+, Slim 4, PostgreSQL | `anotoki/lib` (Composer) | `composer.json`, `php/src/`, `php/migrations/`, `php/resources/` |
| Angular 21 (standalone, zoneless, signals) | `@anotoki/lib` (npm tarball) | `angular/projects/lib/` |

Version 0.1.1 holds one module: **migrations** - the engine that brings a
site's database up to date, and one behaviour for every site while an update
waits. Unreleased (0.3.0, CHANGELOG.md): the engine's **library sets** - the
library's own migration files beside a site's - and the PHP half of
**translations** (the section "Translations" below). Unreleased (0.5.0): the PHP
half of the **admin tools** - error log, audit log, feedback, backups, file
explorer (the section "Admin tools").

## The behaviour

The server decides a state for every request:

| state | when |
| --- | --- |
| `not_set_up` | the site's settings files are missing or invalid |
| `update_pending` | the settings are fine and at least one migration file is ready to apply |
| `unavailable` | the settings are fine but the database cannot be reached |
| `ready` | otherwise |

- `not_set_up`: every API path answers `503 {"code":"not_set_up","installed":…,"message":…}`,
  with `"setup":"/setup.php"` only while the site was never installed
  (`storage/installed.lock`, which a site's installer writes on a real host).
- `update_pending` (every site but the IAM blocks): every API path answers
  `503 {"code":"update_pending","message":"The site is being updated. Try again in a few minutes."}`
  with `Retry-After: 60` - except the site's open paths: its boot/sign-in
  configuration, its translations, its health check, the status path and the
  admin migrations routes. So people can sign in, the pages have their words,
  and an administrator reaches Apply.
- What people see:
  - visitors and signed-in people who are not the site's ADMIN: "The site is
    being updated", in their language, checking again by itself and reloading
    when the site is back; no error, no code, no button but a quiet "Sign in"
    while nobody is signed in (how an administrator gets in);
  - the site's ADMIN: "A database update is waiting" and "Open Migrations"; the
    Migrations page works, nothing else does;
  - never set up: "This site is not set up yet" and "Open the setup page";
  - set up once but not answering, or unavailable: "The site is not available
    right now", checking again by itself - never the setup page.
- The IAM keeps answering while an update waits (`blockWhilePending: false`);
  its admin panel shows its administrators one line, "A database update is
  waiting", linking to Migrations.

## Installing it in a site

PHP - in `backend/composer.json`:

```json
"repositories": [{ "type": "vcs", "url": "https://github.com/irelevant25/anotoki-lib" }],
"require": { "anotoki/lib": "^0.1" }
```

then `php composer.phar update anotoki/lib --prefer-dist` in `backend/`. Composer
takes the version from the git tag and installs GitHub's archive of it, which
holds the PHP half only - its code (`php/src`), the migration files of the
library's sets (`php/migrations`) and its resources (`php/resources`), with
`composer.json`, this README and CHANGELOG.md: `.gitattributes` is an
allow-list, and CI builds the archive and checks it
(`.github/scripts/check-archive.sh`). Where the site uploads `vendor/`,
`vendor/anotoki/lib` goes with it - kept from being served as the site's own
`migrations/` is (a deny-all `.htaccess`), since it holds SQL too.

Angular - in `frontend/package.json`:

```json
"@anotoki/lib": "https://github.com/irelevant25/anotoki-lib/releases/download/v0.1.1/anotoki-lib-0.1.1.tgz"
```

then `bun install` in `frontend/` (and `npm install` too where the site keeps a
`package-lock.json`, so both lock files agree). Peer dependencies:
`@angular/core`, `@angular/common`, `@angular/router` ^21.2 and `rxjs` ^7.8.

**Updating** to a new version: PHP - change the constraint where the new
version needs it (0.x: a minor version may break - read CHANGELOG.md), then the
same `composer update anotoki/lib --prefer-dist`; Angular - the new release's URL
in `package.json`, then `bun install`. Update both halves together.

## The PHP half

```php
use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;

$migrator = fn (): Migrator => new Migrator(db(), [new MigrationSet('survey', __DIR__ . '/../migrations/survey')]);

$state = new SiteState(
    settingsProblem: fn (): ?string => settingsProblem(),          // null once config/*.local.php are complete
    installed: fn (): bool => is_file(storageDir() . '/installed.lock'),
    migrator: $migrator,                                            // only called once the settings are complete
    // blockWhilePending: false,                                    // the IAM: keep answering while an update waits
);

$app->add(new SiteGate($state, $app->getResponseFactory(), [
    '/api/auth/config',                     // exact paths...
    '~^/api/translations/[a-z-]+$~D',       // ...or a regular expression when it starts with '~' (end it with D)
    '/api/health',
    '~^/api/admin/migrations(/file|/apply)?$~D', // exactly the three routes - never a prefix
]));

MigrationsRoutes::status($app, $state);                            // GET /api/site-status
MigrationsRoutes::admin($app, '/api/admin/migrations', $migrator, function ($request, array $result): void {
    // after every Apply that was not busy: audit, clear caches
})->add($requireAdmin);                                             // the site's ADMIN check (from the token)
```

- `Migrator` - `files($set)`, `status()` and `applicable()` (read only: they never
  create anything), `apply()`, `source($set, $name)`, `ensureTable()`. Each file
  runs in a transaction of its own with its record; the run stops at the first
  file that fails (rolled back whole; later sets never run), and the result
  names it with the database's error: `statement N of M: <message>` and the
  statement's first six lines. One apply at a time: every apply takes
  `pg_try_advisory_lock` (`DEFAULT_LOCK`, or the site's `lock`) and answers
  `busy` when another holds it. The connection is used as given and needs
  `PDO::ERRMODE_EXCEPTION`.
- Options: `table` (`migrations`), `lock`, `split` (false sends a file in one
  `exec`), and hooks: `ready(set, name, sql)` (false: a draft - it and every file
  after it wait; drafts never stop the site), `prepare(pdo)` (write paths only,
  before the table is created or used: adopt an older shape there),
  `beforeFile(pdo, set, name)` (inside the file's transaction),
  `beforeApply(pdo, files)` (once; its string is the result's `note`; throwing
  ends the apply with nothing applied).
- The bookkeeping table is read and written in every shape the sites have, and
  never changed: the file in `filename` (or `name`), the set in `folder` where
  the table has one (required with more than one set of the site's own),
  `applied_at` a TIMESTAMP holding UTC or a TIMESTAMPTZ (answered as ISO 8601
  UTC, `…Z`). A missing table is created as `(id SERIAL PRIMARY KEY, filename
  VARCHAR(255) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE
  (filename))`, with `folder VARCHAR(64) NOT NULL` and `UNIQUE (folder,
  filename)` for more than one set of the site's own. A table it cannot read (no
  file column) counts as nothing applied until `prepare` adopts it.
- **Library sets** (unreleased, 0.3.0): `MigrationSet::library($name, $dir)` is a
  set the library ships - `Translations\Schema::migrationSet()` is one - and the
  names that begin with `anotoki_` are theirs alone (a site's set named so is
  refused). A site lists them with its own, in the order they run:
  `[new MigrationSet('iam', …), Schema::migrationSet()]`. In a table without
  `folder` a library set's file is recorded as `<set>/<file>`
  (`anotoki_translations/001_languages_and_strings.sql`), wherever the set stands
  in the list; in one with `folder` (genshin) as `folder = <set>`. The site's own
  sets are recorded as before - the first by its file names alone - so adding a
  library set changes nothing in a site's table, a new table still has the shape
  the site's own sets need, and a build without the library set still reads
  every record of the site's own (it lists the library's as missing). A record
  of a set that is not configured is listed as missing under that set's name.
  `ready`, `beforeFile` and `beforeApply` see the library's files with their set
  (`$set->library` is true); a draft holds every file after it, the library's
  too; all of it under the site's one advisory lock.
- `Splitter::split($sql)` - the statements of a file: a `;` ends one only outside
  comments, strings (`'…'`, `E'…'`), quoted names and dollar-quoted blocks.
- `MigrationsRoutes::admin` answers `GET $base` (`Migrator::status()`),
  `GET $base/file?set=&name=` (the SQL, or 404) and `POST $base/apply` (200 with
  `applied`, `failed`, `error`, `note` - a failed file is still a 200 - or 409
  `busy`). The site's admin check must not need tables a pending migration makes.

## The Angular half - `@anotoki/lib/migrations`

```ts
// app.config.ts
provideHttpClient(withInterceptors([siteStatusInterceptor /* , the site's own */])),
provideAnotokiMigrations(() => {
  const auth = inject(AuthService);                 // the factory runs in an injection context
  const i18n = inject(TranslationService);
  return {
    statusUrl: '/api/site-status',
    apiBase: '/api/admin/migrations',
    migrationsRoute: '/admin/migrations',           // the site's route showing <anotoki-migrations-page>
    isAdmin: () => auth.roles().includes('ADMIN'),  // ADMIN of this site, from the token (signals work)
    isSignedIn: () => auth.signedIn(),
    signIn: () => auth.signIn(),                    // returning to the current page
    language: () => i18n.language(),                // 'en' and 'sk' built in; others read English
    formatDate: (iso) => i18n.formatDate(iso),      // optional: default en-GB, '6 Oct 2026, 10:01'
    onUpToDate: () => i18n.reload(),                // optional: after an Apply leaves nothing to apply
    // setupUrl: '/setup.php', retrySeconds: 30, words: { sk: { updatingTitle: '…' } }
  };
}),
provideAppInitializer(() => inject(SiteStatus).check()),   // early in the boot; the boot must not stop on update_pending
```

```html
<!-- the app's template: the gate around the router outlet, and around nothing else; the
     template makes the pages only while the site is open (0.1.1) -->
<anotoki-site-gate><ng-template><router-outlet /></ng-template></anotoki-site-gate>
```

- `SiteStatus` - `state` (`'unknown' | 'ready' | 'update-pending' | 'not-set-up' |
  'unavailable'`), `installed`, `blocked`, `check()`, `report(code, installed?)`,
  `markReady()`.
- `siteStatusInterceptor` - a 503 whose body's `code` is `update_pending` or
  `not_set_up` tells `SiteStatus` (the request still fails).
- `<anotoki-site-gate>` - its content while the site is ready (or not asked
  yet), or for the ADMIN on the Migrations route while an update waits;
  `<anotoki-site-status>` otherwise. Give it the pages as an `<ng-template>`:
  then they are made only while they show (content given as it is is made
  anyway, and a page behind the status page would run and send requests).
- `<anotoki-site-status>` - the page of the section above.
- `<anotoki-update-banner>` - the IAM's one line for its administrators.
- `<anotoki-migrations-page>` - the admin page (English; for the site's ADMIN
  only): Pending (with drafts), Applied (with each file's SQL), Missing, and
  "Apply pending".

A site that does not block while an update waits (the IAM, `blockWhilePending:
false`) puts **no** gate around its outlet and does not ask at boot: the status
path does say `update_pending` there, and the gate would close the site to
everybody. It uses the interceptor, `<anotoki-update-banner>` in its admin panel
(which asks the server itself once an ADMIN is there), the Migrations page, and
`<anotoki-site-status>` where it shows its "not set up" page.

Theming: the components use these custom properties, each with a readable
fallback built on `light-dark()`; a site maps its own tokens onto them, for
light and dark: `--anotoki-bg`, `--anotoki-surface`, `--anotoki-text`,
`--anotoki-muted`, `--anotoki-border`, `--anotoki-primary`,
`--anotoki-primary-contrast`, `--anotoki-danger`, `--anotoki-danger-contrast`,
`--anotoki-success`, `--anotoki-warning`, `--anotoki-radius`,
`--anotoki-font-mono`.

## Translations (unreleased, 0.3.0: the PHP half)

Every site keeps its words in three tables - `languages`, `translation_keys`,
`translations` - which the IAM wrote first and the survey, Piano Academy,
Japanese Academy and the build analyzer copied. `Anotoki\Lib\Translations` is
one implementation of them for every site: the schema, the bundle the pages
read, the admin pages' API, the checks of a string, the command line. One wire
format, the IAM's (snake_case; anotoki-iam's `docs/api.md` is the contract, and
the bundle is the IAM's byte for byte). The library decides nobody's
permissions: each route group takes the site's own checks. The Angular half
(`@anotoki/lib/translations`) comes later.

### The schema: the library's set `anotoki_translations`

```php
$migrator = new Migrator($pdo, [new MigrationSet('survey', __DIR__ . '/../migrations/survey'), Schema::migrationSet()], $options);
```

- The set comes **after** the site's own: the sites' early migrations made these
  tables themselves (Japanese Academy's with a plain `CREATE TABLE`). A site born
  without them may list it first.
- `001_languages_and_strings.sql` makes the tables only where they are missing
  (named constraints, `updated_by` an id without a foreign key), with English
  and Slovak, and proves the shape the library relies on where they are there:
  the columns of compatible types, the three primary keys, the two foreign keys
  of `translations` cascading on update and delete, the `CHECK (value <> '')`,
  no column of the site's own that must be filled and has no default, English
  switched on. It refuses any other shape, naming every difference (genshin's
  today: `languages` keyed by name, TIMESTAMP stamps, no CHECK) - such a site
  moves its tables into the one shape in a migration of its own first. It
  tolerates each site's own: `updated_by` INT or BIGINT and a foreign key from
  it to the site's people, other tables referring to `languages (code)`,
  constraint names, columns of its own with a default. On the five aligned
  sites it makes nothing.
- `002_library_words.sql` adds the library's keys, under `anotoki.` (the
  language switcher's and the status page's words). Their descriptions are the
  library's; their strings are written only for a library key that has none, so
  a site that took a key over - its own words, a language left blank on purpose -
  keeps them, and so does an owner's rewording.
- The house rules: every library file ends with `-- end of NNN` (Japanese
  Academy's draft rule accepts it), has LF line endings, one string a line with
  `''` for an apostrophe and nothing else escaped, names no site table, runs
  whole or statement by statement (`split`), and is never edited once released.
  A site migration never depends on a library file and writes only the base
  columns; a site's gate never counts keys outside its own namespaces (`WHERE
  name NOT LIKE 'anotoki.%'`); `anotoki.` is the library's namespace; a site that
  words a library string its own way writes the key first (`INSERT … ON CONFLICT
  DO NOTHING`, then `UPDATE … WHERE value = '<the library's words>'` for a
  database that has the library's already).

### The PHP half

```php
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Rules\RequiredPlaceholders;
use Anotoki\Lib\Translations\Translations;
use Anotoki\Lib\Translations\TranslationsConfig;

$translations = fn (): Translations => new Translations(db(), new TranslationsConfig(
    releasedLanguages: ['en', 'sk'],                    // the migrations write strings for them: never deleted
    // serverNamespaces: ['mail'],                      // the IAM: never in a bundle; whole in the audit summary
    // rules: [new RequiredPlaceholders(['login.continueTo' => ['app']]), $iamMailRules],
    // usage: $languageUsage,                           // the site's fields, refusal and work around a delete
    // extraCheck: fn (string $field, string $text, array $about): ?Refusal => …,
    // beforeWrite: fn (PDO $pdo, ?int $userId) => …,   // inside a save's transaction, first
));

TranslationsRoutes::bundle($app, $translations, $error);                            // GET /api/translations/{code}
TranslationsRoutes::strings($app, '/api/admin', $translations, $actor, $error, $audit)->add($requireEditor);
TranslationsRoutes::languages($app, '/api/admin', $translations, $error, $audit)->add($requireAdmin);
// and in the gate's open paths: TranslationsRoutes::openPath() - '~^/api/translations/[^/]+$~D'
```

- `Translations` (built per request from a connection with
  `PDO::ERRMODE_EXCEPTION`, as the Migrator is) - `ready()`, `offeredCodes()`,
  `bundle($code)` (`{language, languages, values, english?}`: the language's
  strings over English, no key of a server namespace, `sk-sk` answered by `sk`;
  503 `translations_unavailable` without the tables or an English string),
  `languages()` (`{code, name, native_name, enabled, sort_order, seeded,
  strings}` and the site's fields), `createLanguage()` (under `LOCK TABLE …
  SHARE ROW EXCLUSIVE`, last in the order, at most `languagesMax`),
  `updateLanguage()` (what is sent; `changed` for the audit; English stays on),
  `deleteLanguage()` (never English, never a released language; the row held
  `FOR UPDATE`; its strings cascade), `grid()`, `save($values, $userId)` (one
  transaction; a string sent as it is keeps its writer and time; a blank one in
  another language goes; the IAM's audit summary), `export()`, `import()` (a flat
  `{key: text}`; a blank is passed over, an unknown key refused),
  `forgetWriter($id)`, `storedRefusals()`, `keyNames()`, `keysWithout($code)`.
  None of them throws for a refusal: they answer a `Support\Refusal` (status,
  code, message, extra).
- `StringCheck::changes()` - the IAM's checks in the IAM's order, the changes
  sorted by key and language (one lock order for every save): `invalid_value`,
  `unknown_key` (+ `keys`), `unknown_language`, `fallback_required`,
  `invalid_placeholder`, `placeholder_changed`, `unknown_placeholder`, and what a
  site's rules add. Text is measured as the browser does (`Text`: its `trim()`
  set, blank when nothing is to be seen, code points); a run of a million spaces
  is too long, never empty.
- `KeyRules` - a site's rules for some of its keys: `placeholders($key)` (the
  key's fixed placeholders, in every language), `checkFirst()` (before the
  family's length and brace checks: a mail string's one line, its length and
  bytes) and `check()` (after them: a placeholder a key must keep, an address in
  a mail). The IAM's mail rules become one of these, in the IAM;
  `Rules\RequiredPlaceholders` and `Rules\LibraryKeyRules` (an `anotoki.*` key
  has the library's placeholders, whatever a site's stored English says) ship.
- `LanguageUsage` - `extras()` (the IAM's `accounts`), `refuseDelete()` (the
  survey's 409 `language_in_use`), `beforeDelete()` (Japanese Academy's copy of
  the strings; throwing cancels the delete).
- `TranslationsRoutes` - `bundle()` (public, reads no token and no cookie; `ETag`
  and `Cache-Control: no-cache`, 304 compared the weak way, `-gzip`/`-br`/`-zstd`
  tags too; a database that cannot be asked is a 503 as well), `strings()`
  (`GET $base/languages`, `GET|PUT $base/translations`,
  `GET $base/translations/{code}/export` - a download in the file's format -,
  `PUT $base/translations/{code}/import`) and `languages()` (`POST
  $base/languages`, `PUT|DELETE $base/languages/{code}` - the delete answers
  `{strings, …the site's fields}`). In order: a `{code}` that is none, 404 before
  any query; the body - read by the library from the raw stream, JSON only (415),
  at most `bodyLimit` (413), not empty (422 `empty_body`), JSON (400
  `invalid_json`), `{}` kept apart from `[]`; then 503 `translations_unavailable`
  with `Retry-After: 60` while the tables are missing; then the work. JSON
  answers carry `Cache-Control: no-store`. `$error(ResponseInterface, Refusal)`
  is the site's error body (the IAM's `{error, code, …extra}`; by default
  `{code, message, …extra}`), `$actor(request)` the writer's id (from the session
  or the token, never a body), `$audit(request, action, type, id, details)` the
  site's log: `language.created|updated|deleted`, `translations.saved|imported`.
- The command line - `Cli\TranslationsCommand` wrapped by a site's short
  `translations.php` (never uploaded): `--status` (missing keys, keys without
  English and the scan's problems fail; unused keys and stored strings a save
  would refuse warn; each language's coverage), `--export CODE [FILE]`,
  `--import CODE FILE` (written by nobody, audited `via: command line`); it
  refuses while the tables are missing or a migration waits.
  `Cli\KeyScanner($root, exclude, dynamicKeys, ignoreNamespaces, pipes, calls,
  pluralForms, innerHtml)` is the family's scan of a frontend (the IAM: pipe `t`,
  no plural forms, `innerHtml: 'anywhere'`, `mail` ignored; `anotoki` always
  ignored). `Cli\EnglishDictionary` reads a site's compiled English (a
  TypeScript object or JSON parts) to hold it to the seeded English.

### The library's own words

`php/resources/library-words.json`, `{"keys": {name: {description, en, sk}}}`,
is the one source of the `anotoki.*` keys: `LibraryWords` reads it (and
`LibraryKeyRules` takes the placeholders from it), and a test holds what the
library's migrations write on a new database to it. A new library string is an
entry there and a new library migration; a rewording of a released one is a
migration that changes it only where it still has the earlier words. The
Angular half is to read the same file and never keep a copy by hand: a script
(`angular/scripts/library-words.mjs`) generates its built-in words
(`translations/src/library-words.ts`, committed), and a spec fails when that file
is stale - so a page has the library's words while the database cannot be
reached, and never shows a library key as a key.

## Admin tools (unreleased, 0.5.0: the PHP half)

Five tools every site's admin panel shares, for the site's **ADMIN alone**
(EDITORs see none of them - the owner's decision of 2026-10-07). The library
decides nobody's permissions: each `*Routes::admin()` returns its route group
and the site adds its own ADMIN check (the IAM: `requireSession()` +
`requireAdmin()`, and its CSRF header on every write, as on every first-party
write). The Angular pages come later, on the UI kit.

| tool | namespace | kept in | sites |
| --- | --- | --- | --- |
| error log | `Anotoki\Lib\ErrorLog` | files, `storage/logs/errors-*.jsonl` | every site |
| audit log | `Anotoki\Lib\Audit` | table `anotoki_audit_log` | every site |
| feedback | `Anotoki\Lib\Feedback` | table `anotoki_feedback` | genshin, piano, Japanese, build analyzer |
| backups | `Anotoki\Lib\Backups` | files, `storage/backups/*.anotoki-backup` | every site (the IAM's encrypted) |
| file explorer | `Anotoki\Lib\Files` | the site's folders; `storage/trash/` | genshin |

The error log and the backups need no table: they work while the database is
down or an update waits. Every folder the tools write under storage gets a
deny-all `.htaccess` and an empty `index.html` where it has none
(`Support\GuardedDirectory`). Every time they write is UTC, ISO 8601 with `Z`
on the wire, TIMESTAMPTZ in the tables.

### What a site gives once: `AdminContext`

```php
use Anotoki\Lib\Admin\AdminContext;

$context = new AdminContext(
    actorId: fn ($request) => $request->getAttribute('user')['id'] ?? null,   // from the session or the token, never a body
    proof: AdminContext::recentSignIn(fn ($request) => $request->getAttribute('claims')['auth_time'] ?? null),  // the sites: 10 minutes
    // the IAM: proof: fn ($request, array $body) => accountProof($pdo, $request, $user, $session, $body['password'] ?? null, 'backup'),
    //          proofKind: 'password' (or a closure: 'recent_sign_in' where the account has no password)
    clientKey: fn ($request) => clientAddressCounted($request),               // the trusted proxy's address, its IPv6 /64
    error: fn ($response, Refusal $refusal) => ...,                            // optional: the site's error body
);
```

The proof guards every backup made, deleted, downloaded and restored: the IAM's
`accountProof()` (its password, or a sign-in of the last 15 minutes; its
`array` answers are taken as they are), the sites' token `auth_time`
(`403 reauth_required`; the page offers "Sign in again" with `prompt: 'login'`).
A context without a proof refuses those (`proof_unavailable`). The client key
defaults to `REMOTE_ADDR` - behind Cloudflare a bucket shared by strangers:
stricter, never looser; `X-Forwarded-For` is never read.

### The schema: the library's set `anotoki_admin`, FIRST

```php
use Anotoki\Lib\Admin\Schema;

$migrator = new Migrator($pdo, [Schema::migrationSet(), ...$siteSets, \Anotoki\Lib\Translations\Schema::migrationSet()], $options);
```

- `001_audit_log.sql` makes `anotoki_audit_log` (the IAM's columns plus
  `actor_session`, `scope_type`, `scope_id`), `002_feedback.sql` makes
  `anotoki_feedback`. Each proves the shape of a table of that name that is
  there already, ends with `-- end of NNN` (Japanese Academy's draft rule takes
  it), and names no site table. Released files are never edited.
- It runs **first** - in the site, its installer and its command line alike:
  the sites' own files move their old rows into its tables (the IAM's
  `audit_log`, genshin's `audit_logs` and `feedback`), and nothing else makes an
  `anotoki_*` table. It is recorded as `anotoki_admin/<file>` in a bookkeeping
  table without `folder`, as `folder = anotoki_admin` in genshin's.
- While a file of it waits, the modules ask `Schema::has()` (a `to_regclass`,
  never memoised) and do without: the audit log keeps entries in a pending file,
  feedback answers `503 feature_unavailable` (`Retry-After: 60`).
- A site's hooks see its files: genshin's `migrationsOrderRefusal()` must let a
  set before `users` through; the build analyzer's `beforeFile` and Japanese
  Academy's `upkeep_before_apply()` must not mind them.

### Error log

```php
use Anotoki\Lib\ErrorLog\ErrorLog;
use Anotoki\Lib\ErrorLog\ErrorLogMiddleware;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;

$errorLog = new ErrorLog(storageDir() . '/logs', [
    'root' => dirname(__DIR__),        // file paths are written relative to it
    'context' => $context,             // the user id, and an HMAC of the address bucket
    'app' => $app,                     // the route's pattern in each line
    // 'key' => Keys::derive(appSecret(), 'error-log'),   default: the installation's key (storage/anotoki-lib.key)
    // 'responses' => fn (int $status) => $status >= 400, default: every 5xx and 404, 405, 413, 415, 429
    // 'ignoreExceptions' => [ApiRefusal::class],         a site's decided answers: logged as their answer
]);
$errorLog->installPhpHandlers();                                        // fatals (shutdown) and warnings (chained)
$errors = $app->addErrorMiddleware(false, true, true);
$errors->setDefaultErrorHandler($errorLog->wrapHandler($siteHandler));  // or ErrorLogMiddleware::inner() inside a site's own
$app->add(ErrorLogMiddleware::outer($errorLog));                        // added last: outside the error middleware
ErrorLogRoutes::admin($app, '/api/admin/errors', $errorLog, $context, $audit)->add($requireAdmin);
ErrorLogRoutes::client($app, '/api/client-errors', $errorLog, $context); // the pages' own errors (optional)
```

- One JSON line (`v: 1`) per event: `at` (UTC, ms), `source` (server, php,
  client), `level`, `status`, `type`, `code`, `message` (redacted, 500 at
  most), `file` (relative), `line`, `method`, `route`, `path` (redacted),
  `user_id`, `client` (12 hex of an HMAC - never an address), `trace` (12
  frames, never a call's arguments), `fingerprint`. Never a query string, a
  header, a cookie, a body (an answer gives only its `code` and its sentence),
  a token or the session.
- `Support\Redactor`: PostgreSQL's DETAIL/HINT/CONTEXT/QUERY lines go whole,
  echoed values, e-mail and IP addresses, JWTs, Bearer credentials,
  `password=`-like secrets, query strings and token-like runs become marks; at
  most 4,096 characters are read, and a rule that cannot run gives nothing of
  the message.
- A day's file goes into parts past 4 MB, days past 30 are deleted, and past
  64 MB in all a day's lines are dropped and counted (`dropped` in the
  report). One line per fingerprint per request. genshin's own lines are read
  as they were (their `at` in the server's zone, their `ip` shown).
- `GET $base` (`days`, `level`, `status`, `search`) answers genshin's report -
  `{total, errors, warnings, notices, distinct, truncated, days, daily,
  statuses, groups, dropped}`, the newest 2,000 lines grouped by fingerprint;
  `GET $base/{fingerprint}` every occurrence; `DELETE $base` clears it
  (audited `errors.cleared`). The log's own routes are never logged.
- The client route: `POST {type?, message, page?, stack?, status?}` -> 204,
  8 KB at most, 20 an hour from one address bucket and 500 a day in all
  (`429 too_many`), each redacted, `source: client`.

### Audit log

```php
use Anotoki\Lib\Audit\AuditContextMiddleware;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Audit\Http\AuditRoutes;

$audit = new AuditLog(fn (): PDO => db(), [
    'pendingFile' => storageDir() . '/logs/audit-pending.jsonl',
    // 'recordAddress' => true, 'address' => fn ($request) => requestIp($request),   the IAM keeps the address
    // 'ready' => fn (PDO $pdo) => auditMovedToLibrary($pdo),                         the IAM: once its own move ran
    // 'actorIds' => fn (string $name): array => ...,                                 the page's actor filter by name
]);
$audit->record($request, $actorId, 'user.roles_set', 'user', $id, ['roles' => $roles]);
MigrationsRoutes::admin($app, '/api/admin/migrations', $migrator, function ($request, array $result) use ($audit): void {
    $audit->flushPending();
    $audit->record($request, $actorOf($request), 'migrations.applied', null, null, ['files' => $result['applied']]);
});
AuditRoutes::admin($app, '/api/admin/audit', $audit, $context, fn (array $ids): array => namesOf($ids))->add($requireAdmin);
```

- `record()` never throws; inside the caller's transaction it writes behind a
  savepoint, so a failed entry never undoes the change it records; details are
  cut at 64 KB. While the table is missing (or `ready` says not yet) entries
  wait in the pending file and go in, with their own times, at
  `flushPending()` - after every Apply - or with the next entry written outside
  a transaction.
- `AuditContextMiddleware::fromRequest($audit, fn ($request) => ['actor' => ..., 'session' => ...])`
  (inside the site's sign-in check) or `begin()`/`end()` hold who acts, so deep
  code records with `recordHere()`; `withScope('characters', 42, fn () => ...)`
  files every entry meanwhile under what it belongs to (genshin's
  `withAuditScope()`).
- `page()` (the IAM's filters - `actor` by id or name, `action` by its
  beginning, `target_type` - plus `target_id`, `scope_type`, `scope_id`,
  `from`, `to`), `facets()`, `countSince()`, `latest()`; `scrubPeople($ids)` -
  the IAM's rules: no address on a person's own entries or on the entries about
  them nobody else did, their names gone from the details about them.
- `GET $base` answers the IAM's `{total, page, pageSize: 50, items}` (its
  `AuditEntry` plus `actor_session`, `scope_type`, `scope_id`); `GET $base/facets`.
- The modules record their own actions through it (or any `AuditRecorder`):
  `errors.cleared`, `backup.created|deleted|downloaded|restored|restore_failed`,
  `feedback.status_changed|deleted`, `file.uploaded|moved|renamed|deleted|restored|trash_emptied`,
  `folder.created`.

### Feedback

```php
use Anotoki\Lib\Feedback\Feedback;
use Anotoki\Lib\Feedback\Http\FeedbackRoutes;

$feedback = new Feedback(fn (): PDO => db(), [
    'storage' => storageDir(),                       // the installation's key, the daily prune's stamp
    'sections' => ['Characters', 'Weapons'],         // the site's places, optional
    'fields' => ['steps' => 5000, 'expected' => 2000], // the site's extra fields, into details
    'defer' => afterResponse(...),                   // the prune after the answer
    // 'kinds' => ['bug', 'idea', 'other'], 'limits' => ['perHour' => 5, 'perDay' => 20, 'allPerDay' => 300],
    // 'keep' => ['spam' => 30, 'resolved' => 365, 'client_hash' => 30], 'honeypot' => 'website', 'notify' => fn (array $message) => ...
]);
FeedbackRoutes::public($app, '/api/feedback', $feedback, $context, fn ($request): ?array => optionalSender($request));
FeedbackRoutes::admin($app, '/api/admin/feedback', $feedback, $context, $audit, fn (array $ids): array => namesOf($ids))->add($requireAdmin);
```

- The form: identity from the token only (`anonymous` drops the id and the
  address); the page as a path; a filled honeypot answers `202` and keeps
  nothing; the limits count an HMAC of the address bucket (never an address),
  under one advisory lock; 64 KB a body; `201 {ok: true}` - no id. No mail: the
  panel's badge reads `GET $base/unread`.
- The admin side: `GET $base` (`kind`, `status`, `section`, `search`, `page`),
  `/facets`, `/unread`, `GET $base/{id}` (opening a new one makes it read),
  `PUT $base/{id}/status`, `DELETE $base/{id}` (both audited).
  `forgetPeople($ids)` for an anonymized account; `prune()` daily.

### Backups

```php
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\Copy;
use Anotoki\Lib\Backups\Http\BackupsRoutes;

$backups = new Backups(fn (): PDO => Copy::connect($dsn, $user, $password), storageDir() . '/backups', [
    'site' => 'survey',
    'migrator' => fn (PDO $pdo): Migrator => siteMigrator($pdo),   // the site's sets (the library's first), table and hooks
    'lock' => SITE_MIGRATION_LOCK,                                 // its Migrator's advisory lock, when it names its own
    'audit' => $audit,
    'defer' => afterResponse(...),
    'onError' => fn (Throwable $e) => $errorLog->record($e),
    // the IAM: 'encryption' => Keys::derive(iamMasterKey(), 'iam-backup'), 'restore' => false
    // 'afterRestore' => fn (array $manifest, PDO $pdo) => sweepAnonymizedAccountsSince($manifest['created_at']),
]);
$backups->dailyIfDue();                                                        // on requests: once a UTC day, after the answer
$migratorOptions['beforeApply'] = $backups->beforeApplyHook($siteOwnHook);    // a backup before every update
BackupsRoutes::admin($app, '/api/admin/backups', $backups, $context)->add($requireAdmin);
BackupsRoutes::file($app, '/api/admin/backups', $backups, $context);          // OUTSIDE the admin check
```

- No pg_dump: COPY through PDO (`Pdo\Pgsql::copyToFile()` on PHP 8.4+ -
  open the connection with `Copy::connect()`; `PDO::pgsqlCopyToFile()` before,
  deprecated by 8.5), every table in one `REPEATABLE READ, READ ONLY`
  transaction, parents first (a circle of keys that cannot be deferred is
  refused by name), with the list and the SQL of the applied migrations. One
  backup or Apply at a time (a lock file and the migrations' advisory lock).
- `<id>.anotoki-backup` (`YYYYMMDD-HHMMSSZ-<kind>-<32 hex>`): `ANOTOKI-BACKUP 1`,
  a JSON header, then a gzip'd ustar of `manifest.json`, `schema/<set>/<file>.sql`
  and `data/NNN-<table>.copy` (COPY's text format) - opened anywhere by
  `tail -n +3 x.anotoki-backup | tar -xz` - or, with `encryption`, that body in
  1 MB AES-256-GCM chunks bound to the header, their index and the last one's
  flag (another key, a changed byte, swapped chunks, a cut tail: refused). A
  sidecar `<id>.anotoki-backup.json` feeds the list; a file without one is
  listed from its header.
- Kinds and keeping: `daily` (14), `before-migration` (5, once per list of
  pending files; a backup that fails stops the Apply), `before-restore` (5),
  `manual` (until deleted; `stale` after 90 days). Only files of these names
  are ever deleted: whatever else is in the folder stays.
- Restore in place, all or nothing, only where the live database's applied
  migrations and columns equal the backup's (`409 schema_differs`): a
  `before-restore` backup first, then one transaction (locks within 5 s, user
  triggers off, one TRUNCATE, COPY back, sequences set, deferred keys checked,
  triggers on, rows counted). Never restored: the bookkeeping table, the audit
  log and `keep`. `restore: false` refuses it (the IAM, until an
  `afterRestore` that ends every session and token and deletes again the
  accounts deleted since has been reviewed).
- Downloads: `POST $base/{id}/ticket` (the proof, audited) answers `{url,
  expires_in: 60}`; the page navigates to it; the ticket is 32 random bytes,
  kept as its hash, good once, for one backup, for a minute; the file comes as
  an attachment, `no-store`, `nosniff`, `no-referrer`.
- `GET $base` `{backups, status}` (space, last daily, encryption, whether a
  restore can run here), `GET $base/proof` `{kind}`, `POST $base`,
  `GET|DELETE $base/{id}`, `GET $base/{id}/preview` (the rows a restore would
  take away), `POST $base/{id}/restore` `{confirm: the id's last 6, password?}`.
- The command line - `Backups\Cli\BackupsCommand` in a site's `backup.php`
  (never uploaded): `--list`, `--create`, `--inspect=<id>`,
  `--extract=<id> <folder>` (decrypted and checked, with the order to load it
  into another database: the schema files, then `psql \copy`), `--restore=<id>
  --confirm=<last 6>`.

### File explorer

```php
use Anotoki\Lib\Files\FileExplorer;
use Anotoki\Lib\Files\FileRoot;
use Anotoki\Lib\Files\Http\FilesRoutes;

$explorer = new FileExplorer([
    new FileRoot('assets', _assetsRoot(), label: 'Assets', write: true, extensions: UPLOAD_ALLOWED_EXTENSIONS, maxBytes: 50 * 1048576, snapshot: true),
], [
    'storage' => storageDir(),
    'afterWrite' => fn (string $root, string $op, string $path, ?string $from) => keepTheCatalogueInStep($op, $path, $from),
]);
FilesRoutes::admin($app, '/api/admin/files', $explorer, $context, $audit)->add($requireAdmin);
FilesRoutes::raw($app, '/api/admin/files/raw', $explorer, $context);          // OUTSIDE the admin check: signed links
```

- Paths (`PathGuard`): relative, `/`-separated, NFC; no NUL or control
  characters, `\`, `:`, leading `/`, `.`/`..`, dot-names, trailing dots or
  spaces; every existing part must be no link and resolve to itself inside the
  root's real path plus a separator (symbolic links, Windows junctions, short
  names and a sibling `assets-old/` all fail).
- Names and bytes (`UploadPolicy`, genshin's rules): one extension per name,
  from the root's list, every other dot a dash; a name with any script,
  server-configuration or browser-markup part refused (`shell.php.png`,
  `.htaccess`, `.user.ini`, `x.svg.png`); the bytes must be what the extension
  says; a renamed file's new extension is checked the same way.
- The guard: a written root gets an `.htaccess` before its first write - only
  `RemoveHandler` and `RemoveType` for the script extensions, never `php_flag`,
  `Options` or `Require` (each can answer 500 for every file of the folder where
  AllowOverride does not allow it) - never over the site's own.
- `GET $base/roots`; `GET $base/{root}` (`path`, `search`, `page`, `mode=new`);
  `POST $base/{root}/rescan`, `/upload` (multipart: `path`, `replace`, the
  files), `/folder`, `/move`; `DELETE $base/{root}?path=` (to
  `storage/trash/<root>/`); `GET|DELETE $base/{root}/trash`,
  `POST $base/{root}/trash/restore`. Previews: links signed for five minutes;
  inline only raster pictures, sound and text up to 64 KB, everything else (SVG
  among it) a download; CSP `sandbox`, `nosniff`, same-origin, `no-store`, byte
  ranges.

### What else a site adds

- **Its gate's open paths** (a site that blocks while an update waits - every
  site but the IAM): the error log and the backups need no table, and a backup
  just before Apply is the point - restore stays closed:
  `[...ErrorLogRoutes::openPaths(), ...BackupsRoutes::openPaths(), '~^/api/admin/migrations(/file|/apply)?$~D']`
  (`'~^/api/admin/errors(/[0-9a-f]{12})?$~D'`,
  `'~^/api/admin/backups(/proof|/[A-Za-z0-9-]{20,80}(/(ticket|file|preview))?)?$~D'`).
  Their ADMIN check must judge by the token alone, as the migrations routes'.
- **The runner after the answer**: a site with one passes it as `defer`; the IAM,
  which has none, takes `Support\AfterResponse` - `AfterResponse::shared()->defer(...)`
  while answering, `->run()` after `$app->run()` (PHP-FPM and LiteSpeed close the
  connection first; each piece on its own).
- `Support\Keys`: `derive($secret, $purpose)` (HKDF-SHA256, `anotoki-lib/<purpose>/v1`);
  `installation($storage)` - 32 random bytes in `storage/anotoki-lib.key` for a
  site without a secret, its folder guarded.
- **genshin** moves its `audit_logs` and `feedback` rows into the library's
  tables in its own migrations (gated, the old tables dropped by a later one) and
  drops `ip` and `submitter_hash` in the move; **the IAM** moves `audit_log`
  (017, keeping ids) with `AuditLog`'s `ready` holding entries back until 017
  ran.

## Working on the library

```
# PHP (from the repository root; on this family's Windows machines `php8`)
php composer.phar install
ANOTOKI_LIB_TEST_DB_CONFIG=../anotoki-iam/backend/config/database.local.php vendor/bin/phpunit
#   or ANOTOKI_LIB_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD; the user needs CREATEDB:
#   each test case makes a database anotoki_lib_test_<random> and drops it

# Angular (from angular/)
bun install
bun run build        # ng build lib -> angular/dist/lib
bun run test         # ng test lib --watch=false (Vitest, jsdom)
```

CI (`.github/workflows/ci.yml`) runs the PHP tests on 8.2 and 8.4 against
PostgreSQL 16, builds the Composer archive and checks what it holds
(`sh .github/scripts/check-archive.sh` does the same locally), and builds and
tests the Angular library.

## Releasing

1. Bump the version in `angular/projects/lib/package.json` and
   `ANOTOKI_LIB_VERSION` (`angular/projects/lib/src/public-api.ts`; a test keeps
   them equal), and add it to `CHANGELOG.md`.
2. Commit, `git tag vX.Y.Z`, push the commit and the tag.
3. The release workflow builds and tests the library, refuses a tag that is not
   `v` + that version, packs it and attaches `anotoki-lib-X.Y.Z.tgz` to a GitHub
   Release of the tag.
4. Each site updates its constraint (`composer.json`) and the tarball's URL
   (`package.json`).
