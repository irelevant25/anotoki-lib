# Changelog

One version for both halves: the Composer package `anotoki/lib` (from the git tag)
and the npm package `@anotoki/lib` (`angular/projects/lib/package.json`). While the
version is 0.x, a minor version may break what a site uses - each such change is
said here, with what a site must do.

## 0.4.0 - unreleased

Two modules, both halves: **auth** - signing in through the anotoki IAM, the IAM's SDKs moved into the
library, and the sign-in hint (the owner's decisions of 2026-10-07) - and **people** - each site's
record of the accounts that use it, and the scrub of the accounts the IAM deleted (the Angular People
page comes with the UI kit); and the PHP half of the **admin tools** every site's panel shares (the
owner's request of 2026-10-07, step 4): the error log, the audit log, feedback, backups and the file
explorer - for the site's ADMIN alone (the owner's decision: EDITORs see none of them). The admin tools'
Angular pages come later, on the UI kit. Nothing a site's code uses of 0.3.0 changes; each module is
taken when the site adopts it (README.md: "Auth", "People", "Admin tools"). A site on the translations
module gets one more library migration to apply (`anotoki_translations/003`, the sign-in page's words).
The library's words are generated a namespace at a time: `LIBRARY_WORDS` is `@anotoki/lib/words`' now
(it was `@anotoki/lib/ui/config`'s), a module's words come with the module (its `provide*()` registers
them), and the kit's first loads and the translations module's carry the kit's words alone (README.md,
"Upgrading from 0.3.x").

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

PHP, the admin tools - what they share:
- `Admin\AdminContext` - the site's actor, proof (the IAM's `accountProof()`; the sites'
  `recentSignIn()` from the token's `auth_time`), address bucket and error body, given once.
- The library's migration set `anotoki_admin` (`Admin\Schema`, `php/migrations/admin`): `001`
  `anotoki_audit_log`, `002` `anotoki_feedback`. It runs **first** in a site's list.

PHP, the admin tools:
- `ErrorLog` - JSON lines in `storage/logs`, UTC days, parts past 4 MB, 30 days, 64 MB in all,
  redacted, traces without arguments, an HMAC of the address bucket instead of an address;
  `wrapHandler()`, `ErrorLogMiddleware::outer()/inner()`, `installPhpHandlers()` (fatals, chained
  warnings); `ErrorLogReader` (genshin's report, its own lines read too); `Http\ErrorLogRoutes`
  (`admin()`, `client()` for the pages' errors, `openPaths()`). By default every 5xx and 404, 405,
  413, 415, 429 are written.
- `Audit\AuditLog` (`AuditRecorder`) - never throws, a savepoint inside the caller's transaction,
  a pending file while the table is missing (`flushPending()` after every Apply), the request's
  actor held by `AuditContextMiddleware`, `withScope()`, `page()`/`facets()`, `scrubPeople()`
  (the IAM's rules); `Http\AuditRoutes` (the IAM's answer).
- `Feedback\Feedback` - the open form (identity from the token, a honeypot, 5 an hour / 20 a day
  per address bucket and 300 a day in all, never an address kept, no id returned, no mail), the
  admin list with an unread count for the panel's badge, `prune()` (spam 30 days, resolved 365,
  the bucket's hash 30), `forgetPeople()`; `Http\FeedbackRoutes`.
- `Backups\Backups` - no pg_dump: every table by COPY through PDO in one snapshot, with the applied
  migrations, into `<id>.anotoki-backup` (a gzip'd ustar; the IAM's in AES-256-GCM chunks under a
  key derived from its master key); daily after the answer (14), before every update (5), before
  a restore (5), manual; restore in place only where the schema is the backup's, all or nothing,
  never touching the bookkeeping or the audit log (`restore: false` for the IAM); downloads by
  single-use 60-second tickets; `Http\BackupsRoutes` (the proof and an audit entry for every
  create, delete, download and restore; `openPaths()` without restore), `Cli\BackupsCommand`.
- `Files\FileExplorer` - roots (`FileRoot`) confined by real paths (`PathGuard`), genshin's upload
  rules (`UploadPolicy`: one extension per name, no script or markup part, bytes checked, a guard
  of RemoveHandler/RemoveType only), snapshot listings, a trash, signed previews;
  `Http\FilesRoutes`.

PHP, shared (`Anotoki\Lib\Support`):
- `AfterResponse` - work after the answer, without cron: one runner for the people's scrub and the
  admin tools' daily work. `AfterResponse::shared()->defer($work)` while answering (a module's
  `defer:` option takes it, or a site's own runner), `->run()` after `$app->run()` - PHP-FPM and
  LiteSpeed close the connection first; each piece on its own, a failure said in the log (redacted)
  or to the site's `$onError`, never stopping the next; work a piece queues runs too. A site that
  never calls `run()` has it run at the end of the request all the same (a shutdown function).
- `HttpGet` (a GET with a timeout, status 0 for no answer), `Log` (where the library's log lines go:
  PHP's error log, or the site's sink), `GuardedDirectory`, `Keys` (`derive()`: HKDF-SHA256
  `anotoki-lib/<purpose>/v1`; `installation()`: a key in `storage/anotoki-lib.key` for a site
  without a secret), `Redactor` (messages and paths without personal data or secrets; 4,096
  characters at most; fail closed), `Throttle`, `AtomicFile`, `Utf8`.
- One of each for the modules of both: the auth module's kept files (the IAM's key set, its answer
  about signing in) are written by `AtomicFile`; the admin tools' default reporters (the audit log's
  `onError`, the backups', feedback's and the file explorer's) say their lines through `Log`, as
  auth, people and the runner do - feedback's and the file explorer's redacted now too.

Angular (`@anotoki/lib/auth`, `@anotoki/lib/auth/testing`):
- `createAuthClient` - the IAM's browser SDK 1.2.0 ported, **with the same storage keys** (tokens,
  the sign-in in progress, discovery, the refresh lock): nobody is signed out by the switch.
- `AnotokiAuth` (Japanese Academy's state machine, for every site), `anotokiAuthInterceptor` (who a
  request is, decided when issued), `personGuard`, `personOrVisitorGuard`, `staffGuard`, `adminGuard`,
  `AccountPreferences` (genshin's outcomes; the site's `apply()` follows the account),
  `<anotoki-auth-callback>` (noindex), `SavesInFlight`. The shell's theme and the translations
  module's language follow the account through `AnotokiAuth` (README, "The browser").
- The sign-in hint: one silent hop per hint value, for a visitor, guarded by a marker in localStorage
  (one try a value, one a minute, ten minutes after the IAM did not answer); following the IAM - a hint
  gone or changed means one refresh at boot.
- `provideTestAnotokiAuth`, `FakeAuthClient` for a site's specs.
- On 0.3.0's structure: `<anotoki-auth-callback>` is drawn with the kit - its buttons
  (`@anotoki/lib/ui/button`), the status page's frame, classes of its own (`anotoki-auth-callback__panel`,
  `__message`, `__actions`; `[data-retry]`, `[data-back]`); the module imports the kit's pieces from their
  own entry points and the migrations module, never `@anotoki/lib/ui`; its top-level `HttpContextToken`s
  and words are marked pure.
