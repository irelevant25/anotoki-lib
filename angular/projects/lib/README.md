# @anotoki/lib

What the anotoki sites share, the Angular half (Angular 21, standalone, zoneless,
signals). The PHP half is the Composer package `anotoki/lib`; both halves share one
version.

- `@anotoki/lib` - `ANOTOKI_LIB_VERSION`, the installed version.
- `@anotoki/lib/styles` (Sass) - the family's tokens (one palette, light and dark),
  Manrope, the base, utilities and tables: `@use "@anotoki/lib/styles" as anotoki`.
- `@anotoki/lib/ui` - the UI kit's core, a piece per entry point, all re-exported
  here (import each from its own, for a small first load): `ui/config`
  (configuration and words; the kit's library words, `KIT_LIBRARY_WORDS`), `ui/icon`,
  `ui/dom`, `ui/button`, `ui/spinner`, `ui/badge`, `ui/alert`, `ui/card`,
  `ui/empty-state`, `ui/error-state`, `ui/page-header`, `ui/avatar`,
  `ui/segmented`, `ui/autofocus`; and the kit's other entry points `ui/icons`,
  `ui/menu`, `ui/dialog`, `ui/toast`, `ui/forms`, `ui/tabs` (with 0.6.0's link
  tabs), `ui/pagination`, `ui/drawer`, `ui/tooltip`, `ui/copy`, `ui/qr`, and
  0.6.0's `ui/chips`, `ui/link-card`, `ui/stat-tiles`, `ui/progress`,
  `ui/disclosure`, `ui/stepper`, `ui/labelled-group`, `ui/side-nav` (the side
  navigation and its phone drawer), `ui/select` (the select alone, for a first
  page), `ui/field`, `ui/piece-words` (how those pieces read their own words),
  `ui/current-link` (which of a navigation's links is the page's), and the input
  pieces `ui/date-field` (a date typed in the reader's format or chosen in a
  calendar; ISO values), `ui/slider` (the native range input with marks) and
  `ui/color-field` (a colour, its code and suggested colours; `#rrggbb`).
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
  `anotokiAuthInterceptor`, the guards, `AccountPreferences`,
  `<anotoki-auth-callback>` and `<anotoki-sign-in-failure>` (the screen of a
  sign-in that failed, a site can route to), configured with `provideAnotokiAuth(...)`.
- `@anotoki/lib/auth/testing` - `provideTestAnotokiAuth()` and `FakeAuthClient` for a
  site's specs.
- `@anotoki/lib/people` - `provideAnotokiPeople(...)` and the shape of the People
  API (the PHP half's `PeopleRoutes`); `@anotoki/lib/people/page` - the admin
  page `<anotoki-people-page>`, for a lazy admin route.
- `@anotoki/lib/legal` - the legal pages' configuration (`provideAnotokiLegal`: the
  site's facts, its paths, the operator) and `<anotoki-legal-links>`, Terms · Privacy
  · Contact for a footer; `@anotoki/lib/legal/pages` - the Terms, Privacy and Contact
  pages, each for a lazy route, with their words.
- `@anotoki/lib/words` - the library's own words, every module's: `LIBRARY_WORDS`
  (for a site's specs); `@anotoki/lib/words/<namespace>` - one module's
  (`/site-status`, `/sign-in`, `/feedback`, `/legal-links`), imported by that module
  alone, which registers them with the translations module (`provideLibraryWords`),
  and `/legal`, which the legal pages read themselves, and `/chips`, `/progress`,
  `/stepper`, `/tabs`, `/date-field` and `/color-field`, which those pieces read
  themselves. Generated from
  `php/resources/library-words.json`.

Installed from the GitHub release's tarball, not from a registry. How a site
installs, configures and updates it: the repository's README,
https://github.com/irelevant25/anotoki-lib
