# anotoki-lib

What the anotoki sites share (the IAM, genshin, survey, Piano Academy, Japanese
Academy, the build analyzer), in two halves with one version: the Composer
package `anotoki/lib` (`php/src/`, namespace `Anotoki\Lib\`) and the npm package
`@anotoki/lib` (`angular/projects/lib/`, one secondary entry point per module:
`@anotoki/lib/migrations`). `README.md` says how a site installs, uses and
updates it, and how to release; `CHANGELOG.md` what each version changed.

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
bun run build           # ng build lib -> angular/dist/lib
bun run test            # ng test lib --watch=false (Vitest + jsdom)
```

## Conventions

- **Nothing site-specific in the library**: a site's differences are options and
  hooks (`prepare`, `ready`, `beforeFile`, `beforeApply`, the open paths, the
  config's closures), never a site's name in the code.
- **Never change a site's bookkeeping table**: read every shape that exists
  (`filename` or `name`; `folder` or none; TIMESTAMP holding UTC or TIMESTAMPTZ;
  with or without `id`). A site adopts an older shape itself, in `prepare`.
- **Words**: the administrators' words are English; the visitors' words are built
  in for `en` and `sk` (Slovak informal, "ty") and overridable per language.
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
  files (`.ts`, `.html`, `.scss`); no UI library; colours only through the
  `--anotoki-*` custom properties with `light-dark()` fallbacks (`_theme.scss`);
  works at 360 px; headings, roles and focus for keyboards and screen readers.
- No composer.lock (a library); nothing sensitive in a file; never print a
  database password.
