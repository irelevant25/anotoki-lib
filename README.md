# anotoki-lib

What the anotoki sites share - the IAM, genshin, the survey site, Piano Academy,
Japanese Academy and the build analyzer - in one library with two halves and one
version:

| Half | Package | Where |
| --- | --- | --- |
| PHP 8.2+, Slim 4, PostgreSQL | `anotoki/lib` (Composer) | `composer.json`, `php/src/`, `php/migrations/`, `php/resources/`, `php/testing/` |
| Angular 21 (standalone, zoneless, signals) | `@anotoki/lib` (npm tarball) | `angular/projects/lib/` |

Version 0.1.1 holds one module: **migrations** - the engine that brings a
site's database up to date, and one behaviour for every site while an update
waits. Unreleased (0.3.0, CHANGELOG.md): the engine's **library sets** - the
library's own migration files beside a site's - and the PHP half of
**translations** (the section "Translations" below). Unreleased (0.4.0):
**auth** - signing in through the anotoki IAM, both halves, with the sign-in
hint - and **people** - each site's record of the accounts that use it, and the
scrub of the accounts the IAM deleted (the sections "Auth" and "People").

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

## Auth (unreleased, 0.4.0)

Every anotoki site signs in through the anotoki IAM, the same way: the browser
goes to the IAM (authorization code with PKCE), brings tokens back, and sends
the access token to the site's own server, which checks it without asking the
IAM. The IAM's docs/integrating-an-app.md is the contract. This module is that
contract once, for every site: the IAM's SDKs (`sdk/js/anotoki-auth.mjs` 1.2.0,
`sdk/php/anotoki_iam.php` 1.1.0) moved into the library - the IAM keeps its
`sdk/` frozen, for everybody outside the family - with the sites' own wrappers
around them made one, and the **sign-in hint** (the owner's decision of
2026-10-07): a person signed in at the IAM is signed in, without a click, on a
site that lets visitors in.

### The server: `Anotoki\Lib\Auth`

```php
use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Auth\Http\RequireCaller;
use Anotoki\Lib\Auth\Http\RequirePerson;
use Anotoki\Lib\Auth\Http\RequireRole;
use Anotoki\Lib\Auth\IamClient;
use Anotoki\Lib\Auth\SignInRule;

$iam = IamClient::fromArray(['cache_dir' => storageDir() . '/cache'] + iamSettings());  // the SDK's keys: the settings file stays
$rule = new SignInRule($iam);                                    // requiredWhen: fn (): bool => … - the site's own reason

AuthRoutes::config($app, $rule, $iam, extra: fn (): array => ['visitor_days' => VISITOR_KEEP_DAYS]);   // GET /api/auth/config
$app->group('/api/admin', $adminRoutes)->add(RequireRole::any('ADMIN', 'EDITOR'));
MigrationsRoutes::admin($app, '/api/admin/migrations', $migrator)->add(RequireRole::admin());
$app->get('/api/surveys/{id}', $survey)->add(new RequireCaller('empty'));   // a person's, a visitor's, or nobody's

// Who a request is, once, for every route - inside the SiteGate (Slim runs the last added first):
$app->add(new Identify(new AccessTokens($iam), $rule, $app->getResponseFactory(),
    visitor: fn (string $key): ?SiteVisitor => visitorFind($key),  // the site's visitor, null for a key it does not know
));
$app->add(new SiteGate($state, $app->getResponseFactory(), [AuthRoutes::openPath(), /* … */]));
```

- `IamClient` - the IAM and the application: `fromArray()` takes the SDK's keys
  (`issuer`, `client_id`, `cache_dir`, `jwks_file`, `application_file`, … and
  `anonymized_file`), so every `config/iam.local.php` stays as it is. Give it a
  **private `cache_dir`** (the site's `storage/cache`): the key set and the
  answer about signing in are kept there, in the SDK's own files - a site that
  moves keeps them; without one nothing is kept, and the IAM is asked on every
  request.
- `AccessTokens::verify($token): ?Person` - the SDK's rules: RS256 and `typ`
  `at+jwt` pinned (never read from the token), a `kid` of the IAM's key set
  (`Jwks`: an hour on disk, one fetch per unknown `kid` at most every five
  minutes, and five minutes' rest after a failed fetch), no `crit`, `iss`
  exact, `aud` (and `client_id`, when there is one) this application, the
  times with 60 s of leeway, `sub` an IAM id. Why a token failed is
  `lastReason()`, for the log only.
- `Person` - `sub`, `name` (preferred_username), `email`, `locale`,
  `preferences`, `roles` (upper case), `sid`, `authTime`, `scope`, `claims`;
  `has()`, `isAdmin()`, `isStaff()`, `signedInWithin($seconds)`.
- `SignInRule` - whether the site requires signing in: the IAM's switch (its
  public answer about the application), **failing closed** - a 404 is "required",
  no answer keeps the last one or "required"; a minute on disk, one request
  asking at a time, two seconds' wait, one answer per request (Identify resets
  it). `known()` is false once the IAM answered 404 (a site it does not know or
  has switched off): the boot configuration's `sign_in_available`.
