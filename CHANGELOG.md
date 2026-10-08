# Changelog

One version for both halves: the Composer package `anotoki/lib` (from the git tag)
and the npm package `@anotoki/lib` (`angular/projects/lib/package.json`). While the
version is 0.x, a minor version may break what a site uses - each such change is
said here, with what a site must do.

## 0.4.0 - unreleased

Two modules, both halves: **auth** - signing in through the anotoki IAM, the IAM's SDKs moved into the
library, and the sign-in hint (the owner's decisions of 2026-10-07) - and **people** - each site's
record of the accounts that use it, and the scrub of the accounts the IAM deleted (the Angular People
page comes with the UI kit).

PHP, auth (`Anotoki\Lib\Auth`):
- `IamClient` (the SDK's configuration keys), `AccessTokens` and `Jwks` (the SDK 1.1.0's rules: RS256
  and `typ` pinned, `kid` required; new: a header with `crit` refused, a `client_id` claim of another
  application refused, five minutes' rest after a failed fetch of the key set), `Person`, `Bearer`,
  `SignInRule` (the SDK's fail-closed table, single flight and kept file; new: `known()` - false after
  the IAM's 404 - and the site's `requiredWhen`).
- `Http\Identify` (who a request is, once: Bearer, then the sign-in rule, then the visitor key; never a
  cookie), `Http\RequirePerson`, `Http\RequireRole` (from the token, never the database),
  `Http\RequireCaller` (`refuse | empty | make`), `Http\SignInGate`, `Http\AuthRoutes`
  (`GET /api/auth/config` with `sign_in_available`; `configBody()` for a site's own boot answer).
- `Testing\TestIam`, `Testing\StandInIam` and `php/testing/stand-in-iam.php` - the family's one stand-in
  IAM (the survey's, Piano's and Japanese Academy's in one, with the hint cookie, `prompt=none`, the
  paged deleted accounts and any answer a test names); it ships in the Composer archive and answers
  nothing but under PHP's built-in server. `ext-openssl` is required now; `ext-curl` suggested.
- `Support\HttpGet` (a GET with a timeout, status 0 for no answer), `Support\Log` (where the library's
  log lines go), `Support\AfterResponse` (work after the answer, without cron).

PHP, people (`Anotoki\Lib\People`):
- The library's set `anotoki_people` (`php/migrations/people/001`): `anotoki_people_sync` and
  `anotoki_people_anonymized`; it names no site table.
- `PeopleTable` (the site's table through a mapping; no email), `PeopleRecorder` (from the token, at
  most every five minutes, never an anonymized row or a listed id), `AnonymizedAccounts` and `Scrubber`
  (the IAM's list from an inclusive `since`, an account per transaction, UPDATEs only, the site's
  hooks, a failed hook rolled back and kept as the error), `People`, `PeopleColumn`,
  `Http\RecordPerson`, `Http\PeopleUpkeep` (after the answer, at most hourly, while ready),
  `Http\PeopleRoutes` (list, search, paging, the site's columns and visitors line, the delete hook,
  sync now, the IAM's user page).

Angular (`@anotoki/lib/auth`, `@anotoki/lib/auth/testing`):
- `createAuthClient` - the IAM's browser SDK 1.2.0 ported, **with the same storage keys** (tokens,
  the sign-in in progress, discovery, the refresh lock): nobody is signed out by the switch.
- `AnotokiAuth` (Japanese Academy's state machine, for every site), `anotokiAuthInterceptor` (who a
  request is, decided when issued), `personGuard`, `personOrVisitorGuard`, `staffGuard`, `adminGuard`,
  `AccountPreferences` (genshin's outcomes; the site's `apply()` follows the account),
  `<anotoki-auth-callback>` (noindex), `SavesInFlight`, the visitors' words in English and informal
  Slovak.
- The sign-in hint: one silent hop per hint value, for a visitor, guarded by a marker in localStorage
  (one try a value, one a minute, ten minutes after the IAM did not answer); following the IAM - a hint
  gone or changed means one refresh at boot.
- `provideTestAnotokiAuth`, `FakeAuthClient` for a site's specs.

What a site must do (README.md, "Adopting auth and people, site by site"): `anotoki/lib ^0.4` and the
0.4.0 tarball together; a migration of its own adding `users.anonymized_at TIMESTAMPTZ`, then
`People\Schema::migrationSet()` after its sets; its vendored SDKs deleted (the IAM keeps `sdk/` frozen
for third parties) and its wrappers replaced by the wiring in README.md; `robots.txt`
`Disallow: /auth/` where visitors are welcome (genshin, the build analyzer). The boot configuration
answers snake_case now - the Angular half reads the camelCase the sites answer today too.

## 0.3.0 - unreleased

The PHP half of these: the engine's library sets, the translations module, the helpers the modules
share, and a Composer archive that ships the library's migration files and words. (The Angular half of
translations comes later.)

PHP, the engine (`Anotoki\Lib\Migrations`):
- **Library sets.** `MigrationSet::library($name, $dir)` is a set the library ships; the names that
  begin with `anotoki_` are theirs alone, and a site's set named so is refused (no site's is). A library
  set's files are recorded as `<set>/<file>` in a bookkeeping table without `folder`, wherever the set
  stands in the list, and as `folder = <set>` in one with it (genshin). The site's own sets are recorded
  as before; a new table takes the shape the site's own sets need (`folder` only for more than one of
  them); a record of a set that is not configured is listed as missing under its set's name; the hooks
  see the library's files with their set (`$set->library`). Nothing in a site's table changes, and a
  build without the library's set still reads every record of the site's own.