- The sign-in page's words are library words: `anotoki.signIn.signingIn|notCompleted|expired|
  storageUnavailable|unavailable|failed|retry|back`, English and informal Slovak, in
  `php/resources/library-words.json`, generated into `@anotoki/lib/words/sign-in` (below) and read from
  there (`SIGN_IN_WORD_NAMES`, as the status page reads its own); an owner's rewording through
  `translate` (with the translations module, `libraryWord()`).
- `scripts/check-package.mjs` knows the two entry points: auth is eager (16 kB at most; 14.9 kB), its
  testing helper imports it alone; a fifth first load, "the sign-in" (the gate and every eager part of
  auth, 19.5 kB at most; 18.7 kB).

Angular, the library's words a namespace at a time, each module's with the module - so that a module's
words weigh neither on the kit's first loads nor on the translations module's:
- `bun run words` generates them per namespace from `php/resources/library-words.json` (still the one
  source; the PHP half and the SQL are unchanged): the kit's namespaces (`language`, `ui`, `topbar`,
  `theme`) into `ui/config/src/library-words.ts` - `KIT_LIBRARY_WORDS`, and `LibraryKey`, every key's name
  (a type); every other namespace into an entry point of its own, `@anotoki/lib/words/<namespace>`
  (`/site-status`, `/sign-in`), which its module alone imports; and `@anotoki/lib/words`, `LIBRARY_WORDS`
  of every namespace, for a site's specs and the showcase. `--check` also finds a namespace's folder the
  JSON no longer has, and `bun run words` removes it.
- **A module registers its words**: `provideLibraryWords(words)` (`@anotoki/lib/ui/config`, the multi
  provider `ANOTOKI_LIBRARY_WORDS`) among its `provide*()` function's providers -
  `provideAnotokiMigrations()` the status page's, `provideAnotokiAuth()` the sign-in page's, every later
  module its own. The translations module holds the kit's built-in words alone and reads every
  registered module's beside them, so a key of a module in use with no string is never shown as a key;
  a key of a module the site does not use, with no string, reads as the key (warned once).
- **Moved:** `LIBRARY_WORDS` is `@anotoki/lib/words`' (it was `@anotoki/lib/ui/config`'s and
  `@anotoki/lib/ui`'s); `LibraryKey` stays in `@anotoki/lib/ui/config`, as before. A site's spec that reads
  a module's key with no string in its bundle provides the module, or its words (README.md, "Upgrading
  from 0.3.x").
- The first loads, gzipped (every library word in `ui/config`, as 0.3.0 had them plus the sign-in page's
  -> now): a button 5.5 -> 4.8 kB, the bar 20.5 -> 19.8, the gate 8.6 -> 8.3, the words 7.1 -> 6.5 - the
  kit's words alone, and the gate the status page's beside them; the sign-in 18.5 -> 18.7 (two small files
  more). `ui/config` 3.1 -> 2.4 kB, ui and shell together 28.2 -> 27.5 (back under its 28 kB; 27.8 at
  0.3.0), translations 7.1 -> 7.3 (gathering the registered words). New entry points: `words` 0.2,
  `words/site-status` 0.5, `words/sign-in` 0.6.
- `scripts/check-package.mjs`: `ui/config` holds the kit's namespaces alone and each `words/<namespace>`
  one namespace; the words entry points' boundaries come from the package itself (a new namespace needs
  nothing there but its module's import); a module's words reach the translations module only through
  its registration - the translations module imports no words entry point, and a module that imports
  its words without `provideLibraryWords(...)` of them fails the build; and every first load carries the
  words of the namespaces its page says (a button, the bar and the words the kit's, the gate the status
  page's too). The generated files are left alone by prettier (`bun run format` would rewrite what `bun
  run words --check` holds byte for byte).

PHP, translations: the library's set `anotoki_translations` gains `003_sign_in_words.sql` - the sign-in
page's eight keys, by 002's rule (descriptions the library's; strings only for a key that has none; a
gate on English). A site that applies the set gets it as any migration: the upload waits for Apply.

What a site must do - auth and people (README.md, "Adopting auth and people, site by site"):
`anotoki/lib ^0.4` and the 0.4.0 tarball together; a migration of its own adding
`users.anonymized_at TIMESTAMPTZ`, then `People\Schema::migrationSet()` after its sets; its vendored
SDKs deleted (the IAM keeps `sdk/` frozen for third parties) and its wrappers replaced by the wiring in
README.md; `robots.txt` `Disallow: /auth/` where visitors are welcome (genshin, the build analyzer). The
boot configuration answers snake_case now - the Angular half reads the camelCase the sites answer today
too.

What a site must do - the admin tools: nothing until it takes them. Taking them:
`Admin\Schema::migrationSet()` **first** in every place that builds its Migrator (the site, its
installer, its command line) - genshin's order guard must let it through, and the upload then waits for
Apply like any migration; an `AdminContext` from its auth; the modules and their routes behind its ADMIN
check (the file and raw routes outside it); `ErrorLogRoutes::openPaths()` and
`BackupsRoutes::openPaths()` in its gate's open paths; `flushPending()` in its migrations' `afterApply`;
`dailyIfDue()` on requests and `beforeApplyHook()` in its Migrator. The IAM: `AfterResponse` after
`$app->run()`, its backups encrypted with restore off, and its `audit_log` moved into the library's
table by a migration of its own (`AuditLog`'s `ready` holds entries back until it ran).

The order of the library's sets in a site's list: `[Admin\Schema::migrationSet(), ...$siteSets,
Translations\Schema::migrationSet(), People\Schema::migrationSet()]` - the admin set first, the others
after the site's own.

## 0.3.0 - 2026-10-11

The engine's library sets, the translations module - both halves -, the helpers the modules share, and
a Composer archive that ships the library's migration files and words; the kit's core a file per piece
(a smaller first load), its class names its own, and four of the IAM's looks back. Nothing a site's code
uses breaks; a site's specs that read the kit's markup by class change their selectors ("Angular, the
kit's class names"), and the little else that changes in what 0.2.0 had is said under "Angular, the
kit's words" and "Angular, the first load".

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
  adds the library's own keys under `anotoki.` - the kit's words (`anotoki.ui|topbar|language|theme.*`)
  and the status page's (`anotoki.siteStatus.*`), 54 keys, en and sk - writing strings only for a key
  that has none.
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

Angular, translations (`@anotoki/lib/translations`, new):
- `provideAnotokiTranslations()` and `TranslationService` - the language the pages are read in and its
  strings, from the site's bundle route with English under them: the family's ranking (this tab's
  `?lang=`, a choice made on the page, the account's language - before this device's while the account
  decides -, the browser's, English), a choice saved to the account one save at a time and the latest
  last (`languageNotSaved` when it is refused, a quiet refusal kept the site's own for the visit; the
  account page's `revertible` choice goes back), the way back from memory, the cache and the start's
  waits, `canAsk`, a site's own `fetchBundle` and `onBundleRefused`, English areas, `preferred()`,
  `settled()`, `reload()`, `noteAddress()`; plurals, `around()`, numbers; the storage keys a site already
  has (`storagePrefix`, `storageKeys`). A key without a string: the site's compiled English while no
  bundle is in memory, else the key; a library key never - the database's string, the site's
  `libraryWords`, the library's built-in words of the language, their English.
- The `translate` and `translatePlural` pipes; `forKit()` (the kit's `lookup` reads the database, so an
  owner's rewording reaches the kit), `forShell()` (the shell's language switcher), `siteStatusWords()`
  (the status page in the database's words), `anotokiUnsavedChangesGuard`.
- `@anotoki/lib/translations/admin` (lazy): `<anotoki-translations-page>` and `<anotoki-languages-page>`,
  drawn with the kit - the five sites' pages in one: coverage, tags, search, "Missing in", plural
  families, the server-only groups (the IAM's mails), export and import, drafts kept in the tab
  (`LocalizationDrafts`), refusals beside their key, the Languages page's rows, switch, export-then-delete
  and the site's own fields (`admin.languageNotes`); who may use them is the site's (`admin.allows`).
- `@anotoki/lib/translations/testing`: `provideTestTranslations()`, `TEST_LANGUAGES`.
- What a site must do: README, "Translations" - "A site moves in", per site.

Angular, the kit's words:
- The library's words are generated from `php/resources/library-words.json` (`bun run words`) into
  `ui/config/src/library-words.ts`, exported as `LIBRARY_WORDS` (and `LibraryKey`); the kit's
  `BUILT_IN_WORDS` and the status page's built-in words are read from it - no copy by hand. A spec, CI
  (`bun run words --check`, in the Angular job) and the PHP half's `LibraryWordsTest` fail when the file
  is stale.
- The library's Slovak `anotoki.language.notSaved` is the kit's released wording ("… do tvojho anotoki
  účtu - platí len …"), where the unreleased 002 had Piano Academy's ("… účtu anotoki – …"); the kit's
  words themselves are as 0.2.0 had them. `ANOTOKI_WORD_KEYS` now lists them in the JSON's order
  (`language.*` first).

Angular, the first load:
- **The kit's core is a file per piece.** A site's build (the Angular CLI's esbuild) places whole files in
  its chunks, and 0.2.0's `@anotoki/lib/ui` was one file: a first page that used one piece - the status
  page uses the button - took every piece any lazy page used into the first load. genshin's and the build
  analyzer's (the gate, and the Migrations page on a lazy route) took the Migrations page's alert, cards,
  badges, page header and icons with it: built from the packed package in a scratch app, their first
  load goes from 291.3 kB to 277.2 kB (gzipped 88.9 to 85.0; the library's part 39.1 kB to 25.1). Each
  piece is an entry point of its own - `@anotoki/lib/ui/config` (`provideAnotokiUi`, `AnotokiWords`, the
  kit's words, `LIBRARY_WORDS`), `/icon`, `/dom`, `/spinner`, `/button`, `/badge`, `/alert`, `/card`,
  `/empty-state`, `/error-state`, `/page-header`, `/avatar`, `/segmented`, `/autofocus` - and
  `@anotoki/lib/ui` re-exports them all: nothing has to change to keep building. The library imports each
  from its own entry point; a site that imports from `@anotoki/lib/ui` on its first page reaches every
  piece through it and keeps 0.2.0's first load until it imports them from theirs (README, "Upgrading from
  0.2.x"). genshin and the build analyzer import nothing of the kit: they have nothing to change.
- **Top-level code a site's build kept, used or not.** The Angular CLI marks a package's top-level calls
  pure in `@angular/*` alone, so the library's own - the kit's words and icons built as the module loads,
  the tabbable selector, the status page's words, the Migrations page's date format, the translations'
  `HttpContextToken`, the QR code's tables, a `1024 * 1024` - stayed in every bundle that imported
  anything of their entry point (8 kB of ui's and of migrations' alone: the library's every word). Each
  is a call marked `/* @__PURE__ */` now, or a literal.
- The Migrations page carries its own helpers (`messageOf`, the default date format): in
  `@anotoki/lib/migrations` they were in the gate's file. That entry point exports `ɵjsonObject` for the
  page instead of `ɵdefaultFormatDate` and `ɵmessageOf` - none of them a site's API.
- `scripts/check-package.mjs`: the core's limit holds its pieces together (15 kB); the library's imports
  of the core go to the pieces, never through `@anotoki/lib/ui`, which holds re-exports and nothing
  else; what a site's build keeps of an entry point nothing is used of - each file through Angular's own
  linker and optimizations (the CLI's `JavaScriptTransformer`), then the CLI's esbuild - is nothing; and
  four first loads (the gate, the bar, the words, a button), built beside lazy pages that use every other
  entry point whole, take no file their page does not use, gain at most 1 kB from what shares a file with
  them, and stay under their limits (9, 21.5, 7.5 and 5.5 kB gzipped; the gate's took 14.7 kB on 0.2.0's
  layout, the words' 16.1).

Angular, the kit's class names:
- **Every class the kit puts in a page is its own**, BEM on the component's host class: a part `.x` of
  `<anotoki-y>` is `anotoki-y__x` (`anotoki-alert__icon`, `anotoki-dialog__panel`), a state `is-x` /
  `has-x` of the component `anotoki-y--x` / `anotoki-y--has-x` (`anotoki-button--primary`), of a part
  `anotoki-y__part--x` (`anotoki-top-bar__link--active`); the fields' shared parts are `anotoki-field`
  and `anotoki-field__*`, the Translations and Languages pages' `anotoki-translations-admin__*`;
  `visually-hidden` is `anotoki-visually-hidden`. A site's global `.icon` (genshin's filled every Apply
  result's icon) or `.panel` (the build analyzer's framed the inside of both dialogs) no longer reaches
  in. Nothing looks different: the showcase's screenshots, every page and overlay in light and dark, are
  the same pixels before and after.
- What a site must do: a spec that reads the kit's markup by class changes its selectors by that rule -
  among them what 0.2.0 named: `[data-confirm] .description` -> `.anotoki-dialog__description`,
  `[data-result] .heading` -> `.anotoki-alert__heading`, `.card-text` / `.result-text` / `.result-note`
  -> `.anotoki-migrations-page__card-text` / `__result-text` / `__result-note`, the status page's Sign in
  `is-link` -> `anotoki-button--link`, the bar's section `is-active` -> `anotoki-top-bar__link--active`
  (in the phone menu `anotoki-menu-item--active`). Known: the IAM's top bar spec (`.switcher`, `.row`,
  `.nav`, `.actions`, `.menu-head`, `.wordmark`, `is-active`) and Japanese Academy's specs
  (`[data-result] .heading`, `anotoki-brand .wordmark`). README, "Upgrading from 0.2.x".

Angular, the IAM's look (found as the IAM moved onto the kit; its look is the owner's):
- The switch's thumb is white in dark too - a new token, `switch-thumb`, white in both themes - and its off
  track in dark `border-strong`, so the thumb stands out of it at 4.8:1 (on `subtle` it would be 2.9:1)
  and the track out of every ground at 3:1; light is as it was.
- A field's label is 1.55 high again (1.4 made every labelled field 2 px shorter).
- An avatar's initials are 0.45 of its size again (0.42).
- `<anotoki-shell maxWidth="88rem">`: the frame as wide as the site says - 84rem by default, 88rem with a
  side navigation - with the family's bar inside lined up; the IAM's account pages are 88rem.

Fixed - the shadows (found on Piano Academy): `@anotoki/lib/styles` wrote a one-item shadow - `shadow-sm`
in both themes, `mark-shadow` in dark, or any one-item value a site gives `root()` - as Sass reads it back,
`(0 1px 2px …,)`, which no property takes: wherever it was read the shadow was dropped (cards, the primary
button, the segmented control's choice, the switch's thumb, the translations pages' bars), and the anotoki
mark lost its light outline in dark, on every site since 0.2.0. `root()`, `palette()`, `shared()` and
`token()` write such a list as its one item now. `scripts/check-package.mjs` compiles the tokens - the
family's and one-item values of a site's - and reads every component's styles: none may hold `(…,)`.

Package: `@anotoki/lib` 0.3.0; `scripts/check-package.mjs` knows the three entry points (translations is
eager: 8 kB at most; its admin pages never in it), and the core's fourteen.

CI: the Angular job checks the library's words are the JSON's (`bun run words --check`) before it builds.

Package: `.gitattributes` is an allow-list - GitHub's archive of a tag, which Composer installs, holds
`php/src`, `php/migrations`, `php/resources`, `composer.json`, README.md and CHANGELOG.md, and nothing
else - with LF line endings pinned for the SQL and the JSON; CI builds the archive and checks it.

## 0.2.0 - 2026-10-08

Angular only; the PHP half is unchanged (a site may keep `vendor/anotoki/lib` at 0.1.x).
The UI kit the owner asked for (round 2, 2026-10-07): one kit for the family, built
from the IAM's (the owner's preferred design), with the fixes made in one site's copy
only applied to all.

**Breaking** (README, "Upgrading from 0.1.x", has every edit):
- The gate's pages are a *marked* template: `<ng-template anotokiSitePages>`, with
  `SitePagesDirective` in the component's imports. 0.1.1's `contentChild(TemplateRef)`
  also took the template of a control-flow block given as the gate's content - a site
  still on the 0.1.0 form with a leading `@if` (or `@switch`, `@for`) had that block
  drawn as "the pages" for everybody, whatever its condition. **0.1.1 said the 0.1.0
  form "still works"; for such content it did not.** Plain content (no template) shows
  as in 0.1.0 again; an unmarked `<ng-template>` is no longer the pages (nothing is
  drawn; development warns).
- The Migrations page moved to its own entry point, `@anotoki/lib/migrations/page`:
  it was in every site's first load with the gate (genshin's initial bundle went over
  its budget). `@anotoki/lib/migrations` no longer exports it.
- The Migrations page and the status page are drawn with the kit: a site's specs that
  read their DOM change a few selectors (README).

Fixed:
- The status page reloads once the site is ready again **without** first marking it
  ready (`SiteStatus.checkForReload()`): reporting "ready" reopened the gate and made
  the site's pages in the page about to go (Japanese Academy's exam was made three
  times before a reload).
- The status page's Sign in has a 44 px target (the kit's link button).

New:
- `@anotoki/lib/styles` (Sass, `@use "@anotoki/lib/styles" as anotoki`): the family's
  tokens as `--anotoki-*` - one palette (the IAM's), light and dark, with the badge
  inks darkened to 4.5:1 (`success-text` 5.1:1, `warning-text` 5.3:1) and `border-strong`,
  the edge of every control (fields, selects, code boxes, radio cards, segmented
  controls, the bar's round buttons), at 3:1 on every ground: light `#7a8ca5` (3.17:1
  on `bg`, 3.43:1 on `surface`), dark `#5e72a3` (4.07:1 on `bg`, 3.35:1 on `surface-2`);
  the decorative `border` stays - written by
  `root($options)`, where a site gives its own colours (light and dark) and font;
  `palette()`, `shared()`, `token()`; `fonts` (Manrope, from the package's new
  dependency `@fontsource-variable/manrope`, built into the site's output); `base`,
  `utilities($prefix)`, `tables($prefix)`.
- `@anotoki/lib/ui`: `provideAnotokiUi` (language, the site's words per language, a
  `lookup` hook for a translations module, icons), `AnotokiWords` (the kit's ~50
  words built in for English and Slovak, informal), the icon registry and
  `<anotoki-icon>`, the button, spinner (+ `delay`), badge, alert (+ `announce="polite"`),
  card (+ `headingLevel`), empty and error states, page header (+ `headingId`), avatar
  (+ `shape`), segmented (new: the theme and language switches are made of it),
  autofocus, `uniqueId`, `keepOnScreen`, `mediaQuery`, `tabbable`.
- Entry points of their own: `ui/icons` (the family's other icons, data only),
  `ui/menu` (menu button, menu, items, separator; popover), `ui/dialog` (dialog,
  `AnotokiDialog.open()`, confirm), `ui/toast`, `ui/forms` (text field, textarea,
  password field, select, checkbox, switch, radio group, code input), `ui/tabs`,
  `ui/pagination`, `ui/drawer`, `ui/tooltip` (new, WCAG 1.4.13), `ui/copy`, `ui/qr`.
- `@anotoki/lib/shell`: `provideAnotokiShell`, `ThemeService` (the account's theme
  from the first frame; one save at a time, the latest last), `latestChoiceSaver`,
  the theme switch (segmented, with the refusal note), the language switcher (menu,
  segments or select; notes; keys kept inside), the brand ("anotoki {site} · admin
  panel"), the top bar (the family's one bar: inputs and two actions, never a site's
  service) and the frame (`<anotoki-shell>`: skip link, any bar, side navigation,
  `<main>`); `assets/theme-boot.js` (its storage key from its own tag).
- The fixes made in one copy only, now everybody's: the dialog's Tab skips every
  `tabindex="-1"` element; Tab and Shift+Tab out of a menu close it with the focus on
  its button (`preventDefault()`); keys pressed in the bar stay in it; disabled items
  are left out of the arrows; a waiting Sign in / Sign out keeps its item and the
  focus on the menu's button; menus close when the bar folds and when the person or
  the links change; the breakpoints are signals; menus and notes are kept on screen;
  the toast region is never named by a key; ids from `uniqueId()`.
- Also fixed on the way: the spinner's arc (it was a whole ring: `stroke-dasharray: 60`
  on a 59.7 circumference), the brand's words spaced for screen readers, a dialog's
  width taken from an ancestor's custom property, the checkbox's edge and the switch's
  off track at 3:1 (WCAG 1.4.11).
- `angular/scripts/check-package.mjs` (run by `bun run build`): each entry point's size
  and import boundaries. `angular/projects/showcase`: a development page with every
  piece (never published).

## 0.1.1 - 2026-10-07

Angular only; the PHP half is unchanged (a site may keep `vendor/anotoki/lib` at 0.1.0).

- `<anotoki-site-gate>` takes the pages as a template -
  `<anotoki-site-gate><ng-template><router-outlet /></ng-template></anotoki-site-gate>` - and
  makes them only while the site is open. Content given as it is (the 0.1.0 form, still
  working) is made by Angular whether it shows or not, so a page behind the status page
  ran and sent requests - whose failures a site may show as toasts. Sites should switch to
  the template. (0.2.0: "still working" was wrong for content that starts with a
  control-flow block - see 0.2.0.)
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
