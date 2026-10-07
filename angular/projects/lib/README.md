# @anotoki/lib

What the anotoki sites share, the Angular half (Angular 21, standalone, zoneless,
signals). The PHP half is the Composer package `anotoki/lib`; both halves share one
version.

- `@anotoki/lib` - `ANOTOKI_LIB_VERSION`, the installed version.
- `@anotoki/lib/migrations` - one behaviour for every site while its database
  waits for an update: `SiteStatus` and `siteStatusInterceptor`,
  `<anotoki-site-gate>` around the router outlet, `<anotoki-site-status>`,
  `<anotoki-update-banner>` and the admin page `<anotoki-migrations-page>`,
  configured with `provideAnotokiMigrations(...)`.

Installed from the GitHub release's tarball, not from a registry. How a site
installs, configures and updates it: the repository's README,
https://github.com/irelevant25/anotoki-lib
