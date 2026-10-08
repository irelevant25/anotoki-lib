# Changelog

One version for both halves: the Composer package `anotoki/lib` (from the git tag)
and the npm package `@anotoki/lib` (`angular/projects/lib/package.json`). While the
version is 0.x, a minor version may break what a site uses - each such change is
said here, with what a site must do.

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
