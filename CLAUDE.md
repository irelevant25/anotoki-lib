# anotoki-lib

What the anotoki sites share (the IAM, genshin, survey, Piano Academy, Japanese
Academy, the build analyzer), in two halves with one version: the Composer
package `anotoki/lib` (`php/src/`, namespace `Anotoki\Lib\`) and the npm package
`@anotoki/lib` (`angular/projects/lib/`, one secondary entry point per family of
pieces: `ui` (re-exporting the core's pieces, an entry point each: `ui/config`,
`ui/button`, ...), `ui/menu`, `ui/dialog`, ..., `shell`, `migrations`,
`migrations/page`, `translations`, `translations/admin`, `translations/testing`;
the Sass module `styles/`). `README.md` says how a site
installs, uses and updates it, and how to release; `CHANGELOG.md` what each
version changed.

## Commands

```
# PHP (repository root; on this family's Windows machines PHP 8 is `php8`)
php composer.phar install
vendor/bin/phpunit      # needs ANOTOKI_LIB_TEST_DB_CONFIG (a PHP file returning host, port,
                        # username, password - a site's config/database.local.php) or
                        # ANOTOKI_LIB_TEST_PGHOST/PGPORT/PGUSER/PGPASSWORD; every test case makes
                        # anotoki_lib_test_<random> and drops it

# Angular (angular/)
bun install             # bun.lock is committed
bun run build           # ng build lib -> angular/dist/lib, then scripts/check-package.mjs (sizes, boundaries,
                        # floors, first loads - through Angular's own linker and esbuild)
bun run test            # ng test lib --watch=false (Vitest + jsdom)
bun run showcase        # projects/showcase on :4320 - every piece, from the source; never published
bun run words           # ui/config/src/library-words.ts from php/resources/library-words.json (--check, in CI;
                        # a spec fails when stale)
```

## Conventions

- **Nothing site-specific in the library**: a site's differences are options and
  hooks (`prepare`, `ready`, `beforeFile`, `beforeApply`, the open paths, the
  config's closures, the kit's inputs and adapters), never a site's name, path,
  key or service in the code.
- **Never change a site's bookkeeping table**: read every shape that exists
  (`filename` or `name`; `folder` or none; TIMESTAMP holding UTC or TIMESTAMPTZ;
  with or without `id`). A site adopts an older shape itself, in `prepare`.
- **Words**: the administrators' words are English; the visitors' words are built
  in for `en` and `sk` (Slovak informal, "ty") and overridable per language. The
  library's words (`anotoki.*`) have one source, `php/resources/library-words.json`:
  the SQL of `anotoki_translations` is held to it by a test, and the Angular half's
  `ui/config/src/library-words.ts` is generated from it (`bun run words`) - the kit's
  words (`ui/config/src/words.ts`, read through `AnotokiWords`) and the status page's
  come from there; a new one is a JSON entry and a new library migration. Names
  (a site's sections, brand area) are never kit words.
- **Every change has tests** (PHPUnit against real PostgreSQL; Vitest for Angular)
  that must pass on PHP 8.2 - write no newer syntax - and the newest PHP.
- **Versions**: semver; while 0.x a minor bump may break, and CHANGELOG.md says
  how. Both halves share one version: `angular/projects/lib/package.json`,
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
  limits, every entry point to its imports (the shell imports only the core's
  pieces and `ui/menu`; nothing imports the shell) and to an empty floor, and the
  first loads of the gate, the bar, the words and a button to theirs.
- No composer.lock (a library); nothing sensitive in a file; never print a
  database password.
