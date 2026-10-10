# @anotoki/lib

What the anotoki sites share, the Angular half (Angular 21, standalone, zoneless,
signals). The PHP half is the Composer package `anotoki/lib`; both halves share one
version.

- `@anotoki/lib` - `ANOTOKI_LIB_VERSION`, the installed version.
- `@anotoki/lib/styles` (Sass) - the family's tokens (one palette, light and dark),
  Manrope, the base, utilities and tables: `@use "@anotoki/lib/styles" as anotoki`.
- `@anotoki/lib/ui` - the UI kit's core, a piece per entry point, all re-exported
  here (import each from its own, for a small first load): `ui/config`
  (configuration and words; the library's own words, `LIBRARY_WORDS`), `ui/icon`,
  `ui/dom`, `ui/button`, `ui/spinner`, `ui/badge`, `ui/alert`, `ui/card`,
  `ui/empty-state`, `ui/error-state`, `ui/page-header`, `ui/avatar`,
  `ui/segmented`, `ui/autofocus`; and the kit's other entry points `ui/icons`,
  `ui/menu`, `ui/dialog`, `ui/toast`, `ui/forms`, `ui/tabs`, `ui/pagination`,
  `ui/drawer`, `ui/tooltip`, `ui/copy`, `ui/qr`.
- `@anotoki/lib/shell` - the theme (service and switch), the language switcher, the
  brand, the family's top bar and the frame; `assets/theme-boot.js`.
- `@anotoki/lib/migrations` - one behaviour for every site while its database waits
  for an update: `SiteStatus` and `siteStatusInterceptor`, `<anotoki-site-gate>`
  around the router outlet, `<anotoki-site-status>`, `<anotoki-update-banner>`,
  configured with `provideAnotokiMigrations(...)`.
- `@anotoki/lib/migrations/page` - the admin page `<anotoki-migrations-page>`.
- `@anotoki/lib/translations` - a site's words: `TranslationService` (the language
  and the strings, from the site's bundle route, with English under them), the
  `translate` and `translatePlural` pipes, the wiring into the kit's words and the
  shell's language switcher, `siteStatusWords()`, `anotokiUnsavedChangesGuard`;
  configured with `provideAnotokiTranslations(...)`.
- `@anotoki/lib/translations/admin` - the admin pages `<anotoki-translations-page>`
  and `<anotoki-languages-page>`, and `LocalizationDrafts`.
- `@anotoki/lib/translations/testing` - `provideTestTranslations()` for a site's specs.
- `@anotoki/lib/auth` - signing in through the anotoki IAM: its browser client
  (the IAM SDK 1.2.0, ported, with the same storage), `AnotokiAuth` (the session
  as signals, the sign-in hint's silent hop, following the IAM),
  `anotokiAuthInterceptor`, the guards, `AccountPreferences` and
  `<anotoki-auth-callback>`, configured with `provideAnotokiAuth(...)`.
- `@anotoki/lib/auth/testing` - `provideTestAnotokiAuth()` and `FakeAuthClient` for a
  site's specs.

Installed from the GitHub release's tarball, not from a registry. How a site
installs, configures and updates it: the repository's README,
https://github.com/irelevant25/anotoki-lib