- What a site must do: nothing for the engine itself. To take the translations module, append
  `Translations\Schema::migrationSet()` to its sets - after its own - in every place that builds its
  Migrator (the site, its installer, its command line); check that its hooks let the library's files
  through (`ready`: they end with `-- end of NNN`; genshin's order guard: a third folder). The upload
  then waits for Apply, as any migration does.

PHP, translations (`Anotoki\Lib\Translations`):
- The library's migration set `anotoki_translations` (`php/migrations/translations`): `001` makes the
  three tables only where they are missing and refuses, naming every difference, a shape the library
  cannot work with - on the five aligned sites it makes nothing; genshin moves its tables first. `002`
  adds the library's own keys under `anotoki.` (the language switcher's and the status page's words, en
  and sk), writing strings only for a key that has none.
- `Translations`, `TranslationsConfig`, `StringCheck`, `Text`, `Placeholders`, `LanguageCode`, `ETag`,
  `KeyRules` (with `Rules\RequiredPlaceholders`, `Rules\LibraryKeyRules`), `LanguageUsage`,
  `LibraryWords` (from `php/resources/library-words.json`, the one source of the library's words),
  `Schema`, `TranslationFile`.
- `Http\TranslationsRoutes::bundle|strings|languages|openPath` - the IAM's wire format (snake_case;
  the bundle byte for byte), bodies read by the library (415, 413, 422 `empty_body`, 400
  `invalid_json`), the site's `$error`, `$actor`, `$audit`, and its own checks on each route group.
  Compared with the IAM's routes: `strings` on every language, `{strings, …the site's fields}` from a
  delete (the IAM's `accounts` among them), `Retry-After: 60` on a 503, `charset=utf-8` and `no-store`
  on the JSON answers, and an empty body is 422 `empty_body`.
- `Cli\KeyScanner`, `Cli\EnglishDictionary`, `Cli\TranslationsCommand` - a site's `translations.php`
  in a few lines; the scan gives each aligned site's own result on its frontend.

PHP, shared (`Anotoki\Lib\Support`): `JsonResponse` (the no-store JSON answer the migrations routes and
the site gate now share), `JsonBody` (a request's JSON body, read from the stream), `Refusal`.

Package: `.gitattributes` is an allow-list - GitHub's archive of a tag, which Composer installs, holds
`php/src`, `php/migrations`, `php/resources`, `composer.json`, README.md and CHANGELOG.md, and nothing
else - with LF line endings pinned for the SQL and the JSON; CI builds the archive and checks it.

## 0.1.1 - 2026-10-07

Angular only; the PHP half is unchanged (a site may keep `vendor/anotoki/lib` at 0.1.0).

- `<anotoki-site-gate>` takes the pages as a template -
  `<anotoki-site-gate><ng-template><router-outlet /></ng-template></anotoki-site-gate>` - and
  makes them only while the site is open. Content given as it is (the 0.1.0 form, still
  working) is made by Angular whether it shows or not, so a page behind the status page
  ran and sent requests - whose failures a site may show as toasts. Sites should switch to
  the template.
- The ADMIN's "A database update is waiting" page asks again by itself, as the visitors'
  pages do: another administrator may apply the update meanwhile.
- README: the migrations routes are opened exactly (`~^/api/admin/migrations(/file|/apply)?$~D`,
  never a prefix - a crafted path under it would pass the gate), and patterns end with `D`.

## 0.1.0 - 2026-10-07

The first version: the migrations module, one behaviour for every site while its
database waits for an update (the owner's request of 2026-10-07).

PHP (`Anotoki\Lib\Migrations`):
- `Migrator` - reads, applies and records the files of one or more `MigrationSet`s,
  in every shape the sites' `migrations` tables have, never changing one; each file
  whole or not at all, stopping at the first failure; one apply at a time (an
  advisory lock, `busy` otherwise); drafts (`ready`), and the hooks `prepare`,
  `beforeFile`, `beforeApply`; `split: false` for a file sent in one `exec`.
- `Splitter` - a file's statements.
- `Http\SiteState`, `Http\SiteGate` (PSR-15) and `Http\MigrationsRoutes` - the
  states `not_set_up`, `update_pending`, `unavailable`, `ready`; the 503 answers
  (the setup page only while never installed; `Retry-After: 60` while an update
  waits); the public status route and the admin migrations routes.

Angular (`@anotoki/lib/migrations`):
- `SiteStatus`, `siteStatusInterceptor`, `provideAnotokiMigrations`.
- `<anotoki-site-gate>`, `<anotoki-site-status>` (words in English and Slovak,
  overridable), `<anotoki-update-banner>`, `<anotoki-migrations-page>`.
- `ANOTOKI_LIB_VERSION` from `@anotoki/lib`.