- `Http\Identify` - in this order: a `Bearer` header is a person's - a verified
  token or 401 `invalid_token`, never the visitor; while signing in is required,
  nobody (the visitor key is not read); an `X-Visitor-Key` is the site's
  visitor, or 401 `visitor_unknown`; else nobody. It sets `anotoki.person`,
  `anotoki.visitor`, `anotoki.caller`; it reads no table but the site's
  visitor closure. **No cookie is ever read as somebody** - the IAM's sign-in
  hint least of all.
- `Http\RequirePerson` (401 `sign_in_required`), `Http\RequireRole` (from the
  token, never the database - the Migrations routes keep working while `users`
  waits; 403 `forbidden`, or `->refusing('admin_only', '…')`),
  `Http\RequireCaller('refuse'|'empty'|'make')` (the "owner" check:
  `anotoki.nobody` or `anotoki.makeVisitor` for the route), `Http\SignInGate`
  (genshin's one gate: while signing in is required, every path but the open
  ones needs a person).
- Answers are `{code, message}` with `Cache-Control: no-store` and, on a 401,
  `WWW-Authenticate: Bearer realm="<client id>"` (`error="invalid_token"` for a
  token that was sent); `responder:` keeps a site's own shape while it adopts.
- `Http\AuthRoutes::config()` - `GET /api/auth/config` → `{issuer, client_id,
  login_required, sign_in_available, …extra}`; `configBody()` for a site that
  puts it in its own boot answer (genshin's `/api/settings/public`, the build
  analyzer's `/api/meta`); `openPath()` for the SiteGate.
- Testing (`Anotoki\Lib\Auth\Testing`, shipped): `TestIam::create($dir)` - a key
  pair, `token($sub, $roles, $claims)`, `sign()` for the tokens that must be
  refused, `client()` (an IamClient on its files), `signInRule(false)`,
  `anonymized([...])`; `StandInIam::start($dir)` - **the family's one stand-in
  IAM** (`php/testing/stand-in-iam.php`) on a free port: discovery, keys,
  authorize with PKCE (and `prompt=none`'s `login_required` /
  `interaction_required`), token with rotation, revoke, logout, preferences,
  the public application answer, the paged deleted accounts, and the sign-in
  hint set and cleared as the IAM does; its state is `POST /_test/state`. For a
  browser check: `STAND_IN_DIR=<dir> STAND_IN_ISSUER=http://localhost:8597 php -S
  localhost:8597 vendor/anotoki/lib/php/testing/stand-in-iam.php`. It answers
  nothing but under PHP's built-in server.

### The browser: `@anotoki/lib/auth`

```ts
// app.config.ts
provideHttpClient(withInterceptors([siteStatusInterceptor, anotokiAuthInterceptor /* , the site's own */])),
provideAnotokiAuth(() => ({
  config: '/api/auth/config',                         // or () => inject(SiteSettings).auth(): the site's own boot answer
  visitors: () => inject(VisitorKey),                 // current(), remember(), forget(); none: no visitors
  language: () => inject(TranslationService).language(),   // ui_locales, and the built-in words' language
  beforeSignIn: () => inject(SignInChecks).ready(),   // settle the writes, ask about unsaved work; false stops it
  beforeSignOut: () => inject(SignInChecks).ready(),
  preferences: () => inject(SitePreferences),         // apply(preferences, locale): the theme, the dates, the language
  // api: { prefixes: ['/api/'], skip: [...], visitorPrefixes: ['/api/surveys'] }, headers: () => ({ 'X-Time-Zone': … }),
  // hint: { cookieName: 'anotoki_signed_in' } | false, makesVisitor, forbiddenRoute, words, translate
})),
provideAppInitializer(() => {
  const status = inject(SiteStatus), auth = inject(AnotokiAuth);   // inject before the first await
  return status.check().then(() => auth.init());
}),

// app.routes.ts
{ path: 'auth/callback', component: AuthCallbackComponent },
{ path: '', canActivateChild: [personOrVisitorGuard], children: [/* … */] },   // personGuard where only a person may
{ path: 'admin', canActivate: [staffGuard], children: [/* … */] },             // adminGuard for ADMIN alone
```

- **The same storage as the SDK**: the tokens in localStorage under
  `anotoki-auth:{clientId}`, the sign-in in progress in sessionStorage under
  `anotoki-auth:{clientId}:login:{state}`, discovery under
  `anotoki-auth:discovery:{issuer}`, refreshes under the Web Lock
  `anotoki-auth-refresh:{storageKey}` - nobody is signed out by the switch, and a
  sign-in in flight while the site is uploaded still lands. The client
  (`createAuthClient`) is the SDK's code, ported: PKCE, state and nonce, the ID
  token's checks, `safeReturnTo`, RFC 9207, rotation, `savePreferences`' own-token
  rule.
- `AnotokiAuth` - `init()` reads the boot configuration (snake_case, or the
  camelCase the sites answer today), finishes a callback, restores the session,
  follows the IAM, and - for a visitor - may make the hint's hop. Signals:
  `state` (`starting | signed-in | visitor | signed-out | unavailable`), `user`,
  `signedIn`, `sub`, `roles`, `isAdmin`, `isStaff`, `displayName`,
  `loginRequired` (failing closed), `visitorsWelcome`, `signInAvailable`,
  `signInFailure` (`{code, returnTo}`, never the IAM's sentence),
  `preferences`, `locale`. Methods: `signIn({returnTo, prompt, maxAge})`,
  `register()`, `signOut({local})`, `token()` (none for another person than the
  page's), `refresh()`, `caller()`, `fetch(url, init, as)`,
  `savePreferences()`, `accountUrl()`, `noteSignInRequired()`. Another person
  signing in in another tab - or anybody, on a page shown to a visitor - loads
  the page afresh.
- `anotokiAuthInterceptor` - who a request of the site's API is, decided when
  it is issued (`issuedAs('person' | 'visitor' | 'nobody' | 'caller')`,
  `CARRIES_VISITOR_KEY` for the move): a person's with the token or never sent
  (a 401 `sign_in_required` of its own), one retry after a 401 for the same
  person, a 502 when an answer to a person's request made a visitor; a
  visitor's with the key (the first save going alone), a key brought kept, a
  `visitor_unknown` key forgotten and tried once more, `sign_in_required` noted;
  writes counted in `SavesInFlight`, which a sign-in waits for.
- `personGuard`, `personOrVisitorGuard`, `staffGuard`, `adminGuard` - a sign-in
  started for the page asked for; every page while `SiteStatus.blocked()`; the
  callback route when a sign-in came back without one (sent to the IAM again,
  the browser would go round).
- `AccountPreferences.save(name, value)` → `saved | refused(code) | superseded |
  device` (genshin's), one save at a time; with the site's `preferences`, its
  `apply(preferences, locale)` is given what to show - a choice on its way as
  made, a refused one taken back, a language the IAM does not offer kept for the
  visit.
- `<anotoki-auth-callback>` - "Signing you in…" on the callback route, or why a
  sign-in failed (from its code: `anotoki.signIn.*` words, English and informal
  Slovak, overridable with `words` or the site's bundle through `translate`),
  with Try again and Back; `noindex` while it shows.
- `@anotoki/lib/auth/testing` - `provideTestAnotokiAuth({user, roles,
  loginRequired, visitors, cookie})` and `FakeAuthClient` for a site's specs
  (then `await TestBed.inject(AnotokiAuth).init()`).

### The sign-in hint

The IAM sets `anotoki_signed_in` wherever it opens a session - a random value
per session, readable by script, for every host under its parent domain on a
real host (host-only `localhost` in development: open the sites as `localhost`,
never `127.0.0.1`) - and clears it when its session ends. It says somebody
signed in at the IAM in this browser, never who. A site never writes it.

- **The hop**: at boot, on a site that lets visitors in, for a visitor (no
  tokens of the site's own), on a top-level page that is not prerendering and
  not the callback route, while the site is not blocked, when the cookie is
  there in its shape and the IAM knows the site - one `prompt=none` sign-in,
  after the IAM has answered its discovery document (1.5 s). Its error, whatever
  it is, is never shown.
- **Loop protection**: a marker in localStorage, `anotoki-auth:{clientId}:hint` =
  `{value, at, failed?}`, written and read back before the hop (no storage, no
  hop): each value once, at most one hop a minute whatever the value, ten
  minutes after the IAM did not answer. Signing out (everywhere or here) and a
  refresh refused under the value the session was made with mark it tried.
- **Following the IAM**: when the hint is gone or another one since the session
  was made, `init()` refreshes once (waiting at most five seconds) - signed out
  at the IAM is signed out here at the next page load.
- A site that requires signing in sends people to the IAM as ever
  (`personGuard`), and its sessions follow the IAM the same way.
- **Search engines** never get the cookie, so are never sent anywhere. A site
  keeps them off the callback: its `robots.txt` says `Disallow: /auth/`, and
  `<anotoki-auth-callback>` sets `noindex`.

## People (unreleased, 0.4.0)

Each site keeps its own record of the accounts that use it - its `users`
table, keyed by the IAM's `sub` (every foreign key, every visitor and two
sites' per-person locks live there) - and blanks its copies of a person's name
when the IAM deletes their account, thirty days after they asked: the data
stays, nobody's now. No site keeps a copy of anybody's email (the owner's
decision of 2026-10-07). The People admin page comes with the UI kit; its API
is here.

### The schema

- The site's own migration adds `users.anonymized_at TIMESTAMPTZ` (and nothing
  else) before the library's set runs.
- The library's set `anotoki_people` (`People\Schema::migrationSet()`, after the
  site's own sets) makes `anotoki_people_sync` (one row: `since`, `checked_at`,
  `ok_at`, `error`, `scrubbed`) and `anotoki_people_anonymized` (every id the
  IAM listed: `sub`, `anonymized_at`, `scrubbed_at`, `had_row`). It names no
  table of a site's; applied on databases built from each site's own
  migrations, it changes no site table.

### The PHP half: `Anotoki\Lib\People`

```php
use Anotoki\Lib\People\Http\PeopleRoutes;
use Anotoki\Lib\People\Http\PeopleUpkeep;
use Anotoki\Lib\People\Http\RecordPerson;
use Anotoki\Lib\People\People;
use Anotoki\Lib\People\PeopleColumn;
use Anotoki\Lib\People\PeopleTable;

$people = new People(
    new PeopleTable(name: 'preferred_username', firstSeen: 'created_at', lastSeen: 'last_seen_at'),
    fn (): PDO => db(),
    $iam,
    hooks: [fn (PDO $pdo, int $sub, ?array $former) => /* the site's copies of the name elsewhere */ null],
);

$app->group('/api', $siteRoutes)->add(new RecordPerson($people));            // never on the Migrations routes
PeopleRoutes::admin($app, '/api/admin/people', $people,
    columns: [new PeopleColumn('notes', 'Notes', 'count', fn (PDO $pdo, array $subs): array => …)],
    visitors: fn (PDO $pdo): array => ['count' => …],
    delete: fn (PDO $pdo, int $sub, $request): ?array => ['deleted' => ['Progress' => …]],   // null: nobody with that id
)->add(RequireRole::admin());
$app->add(new PeopleUpkeep($people, fn (): bool => $state->state() === SiteState::READY));   // inside the SiteGate
// and after $app->run(): \Anotoki\Lib\Support\AfterResponse::run();
```

- `PeopleTable` - the site's table and columns: `name` (genshin `username`, the
  build analyzer `name`), `firstSeen`, `lastSeen` (null where people have none),
  `updatedAt`, `nameFallback` (a NOT NULL name and a token without one), read
  from the catalog: a name clipped to the column, a TIMESTAMP written as UTC.
- `PeopleRecorder::seen($pdo, $person, $extra)` - one statement: the row made on
  a first request, the name kept to the token's (a token without one keeps the
  stored name), last-seen at most every five minutes, the site's own columns
  (`$extra`; a NULL keeps them); never an anonymized row, never a row for an id
  the IAM listed. `Http\RecordPerson` calls it for the routes a site names; a
  site that needs the row inside its own transaction or lock calls it there.
- `Scrubber::run()` - asks the IAM's `GET /api/public/anonymized-accounts` from
  `since` (inclusive), following `next` within the run (at most 8 s); each
  account in a transaction of its own: listed in `anotoki_people_anonymized`, its
  row held `FOR UPDATE`, the name `deleted-{sub}` and `anonymized_at` the IAM's
  time - only UPDATEs, never a visitor's row - then the site's hooks with the row
  as it was (`['name', 'anonymized_at']`, null when the site never knew the
  person). A hook that throws rolls its account back and stops the run (the
  error is kept for the People page); an IAM that does not answer keeps `since`;
  one run at a time; idle until the column and the tables are there. Hooks must
  be idempotent - an id comes again.
- `Http\PeopleUpkeep` - the scrub after the answer (`Support\AfterResponse`), at
  most hourly (the stamp `{cache_dir}/anotoki-people.stamp`), while the site is
  ready; no cron.
- `Http\PeopleRoutes::admin()` - `GET $base?q=&page=` (50 a page, newest seen
  first; `{people: [{sub, name, first_seen_at, last_seen_at, anonymized_at,
  iam_url, …columns}], columns, total, page, page_size, visitors, sync, ready,
  problems}`; `q` finds a name or an id), `DELETE $base/{sub}` (the site's hook;
  404 `not_found`), `POST $base/sync` (the scrub now). `iam_url` is the account
  in the IAM's admin panel, for its administrators.

### Adopting auth and people, site by site

In one release per site: `anotoki/lib ^0.4` and the 0.4.0 tarball; the site's
migration adding `users.anonymized_at`, then `People\Schema::migrationSet()` in
its sets (after `Translations\Schema::migrationSet()` where it has it); the
vendored SDKs deleted; the wiring above; its sign-in words' keys
(`anotoki.signIn.*`) taken over where it rewords them. Existing sign-ins
survive: the storage keys are the same.

| Site | Mapping | Scrub hooks | Deleted | Notes |
| --- | --- | --- | --- | --- |
| survey | `preferred_username`, `first_seen_at`, `last_seen_at` | - | `api/anotoki_iam.php`, `core/auth/anotoki-auth.*`, `tests/tools/fake-iam.php`; `requestUser`/`usersSeen`/`requireUser`/`requireRole`/`requireTokenRole`/`requireTaker` | its migration also drops `users.email` once the results, the response page and the CSV stop showing it (the CHECK `users_visitor_check` rewritten without it); `api: { skip: [..., '/api/images/'], visitorPrefixes: ['/api/surveys'] }` |
| piano | `preferred_username`, `created_at`, `last_seen_at` | - | `api/anotoki_iam.php`, `core/auth/anotoki-auth.*`, its fake IAM; `requestUser`/`usersSeen`/`requireOwner` | the Migrations routes take `RequireRole::admin()` - `users` is no longer written there; `peopleDelete()` is the delete hook (under `storeLockGeneration()`), its counts the columns |
| japanese | `preferred_username`, `created_at`, `last_seen_at`; `extra: time_zone` | `exam_attempts.candidate` → `''`, `meta - 'candidate'`, the report's header → "Unnamed candidate" | `src/anotoki_iam.php`, `core/auth/sdk/*`, `tests/tools/stand-in-iam.php`, the SDK version-pin test | `SignInRule(requiredWhen: fn () => !visitors_ready())`; `RequireRole` with `admin_only` / `staff_only`; `api: { prefixes: ['/api/', '/report/'] }`, `headers: X-Time-Zone`; its 008 is a draft - the people set waits behind it |
| build analyzer | `name`, `created_at`, no last-seen (or `last_seen_at`: its CHECK allows it), `updatedAt: 'updated_at'`, `nameFallback: "user $sub"` | `sync_runs.log`: "by {former}" → "by a deleted person" | `src/Support/Iam/*`, `SignInPolicy`, `IamSignInPolicy`, `UserProvisioner`, `core/iam/*`, its fake IAM | `/api/meta` carries `AuthRoutes::configBody()`; a bad token now answers `invalid_token`; the hint acts here; `robots.txt` `Disallow: /auth/` |
| genshin | `username`, `created_at`, no last-seen, `nameFallback: "user$sub"` | `feedback`: `username` → `deleted-{sub}`, `email`, `ip`, `user_agent` → NULL (the words stay) | `api/anotoki_iam.php`, `shared/local-lib/iam/*` | its migration is `users/050_people.sql`; `users.email` and `feedback.email` go once nothing reads them; `SignInGate` with its open prefixes; the library's routes in `SKIP_PREFIXES`; the hint acts here; `robots.txt` `Disallow: /auth/` |

## Working on the library

```
# PHP (from the repository root; on this family's Windows machines `php8`)
php composer.phar install
ANOTOKI_LIB_TEST_DB_CONFIG=../anotoki-iam/backend/config/database.local.php vendor/bin/phpunit
#   or ANOTOKI_LIB_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD; the user needs CREATEDB:
#   each test case makes a database anotoki_lib_test_<random> and drops it; the auth tests
#   start the stand-in IAM under PHP's built-in server on a free local port (needs openssl, curl)

# Angular (from angular/)
bun install
bun run build        # ng build lib -> angular/dist/lib (the auth specs import @anotoki/lib/migrations from it)
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
