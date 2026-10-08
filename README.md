# anotoki-lib

What the anotoki sites share - the IAM, genshin, the survey site, Piano Academy,
Japanese Academy and the build analyzer - in one library with two halves and one
version:

| Half | Package | Where |
| --- | --- | --- |
| PHP 8.2+, Slim 4, PostgreSQL | `anotoki/lib` (Composer) | `composer.json`, `php/src/` |
| Angular 21 (standalone, zoneless, signals) | `@anotoki/lib` (npm tarball) | `angular/projects/lib/` |

Version 0.2.0 holds:

- **migrations** - the engine that brings a site's database up to date, and one
  behaviour for every site while an update waits (both halves);
- **the UI kit** (Angular) - the family's styles and palette
  (`@anotoki/lib/styles`), its components (`@anotoki/lib/ui` and its entry
  points) and its top bar and frame (`@anotoki/lib/shell`).

The PHP half is unchanged since 0.1.0.

## The behaviour

The server decides a state for every request:

| state | when |
| --- | --- |
| `not_set_up` | the site's settings files are missing or invalid |
| `update_pending` | the settings are fine and at least one migration file is ready to apply |
| `unavailable` | the settings are fine but the database cannot be reached |
| `ready` | otherwise |

- `not_set_up`: every API path answers `503 {"code":"not_set_up","installed":…,"message":…}`,
  with `"setup":"/setup.php"` only while the site was never installed
  (`storage/installed.lock`, which a site's installer writes on a real host).
- `update_pending` (every site but the IAM blocks): every API path answers
  `503 {"code":"update_pending","message":"The site is being updated. Try again in a few minutes."}`
  with `Retry-After: 60` - except the site's open paths: its boot/sign-in
  configuration, its translations, its health check, the status path and the
  admin migrations routes. So people can sign in, the pages have their words,
  and an administrator reaches Apply.
- What people see:
  - visitors and signed-in people who are not the site's ADMIN: "The site is
    being updated", in their language, checking again by itself and reloading
    when the site is back; no error, no code, no button but a quiet "Sign in"
    while nobody is signed in (how an administrator gets in);
  - the site's ADMIN: "A database update is waiting" and "Open Migrations"; the
    Migrations page works, nothing else does;
  - never set up: "This site is not set up yet" and "Open the setup page";
  - set up once but not answering, or unavailable: "The site is not available
    right now", checking again by itself - never the setup page.
- The IAM keeps answering while an update waits (`blockWhilePending: false`);
  its admin panel shows its administrators one line, "A database update is
  waiting", linking to Migrations.

## Installing it in a site

PHP - in `backend/composer.json`:

```json
"repositories": [{ "type": "vcs", "url": "https://github.com/irelevant25/anotoki-lib" }],
"require": { "anotoki/lib": "^0.1" }
```

then `php composer.phar update anotoki/lib --prefer-dist` in `backend/`. Composer
takes the version from the git tag and installs GitHub's archive of it, which
leaves out the Angular workspace, the tests and the workflows
(`.gitattributes`). Where the site uploads `vendor/`, `vendor/anotoki/lib` goes
with it. (0.2.0 changed only the Angular half: `^0.1` keeps a site's PHP half at
0.1.x, which is the same code.)

Angular - in `frontend/package.json`:

```json
"@anotoki/lib": "https://github.com/irelevant25/anotoki-lib/releases/download/v0.2.0/anotoki-lib-0.2.0.tgz"
```

then `bun install` in `frontend/` (and `npm install` too where the site keeps a
`package-lock.json`, so both lock files agree). Peer dependencies:
`@angular/core`, `@angular/common`, `@angular/router` ^21.2 and `rxjs` ^7.8. The
package brings Manrope's font files with it (its dependency
`@fontsource-variable/manrope`); see "Setting a site up" below.

**Updating** to a new version: PHP - change the constraint where the new
version needs it (0.x: a minor version may break - read CHANGELOG.md), then the
same `composer update anotoki/lib --prefer-dist`; Angular - the new release's URL
in `package.json`, then `bun install`, and the edits in "Upgrading" below.

## The PHP half

