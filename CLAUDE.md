# anotoki-lib

What the anotoki sites share (the IAM, genshin, survey, Piano Academy, Japanese
Academy, the build analyzer), in two halves with one version: the Composer
package `anotoki/lib` (`backend/src/`, namespace `Anotoki\Lib\`) and the npm package
`@anotoki/lib` (`frontend/projects/lib/`, one secondary entry point per family of
pieces: `ui` (re-exporting the core's pieces, an entry point each: `ui/config`,
`ui/button`, ...), `ui/menu`, `ui/dialog`, ..., the pieces of 0.6.0 (`ui/chips`,
`ui/link-card`, `ui/stat-tiles`, `ui/progress`, `ui/disclosure`, `ui/stepper`, `ui/labelled-group`,
`ui/select`, `ui/field`, `ui/piece-words`, `ui/side-nav`, `ui/current-link`; `ui/tabs` gained the link tabs;
the input pieces `ui/date-field`, `ui/slider`, `ui/color-field`, `ui/file-picker`, `ui/combobox`, `ui/rich-text`;
0.9.2's code editor `ui/code-editor` and the highlighters `ui/code-json`, `ui/code-sql`;
0.11.0's `ui/html-editor`, `ui/rich-html`, `ui/dates`, `ui/search`, `ui/multiselect`, `ui/audio-player`,
`ui/number-field`, `ui/fieldset`, `ui/file-size`, `ui/picture-preview`),
`shell`, `migrations`,
`migrations/page`, `migrations/maintenance` (0.11.0: the closed sign), `translations`, `translations/admin`, `translations/testing`,
`auth`, `auth/marker` (0.7.2), `auth/testing`, `people`, `people/page`, `admin` and its pages, `admin/frame` (0.10.0:
`<anotoki-admin-frame>`, the admin panel's frame), `site-settings` and `admin/site-settings` (0.11.0: the site
settings on a site's pages and the administrators' page), `site-settings/bar` and `site-settings/notice` (0.11.1:
the bar and the notice as drawn, which their elements fetch when there is something to draw), `feedback`,
`feedback/form` (with 0.8.0's `<anotoki-feedback-dialog>`), `error-report`, `error-report/marker`, `legal`,
`legal/pages`, `legal/about` and `legal/support` (0.8.0), `footer` (0.6.3), and the generated `words`,
`words/<namespace>`; the Sass module `styles/`). `README.md` says how a site
installs, uses and updates it, and how to release; `CHANGELOG.md` what each
version changed. Beside the halves, in neither: `deploy/` - `@anotoki/deploy`, the
sites' one build and deploy tool (0.9.0), an npm tarball of the same release, never
part of a site's upload (`deploy/README.md`).

## Commands

```
# PHP (repository root; on this family's Windows machines PHP 8 is `php8`)
php composer.phar install
vendor/bin/phpunit      # needs ANOTOKI_LIB_TEST_DB_CONFIG (a PHP file returning host, port,
                        # username, password - a site's config/database.local.php) or
                        # ANOTOKI_LIB_TEST_PGHOST/PGPORT/PGUSER/PGPASSWORD; every test case makes
                        # anotoki_lib_test_<random> and drops it

# Angular (frontend/)
bun install             # bun.lock is committed
bun run build           # ng build lib -> frontend/dist/lib, then scripts/check-package.mjs (sizes, boundaries,
                        # floors, first loads - through Angular's own linker and esbuild)
bun run test            # ng test lib --watch=false (Vitest + jsdom)
bun run showcase        # projects/showcase on :4320 - every piece, from the source; never published
bun run words           # the library's words from backend/resources/library-words.json, a namespace at a time:
                        # ui/config/src/library-words.ts (the kit's), words/<namespace>/, words/ (--check, in CI;
                        # a spec and LibraryWordsTest fail when stale)

# The deploy tool (deploy/; npm, its own package-lock.json)
npm ci
npm test                # node --test - no network, no host

# Formatting (repository root; bun install there first)
bun run format:check    # the family's Prettier setup, both halves (bun run format writes); .prettierignore keeps out
                        # the generated words, the SQL and the Markdown
```

## Conventions

- **The deploy tool knows no site either**: what differs between sites is a setting
  in the site's `backend/composer.json` (`extra["anotoki-deploy"]`, the table in
  `deploy/README.md`), never a name or a branch in `deploy/`. It never writes,
  renames or deletes a site's `config/`, `storage/` or the folders it keeps
  `beside`, and every remote path goes through `remotePath()`. Its version is the
  library's (CI checks it).
- **Nothing site-specific in the library**: a site's differences are options and
  hooks (`prepare`, `ready`, `beforeFile`, `beforeApply`, the open paths, the
  config's closures, the kit's inputs and adapters), never a site's name, path,
  key or service in the code. The family's own facts are the one exception, the
  same on every site: the operator, and the About page's projects with their
  addresses and the Support page's Ko-fi address (0.8.0, the owner's words) -
  in code, never in a string.
- **Never change a site's bookkeeping table**: read every shape that exists
  (`filename` or `name`; `folder` or none; TIMESTAMP holding UTC or TIMESTAMPTZ;
  with or without `id`). A site adopts an older shape itself, in `prepare`.
- **A gate that compares lists compares them as sets, or sorts both sides
  `COLLATE "C"`** (the build analyzer's live database, 2026-10-18): a host's
  collation may skip punctuation (glibc's `en_US.utf8`, ICU's
  `en-US-u-ka-shifted`), so names ordered as TEXT and the same names ordered as
  the catalog's `name` type (byte order) come out in two orders, and an Apply is
  refused. So for a migration's `DO $$` check and for the runtime alike: a set
  (`= ANY`, `EXCEPT`, `array_diff`), or both orders the bytes'. The one such
  comparison in a released file, `anotoki_translations/001`'s primary keys, is
  harmless (its names sort alike in every collation) and stays as it is;
  `SchemaTest` applies the library's sets on `en-US-u-ka-shifted` (PostgreSQL 15+).
- **Words**: the administrators' words are English; the visitors' words are built
  in for `en` and `sk` (Slovak informal, "ty") and overridable per language. The
  library's words (`anotoki.*`) have one source, `backend/resources/library-words.json`:
  the SQL of `anotoki_translations` is held to it by a test, and the Angular half's
  built-in words are generated from it a namespace at a time (`bun run words`;
  prettier leaves them alone): the kit's namespaces into `ui/config/src/library-words.ts`
  (read through `AnotokiWords` and the translations module), every other module's
  into `@anotoki/lib/words/<namespace>` - imported by that module alone, which
  registers them with the translations module from its `provide*()`
  (`provideLibraryWords`); `@anotoki/lib/words` (all of them) is for specs and the
  showcase, never a module. A new one is a JSON entry and a new library migration
  (`anotoki_translations/003` brought `anotoki.signIn.*`; released files are never
  edited). A changed one is a JSON entry and a new file that rewords only the
  strings still in the earlier file's words and that nobody saved - `WHERE value =
  '<the earlier words>' AND updated_by IS NULL`, its gate's "old words left" check
  on those rows alone - so a site's own wording, and an administrator's deliberate
  save of the old words, stay (010 matched on the value alone: harmless, as no site
  applied 005 without 010, but the next one adds `updated_by IS NULL` - the IAM's
  review of 2026-10-14). A module's new words are a namespace of its own and its registration,
  never the kit's - no first load of the kit or of the translations module carries
  them. Two exceptions, read by their readers themselves and never registered
  (`READ_BY_THEIR_PAGES` in both scripts), their Slovak impersonal (no "ty", no
  "Vy": they fit the formal survey too): words its lazy pages alone say, pages of
  text (the legal pages' `anotoki.legal.*`; 0.8.0's About and Support pages'
  `anotoki.about.*`, `anotoki.support.*`), and the words of the kit's pieces
  that are entry points of their own (0.6.0: `anotoki.chips.*`,
  `anotoki.progress.*`, `anotoki.stepper.*`, `anotoki.tabs.*`, `anotoki.dateField.*`, `anotoki.colorField.*`,
  `anotoki.filePicker.*`, `anotoki.combobox.*`, `anotoki.richText.*` - a piece has no provide*(), and provideAnotokiUi is in
  every first load) and of the family's footer (0.6.3: `anotoki.footer.*`, which has
  none either - they come in the footer's own first load, and no other), and 0.11.0's site settings' pieces' and
  closed sign's (`anotoki.siteSettings.*`, `anotoki.maintenance.*`), each read
  through `ui/piece-words`' `pieceWords()`, the
  site's string first. Names (a site's sections, brand area) are never kit words.
- **Every change has tests** (PHPUnit against real PostgreSQL; Vitest for Angular)
  that must pass on PHP 8.2 - write no newer syntax - and the newest PHP.
- **Versions**: semver; while 0.x a minor bump may break, and CHANGELOG.md says
  how. Both halves share one version: `frontend/projects/lib/package.json`,
  `ANOTOKI_LIB_VERSION` and the git tag `vX.Y.Z` (the release workflow refuses a
  tag that does not match).
- **Sites install from GitHub**: Composer's VCS repository (GitHub's archive of
  the tag, which `.gitattributes` trims) and the release's tarball. README.md
  says how; keep it in step with every change to how a site uses the library.
- Angular: standalone, OnPush, zoneless-safe, signals; every component is three
  files (`.ts`, `.html`, `.scss`); no UI library, no CDK; colours only through
  the `--anotoki-*` custom properties, read with `kit.token(name)` (`sass/_kit.scss`,
  internal), whose fallback is the family's value on `light-dark()`; a private
  custom property is named for its component (`--_dialog-width`) and set where it
  is read - they inherit; every component sets each property it relies on (a
  site's `button {}` must not show through); every class it puts in a page is its
  own, BEM on its host class - `anotoki-alert__icon`, `anotoki-button--primary`,
  `anotoki-top-bar__link--active`; the fields' shared parts `anotoki-field__*`;
  `anotoki-visually-hidden` - so no site's global `.icon` or `.panel` reaches in;
  works at 390 px (the bar at 360); headings, roles and focus for keyboards and
  screen readers; `afterNextRender` for focus after a render.
- **Entry points**: a site's build places whole files in its chunks, and an
  entry point is one file - what lazy pages alone use gets an entry point of its
  own. The ui core is a file per piece (`ui/config`, `ui/button`, ...), which `ui`
  re-exports and nothing else; the library imports a piece from its own entry
  point, never through `ui` (a first page that reaches `ui` takes every piece any
  page uses). Top-level code a site's build cannot prove harmless - a call or a
  `new` of anything but an InjectionToken - is kept whether used or not: mark it
  `/* @__PURE__ */`. `scripts/check-package.mjs` holds the eager ones to their
  limits (and the big lazy input pieces of 0.6.0, the code editor and its highlighters, and 0.11.0's HTML editor, safe
  view, dates, multiselect, number field and audio player to limits of their own, `LAZY_LIMITS`),
  every entry point to its imports (the shell imports only the core's
  pieces and `ui/menu`; nothing imports the shell; auth imports the core's pieces,
  `migrations`, `error-report/marker` (a token, never the reporter) and `auth/marker` (whom a request is
  for - `ISSUED_AS`, `issuedAs()` - which imports nothing); `feedback/form` its configuration, the kit's fields
  and dialog (0.8.0: the form in the dialog, its buttons in the dialog's footer) and `auth/marker` (its message is
  anybody's), never `auth`; `people/page` the kit and `people`, which imports nothing;
  `legal/pages` the kit, `legal` and the feedback form by import() alone; `legal/about` and `legal/support` the
  core's pieces, `legal` and their own words; `footer`
  the core's pieces, `legal`, its words and - by import() alone - `feedback/form`
  (its dialog: the kit's dialog and the form; `footer/feedback` before 0.8.0); `admin/frame` the core's pieces and
  `ui/side-nav` - never the shell: the theme's switch comes in its slot (0.10.0); `migrations` the closed sign
  (`migrations/maintenance`) by import() alone, which imports the core's pieces, `ui/piece-words` and its words, never
  the module that loads it; `site-settings` the kit's configuration and - by import() alone - `site-settings/bar` and
  `site-settings/notice` (0.11.1: the bar and the notice as drawn, each the core's pieces, `ui/piece-words` and its
  words, never the module that loads it, fetched only when there is something to draw: no first load carries what they
  draw); `admin/site-settings` an admin page's, `migrations` and `site-settings` (0.11.0); `ui/field` the kit's
  configuration alone (0.11.1: it counts its ids itself - ui/dom's one file stays out of a field's first load);
  `ui/code-editor` the core's
  pieces, `ui/field` and the highlighters, `ui/code-json` and `ui/code-sql`, which import nothing (`migrations/page`
  takes `ui/code-sql` alone, never the editor); 0.11.0's `ui/rich-html` and `ui/search` nothing, `ui/file-size` and
  `ui/dates` the kit's configuration (and the dates their words), `ui/html-editor` the core's pieces, `ui/field`,
  `ui/rich-text`, `ui/rich-html`, `ui/menu`, `ui/color-field`, `ui/dialog`, `ui/forms` and its words (the file picker
  takes `ui/file-size`, the combobox `ui/search`); a
  `words/<namespace>` is imported by its module, which
  registers it, and by `words` alone - never by the translations module) and to an
  empty floor, and the first loads of the gate, the bar, the
  words, a button, the sign-in, the footer and the site settings to their limits and to the namespaces of words
  their pages say. No bundle names innerHTML, outerHTML, insertAdjacentHTML or
  bypassSecurityTrust, comments included (the IAM's deploy check refuses such a
  release): the kit draws text.
- No composer.lock (a library); nothing sensitive in a file; never print a
  database password.
- **Signing in** (auth): the IAM's rules do not loosen here - RS256 and `typ`
  pinned, PKCE, the exact redirect, the same storage keys as the IAM's SDK; who a
  request is comes from a verified token only, never a cookie (the IAM's sign-in
  hint says nothing of who), and roles from the token, never the database.
- **People**: the site's own `users` table through a mapping - the library never
  makes or reshapes it, keeps no email, and the scrub only UPDATEs.
