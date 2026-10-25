# @anotoki/deploy

The anotoki sites' build and deploy tool, the same for every site: `anotoki-deploy`. It lives in the library's
repository but in neither half - Composer's archive and the npm package of `@anotoki/lib` never hold it, so it is never
part of a site's upload. A site installs it as a dev dependency of its `frontend/` from the tarball of the library's
GitHub release (`anotoki-deploy-X.Y.Z.tgz`, beside `anotoki-lib-X.Y.Z.tgz`).

## The site's folder on the host

```
<the folder the (sub)domain serves>
├─ .htaccess   the switch: every request -> frontend/   (written once: anotoki-deploy switch)
├─ frontend/   the built app, index.php, .htaccess      (a release: replaced whole)
├─ backend/    the PHP code, release.json               (a release: replaced whole)
├─ config/     *.local.php - the site's settings        (never written by a deploy)
└─ storage/    backups, logs, keys, the setup's lock    (never written by a deploy)
```

A release is `frontend/` and `backend/`. They go up as `frontend.new/` and `backend.new/` beside the live ones, are
checked file by file, and are swapped in by renames; the live ones are first copied home and then kept as `.old` for a
rollback. Nothing of a release is ever stale on the host, and nothing of the host (`config/`, `storage/`, the folders a
site keeps `beside`) is ever in a release.

The switch sends every request into `frontend/` (`/api/...` too: `frontend/.htaccess` hands the backend's addresses to
`index.php`, which requires `../backend/<entry>` - and the code reads the address the browser asked for,
`REQUEST_URI`, which no rewrite changes). `backend/`, `config/` and `storage/` are never reachable by an address. A
missing file with an extension (an old bundle after a release) is a 404, never the app.

## What a site's PHP does once

The code finds its state beside `backend/` on the host and inside it in a checkout - one rule for every site:
**`<backend>/release.json` is a file: the state root is the folder above `backend/`; otherwise it is `backend/`
itself.** `config/` and `storage/` (and anything a site keeps beside the release) are under the state root. A relative
path in a settings file is relative to the state root.

## Commands

Run in the site's `frontend/`, where it is installed, as `bun run anotoki-deploy <command>`: `bun run` finds it
whichever tool installed `node_modules/`, and never fetches a package (on Windows `npx` misses bun's links and asks the
npm registry for `anotoki-deploy` instead). The tool finds the site's repository from any folder of it (`--root` names
it otherwise):

```
anotoki-deploy build [--out DIR] [--skip-frontend]       the site's build, then the release in DIR (default dist/)
                     [--frontend DIR]                    (--frontend: an app built already - a site's tests)
anotoki-deploy deploy --backups DIR [--dist DIR] [--go]   the release up, the live one copied into DIR, swapped
anotoki-deploy rollback [--go]                           the .old release back
anotoki-deploy switch [--go] [--undo]                    once per site: the site's .htaccess becomes the switch
anotoki-deploy status                                    what is on the host
anotoki-deploy content <name> [--go]                     content kept beside the release, only ever added to
anotoki-deploy smoke [--dist DIR]                        the live site, checked
```

A command that changes the host only says what it would do without `--go`. After a swap or a switch the live site is
checked over HTTPS: the app (the release just sent), the site's `smoke` paths, an old bundle answering 404, and
`backend/`, `config/` and `storage/` never served.

The SFTP login is never in a repository: `ANOTOKI_DEPLOY_SECRETS` names a `secrets.json`
(`{ "sftp": { "host", "port", "username", "password" } }`) and `hostkey.txt` beside it holds the server's pinned key
(`SHA256:...`).

The first time for a site that ran the old way (everything uploaded over one folder): `deploy --go` puts `frontend/` and
`backend/` beside the old files (the site does not change), then `switch --go` makes the site's `.htaccess` the switch -
the one before kept as `.htaccess.flat`, and a top-level folder's `.htaccess` that rewrites (the old `api/.htaccess`)
set aside, or it would keep its addresses on the old files. `switch --undo --go` puts both back. The old files can be
deleted once the site runs well.

## The site's settings

`backend/composer.json`, `extra["anotoki-deploy"]` - the only place a site says anything:

| Setting | Default | What |
| --- | --- | --- |
| `site` | - | the site's short name (`survey`) |
| `remote` | - | the site's folder on the host (`/anotoki.eu/sub/survey`) |
| `url` | - | its address (`https://survey.anotoki.eu`) |
| `include` | `api`, `src`, `config`, `migrations`, `vendor`, `setup.php` | what goes into `backend/`: folders, files or globs (`*`, `**`) in the site's `backend/`; a missing one is skipped. `*.local.php` and dot-files never go |
| `exclude` | none | what of those stays out |
| `routes` | `api` | the backend's addresses (path prefixes, or exact names: `robots.txt`, `sitemap.xml`), sent to `index.php` before any file of the app - so the build refuses a file of the app at one (a static `robots.txt` kept from before its PHP answered it): it would never be served |
| `entry` | `api/index.php` | the backend's front door in `backend/` |
| `csp` | none | the Content-Security-Policy |
| `headers` | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` | more headers, or another value (`null` drops one) |
| `noCache` | none | files of the app asked for again each time, beside `index.html` (`theme-boot.js`, `changelog.json`) |
| `types` | none | media types (`{ ".avif": "image/avif" }`) |
| `beside` | none | folders at the top of the site's folder served as they are (a site's uploads): the switch lets them through |
| `before` | none | commands run in the repository before the frontend's build (a site's own checks) |
| `frontendBuild` | `npm run build` | the frontend's build, run in `frontend/` |
| `project` | the one application | the Angular project in `angular.json` whose output is the app |
| `smoke` | none | paths that answer 200 after a release (`/api/health`) |
| `content` | none | `{ "audio": { "from": "backend/data/audio", "to": "content/audio" } }`: kept on the host beside the release, only ever added to (`content audio`) |

The app's folder is read from `angular.json` (the project's `outputPath`, plus `browser/`); Angular's
`3rdpartylicenses.txt` beside it goes into `frontend/` too.

## Working on it

```
npm ci          # in deploy/
npm test        # node --test: the settings, the files it writes, the build into a folder - no network
```

No site's name, path or special case in the code: what differs is a setting. Its version is the library's (CI checks
it); the library's release workflow packs it with the Angular half.