```php
use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;

$migrator = fn (): Migrator => new Migrator(db(), [new MigrationSet('survey', __DIR__ . '/../migrations/survey')]);

$state = new SiteState(
    settingsProblem: fn (): ?string => settingsProblem(),          // null once config/*.local.php are complete
    installed: fn (): bool => is_file(storageDir() . '/installed.lock'),
    migrator: $migrator,                                            // only called once the settings are complete
    // blockWhilePending: false,                                    // the IAM: keep answering while an update waits
);

$app->add(new SiteGate($state, $app->getResponseFactory(), [
    '/api/auth/config',                     // exact paths...
    '~^/api/translations/[a-z-]+$~D',       // ...or a regular expression when it starts with '~' (end it with D)
    '/api/health',
    '~^/api/admin/migrations(/file|/apply)?$~D', // exactly the three routes - never a prefix
]));

MigrationsRoutes::status($app, $state);                            // GET /api/site-status
MigrationsRoutes::admin($app, '/api/admin/migrations', $migrator, function ($request, array $result): void {
    // after every Apply that was not busy: audit, clear caches
})->add($requireAdmin);                                             // the site's ADMIN check (from the token)
```

- `Migrator` - `files($set)`, `status()` and `applicable()` (read only: they never
  create anything), `apply()`, `source($set, $name)`, `ensureTable()`. Each file
  runs in a transaction of its own with its record; the run stops at the first
  file that fails (rolled back whole; later sets never run), and the result
  names it with the database's error: `statement N of M: <message>` and the
  statement's first six lines. One apply at a time: every apply takes
  `pg_try_advisory_lock` (`DEFAULT_LOCK`, or the site's `lock`) and answers
  `busy` when another holds it. The connection is used as given and needs
  `PDO::ERRMODE_EXCEPTION`.
- Options: `table` (`migrations`), `lock`, `split` (false sends a file in one
  `exec`), and hooks: `ready(set, name, sql)` (false: a draft - it and every file
  after it wait; drafts never stop the site), `prepare(pdo)` (write paths only,
  before the table is created or used: adopt an older shape there),
  `beforeFile(pdo, set, name)` (inside the file's transaction),
  `beforeApply(pdo, files)` (once; its string is the result's `note`; throwing
  ends the apply with nothing applied).
- The bookkeeping table is read and written in every shape the sites have, and
  never changed: the file in `filename` (or `name`), the set in `folder` where
  the table has one (required with more than one set), `applied_at` a TIMESTAMP
  holding UTC or a TIMESTAMPTZ (answered as ISO 8601 UTC, `…Z`). A missing table
  is created as `(id SERIAL PRIMARY KEY, filename VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE (filename))`, with
  `folder VARCHAR(64) NOT NULL` and `UNIQUE (folder, filename)` for more than one
  set. A table it cannot read (no file column) counts as nothing applied until
  `prepare` adopts it.
- `Splitter::split($sql)` - the statements of a file: a `;` ends one only outside
  comments, strings (`'…'`, `E'…'`), quoted names and dollar-quoted blocks.
- `MigrationsRoutes::admin` answers `GET $base` (`Migrator::status()`),
  `GET $base/file?set=&name=` (the SQL, or 404) and `POST $base/apply` (200 with
  `applied`, `failed`, `error`, `note` - a failed file is still a 200 - or 409
  `busy`). The site's admin check must not need tables a pending migration makes.

## The Angular half

One secondary entry point per family of pieces: a whole entry point lands in the
chunk of whatever imports it, so what only lazy pages use has an entry point of
its own and stays out of a site's first load.

| Entry point | Holds | Eager in a site |
| --- | --- | --- |
| `@anotoki/lib/styles` | Sass: the tokens (one palette, light and dark), Manrope, the base, utilities, tables | the site's `styles.scss` |
| `@anotoki/lib/ui` | configuration and words, icons, button, spinner, badge, alert, card, empty / error state, page header, avatar, segmented, autofocus, `uniqueId`, `keepOnScreen`, `mediaQuery`, `tabbable` | yes (small) |
| `@anotoki/lib/ui/icons` | the family's other icons, data only (`iconTrash`, `iconUsers`, ...) | what the site registers |
| `@anotoki/lib/ui/menu` | menu button, menu, menu item, separator; popover | yes (the bar) |
| `@anotoki/lib/ui/dialog` | dialog, `AnotokiDialog.open()`, `ConfirmService` + `<anotoki-confirm-host>` | where the host is in the root |
| `@anotoki/lib/ui/toast` | `ToastService` + `<anotoki-toast-host>` | yes |
| `@anotoki/lib/ui/forms` | text field, textarea, password field, select, checkbox, switch, radio group, code input | lazy pages only |
| `@anotoki/lib/ui/tabs`, `/pagination`, `/drawer`, `/tooltip`, `/copy`, `/qr` | one piece each | lazy pages |
| `@anotoki/lib/shell` | theme service and switch, language switcher, brand, top bar, frame, `latestChoiceSaver`; `assets/theme-boot.js` | yes (every page) |
| `@anotoki/lib/migrations` | site status, interceptor, gate, status page, update banner | yes (the gate) |
| `@anotoki/lib/migrations/page` | the admin Migrations page | a lazy admin route |

Every component is standalone, OnPush and zoneless-safe; colours only through
`--anotoki-*` custom properties, each read with the family's own value as its
fallback (on `light-dark()`), so a page that sets no tokens still gets the
family look; each component sets every property it relies on, so a site's
element rules (`button { ... }`) do not show through; host classes are
prefixed (`anotoki-card`, never `card`). Words the kit says come built in for
English and Slovak; names (a site's sections, brand area, "Back to ...") are
never kit words - the site passes them worded.

### Setting a site up

```json
// angular.json - build options: the kit's boot script next to index.html
"assets": [{ "glob": "**/*", "input": "public" }, { "glob": "theme-boot.js", "input": "node_modules/@anotoki/lib/assets", "output": "/" }],
"styles": ["src/styles.scss"]
```

```html
<!-- index.html, in <head>: the stored theme before the first paint (a file: no inline script for the CSP) -->
<script src="theme-boot.js" data-storage-key="anotoki-survey:theme"></script>
```

```scss
// src/styles.scss
@use "@anotoki/lib/styles" as anotoki;

@include anotoki.root;        // the family's palette; or root((light: (...), dark: (...), font-sans: ...)) - below
@include anotoki.fonts;       // Manrope's @font-face rules (its files come with the package)
@include anotoki.base;        // the page's font, colours, type, links, code, the focus ring, reduced motion
@include anotoki.utilities;   // .stack, .cluster, .form-grid, .muted, .facts, .skeleton ... ("anotoki-" prefix if they collide)
@include anotoki.tables;      // .table, .table-scroll, .table-stack
```

```ts
// app.config.ts
provideAnotokiUi(() => {
  const i18n = inject(TranslationService);
  return {
    language: () => i18n.effectiveLanguage(),   // 'en' in an admin panel
    words: { sk: { 'topbar.account': 'Váš anotoki účet' } },   // optional: the site's own words, per language
    lookup: (key) => (i18n.has('anotoki.' + key) ? i18n.t('anotoki.' + key) : null),   // optional: a translations module
    icons: { trash: iconTrash, users: iconUsers },   // the icons the site's own templates name
  };
}),
provideAnotokiShell(() => {
  const auth = inject(AuthService);
  const i18n = inject(TranslationService);
  return {
    theme: { storageKey: 'anotoki-survey:theme', account: () => auth.preferences()?.theme ?? null, save: (theme) => auth.savePreferences({ theme }) },
    languages: { current: () => i18n.language(), offered: () => i18n.languages(), choose: (code) => i18n.setLanguage(code) },
  };
}),
provideAppInitializer(() => inject(ThemeService)),   // the account's theme from the first frame
```

```html
<!-- the app's root template, once each -->
<anotoki-confirm-host />
<anotoki-toast-host />
```

Remove the site's own copies as it moves (its `ui/` pieces, its theme service,
its `theme-boot.js`, its `styles.scss` tokens): two theme services must never
run in one site. A site that loaded Manrope itself (`node_modules/@fontsource-variable/manrope/index.css`
in `angular.json`) drops that line for `anotoki.fonts`.

### `@anotoki/lib/styles`

- `root($options)` - the tokens on `:root`: light; dark under
  `prefers-color-scheme: dark` (unless `data-theme="light"`) and under
  `data-theme="dark"` (what `ThemeService` and `theme-boot.js` write); each
  palette with its `color-scheme`. Options: `light` and `dark` (maps of colours)
  and any shared token (`font-sans`, `font-mono`, `radius`, `control-height`,
  ...). A misspelt token name is a compile error.
- `palette(light | dark, $overrides)` and `shared($overrides)` - for a site that
  switches themes on a selector of its own.
- `token(name)` - `var(--anotoki-<name>, <the family's value>)`, for a site's own styles.
- `fonts` - Manrope, the family's font (`font-sans` names it first). Its files
  come from the package's dependency `@fontsource-variable/manrope`; the site's
  Angular build copies the subsets into its output (latin, latin-ext for Slovak,
  cyrillic, greek, vietnamese - each with its `unicode-range`, so a browser
  downloads only what a page uses).
- `base`, `utilities($prefix: "")`, `tables($prefix: "")` - the IAM's global
  styles; a site whose own `.page`, `.lead`, `.card` would collide passes
  `"anotoki-"`.

The tokens (each `--anotoki-<name>`, light and dark): `bg`, `surface`,
`surface-2`, `surface-3`, `surface-raised`, `border`, `border-strong`, `text`,
`muted`, `subtle`, `primary`, `primary-hover`, `primary-contrast`,
`primary-soft`, `primary-soft-text`, `accent`, `link`, `danger`, `danger-hover`,
`danger-contrast`, `danger-soft`, `danger-border`, `success`, `success-text`,
`success-soft`, `success-border`, `warning`, `warning-text`, `warning-soft`,
`warning-border`, `info`, `info-soft`, `info-border`, `ring`, `focus`,
`backdrop`, `skeleton`, `skeleton-shine`, `shadow-sm`, `shadow`, `shadow-lg`,
`mark-shadow`, `brand-area` (the bar's area word; `primary-soft-text` unless
set); the same in both themes: `font-sans`, `font-mono`, `radius-sm`, `radius`,
`radius-lg`, `radius-xl`, `control-height`, `control-height-sm`,
`topbar-height`, `duration`, `ease`. The palette is the IAM's; text on every
ground the kit draws reaches 4.5:1 in both themes (badges: `success-text`
5.1:1, `warning-text` 5.3:1 on their soft grounds), and `border-strong` - the
edge of every control: fields, selects, code boxes, radio cards, segmented
controls, the bar's round buttons - 3:1 on every ground (WCAG 1.4.11; light
`#7a8ca5`, dark `#5e72a3`). The decorative `border` (cards, separators) stays light.

A site with a palette of its own (Japanese, Piano) gives its colours, light and
dark, and keeps the family's for the rest:

```scss
@include anotoki.root((
  light: (bg: #f6f5f2, surface: #ffffff, text: #1d1d1f, primary: #3a5f8a, primary-hover: #2f4f74, link: #3a5f8a),
  dark: (bg: #16161a, surface: #1e1e23, text: #eceaf0, primary: #6b9fd8, primary-contrast: #0e1420, link: #6b9fd8),
  font-sans: ("Manrope Variable", system-ui, sans-serif),
));
```

A site may also define its old names as aliases while its own components move
(`--ink: var(--anotoki-text)`).

### `@anotoki/lib/ui`

`provideAnotokiUi(factory)` (optional; the factory runs in an injection
context): `language` (the page's, a signal is followed; default `'en'`),
`words` (per language, the site's words over the built-in ones), `lookup` (a
site's string for a kit word, or null / `''` for the kit's - checked first; the
keys are the ones a translations module will seed as `anotoki.<key>`), `icons`.

**Words** - `AnotokiWords.t(key, params?)`, reactive. Resolution per key:
`lookup(key)`, then `words[language]` (or its primary subtag: `sk-SK` -> `sk`),
then the built-in words of the language, then the built-in English - never a
key. `lang` is the language the words are in (`'en'` on a page nobody wrote
words for) and `foreignLang` is set where that is not the page's: the kit puts
it in a `lang` attribute. The built-in Slovak is informal ("ty"); a formal site
overrides it (the survey: `words: { sk: { 'topbar.menuButton': 'Vaša ponuka: {name}', ... } }`).
The keys: `ui.close`, `ui.dismiss`, `ui.notifications`, `ui.cancel`,
`ui.confirm`, `ui.retry`, `ui.optional`, `ui.loading`, `ui.showPassword`,
`ui.hidePassword`, `ui.copy`, `ui.copied`, `ui.copyToClipboard`,
`ui.copiedToClipboard`, `ui.copyFailed`, `ui.qrCode`, `ui.or`, `ui.pages`,
`ui.previous`, `ui.next`, `ui.range`, `ui.pageOf`, `ui.nothingToShow`,
`topbar.skipToContent`, `topbar.sections`, `topbar.phoneMenu`,
`topbar.menuButton`, `topbar.menu`, `topbar.roleAdmin`, `topbar.roleEditor`,
`topbar.account`, `topbar.admin`, `topbar.signIn`, `topbar.signOut`,
`topbar.saving`, `language.label`, `language.button`, `language.notLoaded`,
`language.notSaved`, `theme.label`, `theme.light`, `theme.dark`, `theme.auto`,
`theme.autoHint`, `theme.notSaved` (English and Slovak in
`angular/projects/lib/ui/src/words.ts`). A site words its own menu items with
them too: `words.t('topbar.account')` is "Tvoj anotoki účet" in Slovak.

**Icons** - `<anotoki-icon name="..." [size] [strokeWidth] [filled] [label]>`,
decorative unless labelled. The kit's own: `sun`, `moon`, `monitor`, `user`,
`shield`, `logIn`, `logOut`, `chevronDown`, `chevronLeft`, `chevronRight`,
`menu`, `x`, `check`, `alert`, `info`, `checkCircle`, `xCircle`, `eye`,
`eyeOff`, `copy`, `refresh`, `arrowLeft`, `externalLink`, `sparkle`, `search`,
`plus`; the rest from `@anotoki/lib/ui/icons`, registered by name (`icons`
above, or an `ANOTOKI_ICONS` multi provider on a lazy route). An unknown name
draws nothing and warns once in development.

**Pieces** (selectors `anotoki-*`; slot attributes as the IAM's):

- `button[anotokiButton], a[anotokiButton]` - `variant` (`primary`, `secondary`,
  `ghost`, `danger`, `link`), `size` (`sm`, `md`, `lg`), `loading`, `disabled`
  (on a link: aria-disabled and out of the tab order), `block`, `iconOnly` (give
  it an aria-label), `type` (`button` by default). 44 px high (34 for `sm`); a
  `link` button reads as a link with a 44 px target (24 px for `sm`).
- `anotoki-spinner` - `size`, `label` (a bare `label` says the kit's "Loading…"),
  `showLabel`, `inline`, `delay` (ms before it shows).
- `anotoki-badge` - `tone`, `dot`, `mono`. `anotoki-alert` - `tone`, `heading`,
  `announce` (`true`: role="alert", `'polite'`: role="status"); `[alertActions]`.
- `anotoki-card` - `heading`, `subheading`, `headingId`, `headingLevel` (2, 3),
  `flush`, `tone`; `[cardActions]`.
- `anotoki-empty-state` - `icon`, `heading`, `text`; content: actions.
  `anotoki-error-state` - `heading`, `message`, `retryLabel`; `(retry)`.
- `anotoki-page-header` - `heading`, `lead`, `headingId` (`page-title`);
  `[pageEyebrow]`, `[pageMeta]`, content: actions.
- `anotoki-avatar` - `name`, `imageUrl`, `size`, `shape` (`rounded`, `circle`).
- `anotoki-segmented` - `label`, `options` (`{ value, label, icon?, hint?, name?, lang? }`),
  `value` + `(valueChange)` (or `[(value)]`), `iconsOnly`, `size`, `busy`: a radio
  group, one Tab stop, arrows move the choice and the focus once it is made.
- `[anotokiAutofocus]`; `uniqueId()`, `keepOnScreen(element)`, `mediaQuery(query)`, `tabbable(root)`.

**`ui/menu`** - `[anotokiMenuTrigger]="menu"`, `<anotoki-menu #menu label align closeOnSelect>`,
`button[anotokiMenuItem], a[anotokiMenuItem]` (`radio`, `disabled`, `stay`),
`<anotoki-menu-separator>`. The family's rules: drawn only while open, in the
top layer under its button and kept on screen; focus into it (the checked or
the first item); arrows (skipping disabled items), Home, End; Escape back to
the button; **Tab and Shift+Tab close it with the focus on its button**; a
click outside closes it where the focus is; choosing an item closes it.
`[anotokiPopoverTrigger]` + `<anotoki-popover label autoFocus>` - the same for a
box of controls (a labelled group; Escape, the focus leaving and a click outside close it).

**`ui/dialog`** - `<anotoki-dialog heading description size dismissible busy (dismiss)>`
in a page's `@if` (`[dialogFooter]`); `AnotokiDialog.open(Component, { data, heading, size, dismissible })`
-> `AnotokiDialogRef` (`close(result)`, `closed`, `busy`, `heading`); the
component injects `AnotokiDialogRef` and `ANOTOKI_DIALOG_DATA` and puts its
buttons in `<ng-template anotokiDialogFooter>`. `ConfirmService.ask({ title, message, confirmLabel, cancelLabel, tone })`
-> `Promise<boolean>`, drawn by `<anotoki-confirm-host>`, the focus on Cancel.

**`ui/toast`** - `ToastService.show(message, tone, duration)`, `success`,
`info`, `warning` (8 s), `error` (9 s), `dismiss(id)`; at most four;
`<anotoki-toast-host>` is a polite region, always in the page.

**`ui/forms`** - every field: `label`, `[(value)]`, `name`, `hint`, `error`
(role="alert", tied by aria-describedby, aria-invalid), `required`,
`optional`, `disabled`, `hideLabel`, `autofocus`, `focus()`.
`anotoki-text-field` (`type`, `autocomplete`, `inputmode`, `placeholder`,
`readonly`, `maxlength`, `minlength`, `min`, `max`, `pattern`, `spellcheck`,
`autocapitalize`, `(blurred)`, `[fieldPrefix]` / `[fieldSuffix]`),
`anotoki-textarea` (`rows`, `readonly`, ...), `anotoki-password-field`
(`autocomplete` required, `[labelAside]`), `anotoki-select` (`options`,
`placeholder`, `inline`), `anotoki-checkbox` / `anotoki-switch`
(`[(checked)]`, `hint`, the switch's `busy`), `anotoki-radio-group`,
`anotoki-code-input` (`length`, `(complete)`).

**Smaller entry points** - `ui/tabs` `<anotoki-tabs #tabs="anotokiTabs" label [tabs] [(active)]>`
(the page draws the panels with `tabs.panelId(id)` / `tabs.tabId(id)`);
`ui/pagination` `<anotoki-pagination [page] [pageSize] [total] [busy] (pageChange)>`;
`ui/drawer` `<anotoki-drawer heading subheading backLabel (dismiss) (back)>`
(`[drawerActions]`, `[drawerFooter]`); `ui/tooltip` `[anotokiTooltip]="text"`
(`anotokiTooltipDelay`; WCAG 1.4.13); `ui/copy` `<anotoki-copy-button text label variant size iconOnly>`
and `copyText()`; `ui/qr` `<anotoki-qr-code value label>` and `encodeQr()`.

### `@anotoki/lib/shell`

`provideAnotokiShell(factory)`: `theme` (`storageKey` - the same as the boot
script's `data-storage-key`; `account` - the account's theme, null while there
is none; `save` - rejects when the account refuses; `themeColor`) and
`languages` (`current`, `offered`, `choose` -> true once the page reads in it,
`notSaved`, `clearNotSaved`).

- `ThemeService` - `mode`, `resolved`, `refused`, `set(mode)`,
  `dismissRefusal()`. Writes `<html data-theme>`, its color-scheme and
  `<meta name="theme-color">`; follows the device while `auto`; keeps the mode
  in localStorage (nothing for auto); shows the account's theme from its first
  moment and whenever it changes - not while its own save is out; one save at a
  time, the latest last; a refusal puts the account's theme back and sets `refused`.
- `latestChoiceSaver(save, onRefused)` - that rule for a site's own saves (the
  language): `const saveLanguage = latestChoiceSaver((code) => api.save(code), () => notSaved.set(true))`.
- `<anotoki-theme-toggle [iconsOnly]>` - light / dark / as the device is set
  (a segmented radio group); a note under it when the account refuses.
- `<anotoki-language-switcher appearance="menu | segmented | select | auto" (changed)>` -
  draws nothing with fewer than two languages; the menu's button holds the
  code it shows ("Language: Slovenčina (SK)"); the last choice wins; notes for
  a language that could not be loaded and one the account refused; the keys
  pressed in it stay in it.
- `<anotoki-brand area panel showName link label current lang size logo>` -
  "anotoki survey · admin panel"; without the name, the area alone and the
  panel small under it. `logo` is the site's own file (`anotoki.png`).
- `<anotoki-shell [nav] navLabel skipLabel>` - the frame: a skip link (moving
  the focus by hand), the site's bar in `[topBar]` (the family's or a site's
  own header - genshin keeps its own), a side navigation (15rem; a strip under
  the bar up to 860 px), `<main id="main">`, `[shellFooter]`.
- `<anotoki-top-bar #bar="anotokiTopBar">` - the family's one bar:

| Input | |
| --- | --- |
| `brand` | `{ area, short?, panel?, link, label, current?, lang? }` - `panel: 'admin panel'` in an admin panel |
| `links` | `{ id, label, path, under?, lang?, badge? }[]` - the page's link marked `aria-current`, its section `is-active` |
| `navLabel` | the links' name (the kit's "Main navigation") |
| `person` | `{ name, email?, role? }`, or null - the site words the role |
| `menuItems` | `{ id, label, icon?, path? or href?, newTab?, lang? }[]` - between the menu's head and Sign out |
| `signIn`, `signOut` | functions, or null; one that returns a promise keeps its item waiting ("Saving…", the focus on the menu's button) |
| `languages` | the language switcher (where the site's pages are translated) |
| `phoneMax` | the site's measured fold, px (760 by default) |
| `nameMin` | the person's name shows from here (phoneMax + 201) |
| `shortBrandMax` | the brand short up to here (phoneMax) - the survey's admin panel: 960 |
| `width` | `wide` (84rem) or `narrow` (49rem); `--anotoki-topbar-max-width` overrides; in a frame with a side navigation, 88rem |
| `phoneMark` | `{ badge?, label? }` (the button's name says the count) or `{ dot, description? }` |
| `menuNote` | `{ title, text? }` heading both menus |
| `isolateKeys` | no key pressed in the bar reaches `document` (true) |

  `(languageChanged)` tells a choice made in the bar; content `[topBarWidgets]`
  stands before the language (a widget reads `bar.phone()`); `closeMenu(returnFocus)`.
  A menu closes when the bar folds or unfolds, when the person changes and when
  the links do; in development the bar warns once when its row overflows above
  `phoneMax` (measure again).

A site keeps a thin wrapper where its roles, status and words meet the bar - the
survey's, for example:

```html
<!-- layouts/top-bar/top-bar.component.html -->
<anotoki-top-bar [brand]="brand()" [links]="links()" [person]="person()" [menuItems]="items()"
    [signIn]="signIn" [signOut]="signOut" [languages]="chooser()" [phoneMax]="760" [shortBrandMax]="area() === 'admin' ? 960 : null" [width]="width()" />
```

```ts
protected readonly brand = computed(() => this.area() === 'admin'
  ? { area: this.i18n.t('brand.area'), panel: this.i18n.t('brand.adminPanel'), link: '/admin', label: this.i18n.t('topbar.homeAdmin') }
  : { area: this.i18n.t('brand.area'), link: '/', label: this.i18n.t('topbar.home') });
protected readonly person = computed(() => { const me = this.auth.person(); return me && { name: me.name, email: me.email,
  role: this.auth.isAdmin() ? this.words.t('topbar.roleAdmin') : this.auth.isStaff() ? this.words.t('topbar.roleEditor') : null }; });
protected readonly signOut = () => this.signOutAfterSaves();   // a promise: the item waits
```

### `@anotoki/lib/migrations` and `@anotoki/lib/migrations/page`

```ts
// app.config.ts
provideHttpClient(withInterceptors([siteStatusInterceptor /* , the site's own */])),
provideAnotokiMigrations(() => {
  const auth = inject(AuthService);                 // the factory runs in an injection context
  const i18n = inject(TranslationService);
  return {
    statusUrl: '/api/site-status',
    apiBase: '/api/admin/migrations',
    migrationsRoute: '/admin/migrations',           // the site's route showing <anotoki-migrations-page>
    isAdmin: () => auth.roles().includes('ADMIN'),  // ADMIN of this site, from the token (signals work)
    isSignedIn: () => auth.signedIn(),
    signIn: () => auth.signIn(),                    // returning to the current page
    language: () => i18n.language(),                // 'en' and 'sk' built in; others read English
    formatDate: (iso) => i18n.formatDate(iso),      // optional: default en-GB, '6 Oct 2026, 10:01'
    onUpToDate: () => i18n.reload(),                // optional: after an Apply leaves nothing to apply
    // setupUrl: '/setup.php', retrySeconds: 30, words: { sk: { updatingTitle: '…' } }
  };
}),
provideAppInitializer(() => inject(SiteStatus).check()),   // early in the boot; the boot must not stop on update_pending
```

```html
<!-- the app's template: the gate around the router outlet, and around nothing else - the pages as a marked template
     (SitePagesDirective in the component's imports), made only while the site is open -->
<anotoki-site-gate><ng-template anotokiSitePages><router-outlet /></ng-template></anotoki-site-gate>
```

```ts
// the admin routes: the page's own entry point, never in the first load
{ path: 'migrations', loadComponent: () => import('@anotoki/lib/migrations/page').then((m) => m.MigrationsPageComponent) }
```

- `SiteStatus` - `state` (`'unknown' | 'ready' | 'update-pending' | 'not-set-up' |
  'unavailable'`), `installed`, `blocked`, `check()`, `checkForReload()` (the
  status page's: a `ready` answer is returned, not reported - the page reloads
  without the gate making the pages first), `report(code, installed?)`, `markReady()`.
- `siteStatusInterceptor` - a 503 whose body's `code` is `update_pending` or
  `not_set_up` tells `SiteStatus` (the request still fails).
- `<anotoki-site-gate>` - its pages while the site is ready (or not asked yet),
  or for the ADMIN on the Migrations route while an update waits;
  `<anotoki-site-status>` otherwise. The pages as `<ng-template anotokiSitePages>`
  are made only while they show; content given as it is (no template) shows as
  in 0.1.0 but is made anyway, so a page behind the status page would run. An
  unmarked `<ng-template>` is not the pages (a control-flow block is a
  template too): nothing is drawn, and development says so.
- `<anotoki-site-status>` - the page of "The behaviour" above, with the kit's
  buttons (the quiet Sign in: a link button, 44 px high).
- `<anotoki-update-banner>` - the IAM's one line for its administrators.
- `<anotoki-migrations-page>` (`@anotoki/lib/migrations/page`) - the admin page
  (English; for the site's ADMIN only), drawn with the kit: Pending (with
  drafts), Applied (with each file's SQL in a dialog), Missing, and "Apply
  pending" behind a question whose focus starts on Cancel.

A site that does not block while an update waits (the IAM, `blockWhilePending:
false`) puts **no** gate around its outlet and does not ask at boot: the status
path does say `update_pending` there, and the gate would close the site to
everybody. It uses the interceptor, `<anotoki-update-banner>` in its admin panel
(which asks the server itself once an ADMIN is there), the Migrations page, and
`<anotoki-site-status>` where it shows its "not set up" page.

Theming: the module reads the family's tokens (`@anotoki/lib/styles`), each with
the family's value as its fallback; a site's 0.1 mapping of the 13
`--anotoki-*` properties keeps working (the "pending" ink reads
`--anotoki-warning-text`, then `--anotoki-warning`).

## Upgrading from 0.1.x

0.2.0 breaks two things a site does with the migrations module, and the markup
of the Migrations page; everything else is new.

1. **The gate's template is marked.** In the app's template
   `<anotoki-site-gate><ng-template>` becomes
   `<anotoki-site-gate><ng-template anotokiSitePages>`, and `SitePagesDirective`
   joins `SiteGateComponent` in that component's `imports`
   (`import { SiteGateComponent, SitePagesDirective } from '@anotoki/lib/migrations'`).
   Without the marker an `<ng-template>` is not the pages: the site draws
   nothing (development warns). Content given as it is, without a template,
   works as in 0.1.0.
2. **The Migrations page has its own entry point.**
   `import('@anotoki/lib/migrations').then((m) => m.MigrationsPageComponent)` becomes
   `import('@anotoki/lib/migrations/page').then((m) => m.MigrationsPageComponent)`;
   a static import (genshin's admin routes, Japanese's and the build analyzer's
   wrappers) changes `from '@anotoki/lib/migrations'` to
   `from '@anotoki/lib/migrations/page'`. `@anotoki/lib/migrations` no longer
   exports it (a re-export would pull it back into the first load).
3. **The Migrations page is drawn with the kit** - a site's specs that read its
   DOM: the question is an `<anotoki-dialog data-confirm>` made when asked
   (`dialog[data-confirm]` -> `anotoki-dialog[data-confirm] dialog`, or
   `[data-confirm] h2`; its sentence is `[data-confirm] .description`), the SQL
   dialog `anotoki-dialog[data-sql]`; an Apply's outcome is an
   `<anotoki-alert data-result>` whose heading is `.heading`
   (`[data-result] h2` -> `[data-result] .heading`); the cards are
   `anotoki-card[data-pending|data-applied|data-missing]`, the badges
   `anotoki-badge[data-kind]`. `[data-apply]`, `[data-confirm-apply]`,
   `[data-confirm-cancel]`, `[data-copy]`, `[data-close]`, `.card-text`,
   `.result-text` and `.result-note` stay.
4. The status page's buttons are the kit's (`anotoki-button`; Sign in
   `is-link`, no more `.button.quiet`). Its words and behaviour are the same,
   except that it reloads without first marking the site ready.

## Working on the library

```
# PHP (from the repository root; on this family's Windows machines `php8`)
php composer.phar install
ANOTOKI_LIB_TEST_DB_CONFIG=../anotoki-iam/backend/config/database.local.php vendor/bin/phpunit
#   or ANOTOKI_LIB_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD; the user needs CREATEDB:
#   each test case makes a database anotoki_lib_test_<random> and drops it

# Angular (from angular/)
bun install
bun run build           # ng build lib -> angular/dist/lib, then scripts/check-package.mjs: each entry point's
                        # size (gzipped code; limits for the eager ones) and import boundaries
bun run test            # ng test lib --watch=false (Vitest, jsdom)
bun run showcase        # projects/showcase on http://localhost:4320: every piece and the bar, from the source
                        # (?theme=dark, ?lang=sk, ?account=1 for a refused theme; /migrations; never published)
bun run build:showcase  # the same, built into angular/dist/showcase
```

CI (`.github/workflows/ci.yml`) runs the PHP tests on 8.2 and 8.4 against
PostgreSQL 16, and builds (with the package check) and tests the Angular library.

## Releasing

1. Bump the version in `angular/projects/lib/package.json` and
   `ANOTOKI_LIB_VERSION` (`angular/projects/lib/src/public-api.ts`; a test keeps
   them equal), and add it to `CHANGELOG.md`.
2. Commit, `git tag vX.Y.Z`, push the commit and the tag.
3. The release workflow builds and tests the library, refuses a tag that is not
   `v` + that version, packs it and attaches `anotoki-lib-X.Y.Z.tgz` to a GitHub
   Release of the tag.
4. Each site updates its constraint (`composer.json`) and the tarball's URL
   (`package.json`).
