// Checks the built package (dist/lib) after `ng build lib`, and prints what each entry point weighs and what a site's
// first load takes of it.
//
// - Sizes: every entry point's FESM, raw and gzipped. A site's build places whole files in its chunks, and an entry
//   point is one file, so the eager ones (the ui core, ui/menu, shell, migrations, translations, auth: every page of a
//   site; the admin tools' and the feedback form's configuration, which a site may provide with them) have limits; the
//   rest are printed. The ui core is a file per piece (@anotoki/lib/ui/button, /spinner, ...): its limit holds the
//   pieces together.
// - Boundaries: what each entry point may import. The library imports the core's pieces from their own entry points,
//   never through @anotoki/lib/ui, which holds re-exports and nothing else: a build that reaches it from a first page
//   places every piece any page uses in the first load. The shell imports only the core and ui/menu; nothing imports
//   the shell; the Migrations page is never pulled back into the gate's entry point, nor the admin Translations and
//   Languages pages into the translations module's. The auth module imports the core's pieces, the migrations
//   module (whether the site is blocked), the error report's marker (@anotoki/lib/error-report/marker, a token: a
//   report's failure is left alone) - never the reporter - and its own marker (@anotoki/lib/auth/marker, 0.7.2: whom
//   a request is for - ISSUED_AS, issuedAs(); it imports nothing), and nothing imports it but its testing helper; its
//   parts loaded later - the screens (auth/screens) and the client's token requests (auth/session, which it imports by
//   import() alone) - import its shared part (auth/core), never the module itself. The People page imports the
//   kit and its configuration's small entry point, which imports nothing. The admin tools' pages import their
//   configuration, their shared parts (@anotoki/lib/admin/parts) and the kit's lazy pieces, and nothing imports a page;
//   the feedback form imports its configuration, the kit's fields, the kit's dialog (0.8.0: the form in its dialog,
//   its buttons in the dialog's footer) and the auth module's marker (its message is anybody's), never the auth
//   module. The legal pages import their configuration (and the footer's links, @anotoki/lib/legal), the kit's pieces
//   and its copy button, and the feedback form - its dialog - by import() alone; the About and Support pages (0.8.0),
//   an entry point each, their configuration, the core's pieces and their own words. The kit's pieces of 0.6.0 are
//   entry points of their own (ui/chips, ui/link-card, ui/stat-tiles, ui/progress, ..., ui/side-nav, ui/current-link),
//   outside the core and its limit, each importing the core's pieces it draws; the tabs (lazy, no limit) gained the
//   link tabs, the badge, the icon and the scroll hint in their own. Its input pieces (ui/date-field, ui/slider,
//   ui/color-field, ui/file-picker, ui/combobox, ui/rich-text) too, each held to a limit of its own (LAZY_LIMITS):
//   big pieces, lazy, kept from growing unseen. The family's footer (0.6.3) imports the
//   core's pieces, the legal links (@anotoki/lib/legal) and its own words, and the feedback form's dialog
//   (@anotoki/lib/feedback/form, 0.8.0 - footer/feedback's before) by import() alone.
// - The library's words, a namespace at a time (scripts/library-words.mjs): ui/config holds the kit's namespaces
//   alone; each @anotoki/lib/words/<namespace> holds one namespace, imports nothing, and is imported by its module
//   alone, which registers it (provideLibraryWords) - the only way a module's words reach the translations module,
//   which imports none and holds the kit's alone; @anotoki/lib/words, every namespace's, is for a site's specs and
//   the showcase. Every first load carries the words of the namespaces its page says, and no others: a module that
//   brings words weighs neither on the kit's first loads nor on the translations module's. Some namespaces are read
//   by their readers alone and never registered (READ_BY_THEIR_PAGES: the legal pages', the About and Support pages',
//   pages of text - a registration comes with the eager configuration -, and the kit's pieces' of their own entry
//   points and the footer's, which have no provide*()): only those readers may import them, and no first load carries
//   them but their reader's own.
// - Valid CSS: the tokens as the styles module writes them, and every component's styles, hold no one-item list as
//   Sass reads it back - `(0 1px 2px …,)`, which no property takes.
// - Text, never markup: no bundle names one of the ways to put a string into a page as HTML, or to switch Angular's
//   sanitizer off (HTML_SINK) - any spelling, on any line, a comment's too. The kit draws the sites' strings, which
//   their administrators reword, and the IAM's deploy check refuses a release of the library whose bundles name one;
//   this refuses it first, the same way.
// - Floors: an entry point nothing is used of leaves nothing in a site's bundle. A site's build keeps a top-level call
//   or `new` it is not told is pure - the Angular CLI marks them so in @angular/* alone - and everything it reads: the
//   call is marked /* @__PURE__ */.
// - First loads: what a site's first page takes of the package in a site's own production build - every file through
//   Angular's linker and the CLI's optimizations (its JavaScriptTransformer), then the CLI's esbuild, splitting
//   chunks - beside lazy pages that use every other entry point whole. The first load holds no file of the package
//   that the first page alone does not, gains no more than SHARED_SLACK from what shares a file with it, and stays
//   under its limit.
//
// Run by `bun run build` (and so by CI and the release); exits 1 when a limit, a boundary, a floor or a first load is
// broken.

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'lib');
const manifest = JSON.parse(readFileSync(join(dist, 'package.json'), 'utf8'));

/** The ui core: @anotoki/lib/ui re-exports these, each an entry point - a file - of its own. */
const CORE = '@anotoki/lib/ui';
const PIECES = ['config', 'dom', 'icon', 'spinner', 'button', 'badge', 'alert', 'card', 'empty-state', 'error-state', 'page-header', 'avatar', 'segmented', 'autofocus'].map(
  (piece) => `${CORE}/${piece}`,
);

/**
 * Gzipped kB each eager entry point may weigh - its code, without the comments, which never reach a site's bundle -
 * the core with all its pieces, and the shell with the core together (the spec's "about 25 kB"; 26.3 at 0.2.0, 27.8
 * at 0.3.0 with the kit's own class names and every library word in ui/config; 27.4 at 0.4.0, ui/config holding the
 * kit's words alone - each other module's are an entry point of their own, @anotoki/lib/words/<namespace>). Room to
 * grow a little; a limit crossed is a reason to move something into an entry point of its own, not to raise the limit.
 * Raised once, at 0.6.0, from 28 to 28.5 for the ui and the shell together (27.96 before, 28.34 after): the sites asked
 * for what can only be the core pieces' own - the segmented control's disabled options, colour marks and wrapping, the
 * button's quiet red and a small link button's 44 px on touch, the badge's wrapping, the card's highlight, the page
 * header's lead with markup, the spinner's bare attributes - each a binding and a few rules (a component's styles stand
 * twice in its FESM: once more in the class metadata a site's build drops). Every new piece of 0.6.0 is an entry point
 * of its own, outside this sum; the bar's own first load (a site's real one, below) stays well under its limit.
 *
 * auth: the IAM's browser client (the SDK, ported), the session, the interceptor, the guards, the preferences - 14.9
 * at 0.4.0 before the screen, 15.3 with it. Every site that signs in loads it on its first page, with its shared part
 * (auth/core: the client's types and helpers, the configuration, the built-in words, the screens' port). Since 0.5.0
 * what runs only at a moment is loaded then: the client's token requests (auth/session, by import()) and the callback
 * page and the failure's screen (auth/screens, on lazy routes) - 34.4 kB raw of a site's first load at 0.4.1. Its
 * marker (auth/marker, 0.7.2: whom a request is for) is an entry point of its own, which the feedback form names
 * without the module - a token and a function, on every first page that signs in.
 *
 * people: the People page's configuration and the shape of its API, in a site's app.config - a token and a function
 * (the page itself is people/page, on a lazy admin route).
 *
 * admin, feedback (0.4.0): what a site may provide with the rest of its app - the admin tools' configuration and the
 * unread feedback count beside its admin navigation (0.9); the feedback form's configuration, which registers its
 * words (0.9, its words an entry point of their own, 1.4). The admin pages and the form are entry points of their own,
 * on lazy routes or loaded as they are opened.
 *
 * error-report (0.5.0): the browser's errors reported to the site's error log - an ErrorHandler every site provides,
 * so on every first page (2.8 at 0.5.0, its scrubbing's patterns most of it; 2.1 minified in a first load). Its mark on
 * a report, ANOTOKI_ERROR_REPORT, is an entry point of its own (0.6.0, error-report/marker): the auth module reads it,
 * and a site's build places whole files in its chunks - the reporter beside the sign-in would be 2.3 kB more.
 *
 * legal (0.6.0): the legal pages' configuration and the footer's three links, with their four words - on every page of
 * a site whose footer is the family's (2.5 at 0.6.0: the links' template and styles stand twice in the FESM, as every
 * component's do - once more in its class metadata, which a site's production build drops; 1.5 minified in a first
 * load). The pages are @anotoki/lib/legal/pages, on lazy routes, with their own words.
 *
 * footer (0.6.3): the family's footer under every page of every site - its row and its four words, read by itself (2.6
 * at 0.6.3, its template and styles twice in the FESM as every component's); the legal links and the kit's pieces it
 * draws are entry points of their own, and its feedback dialog (the kit's dialog around the feedback form - since 0.8.0
 * @anotoki/lib/feedback/form's, which the Contact page opens too) comes with the press (its first load is "the footer"
 * below).
 */
const LIMITS = {
  [CORE]: 15,
  '@anotoki/lib/ui/menu': 6,
  '@anotoki/lib/shell': 14,
  '@anotoki/lib/migrations': 7,
  '@anotoki/lib/translations': 8,
  '@anotoki/lib/auth': 12,
  '@anotoki/lib/auth/core': 3.5,
  '@anotoki/lib/auth/marker': 0.5,
  '@anotoki/lib/people': 0.5,
  '@anotoki/lib/admin': 1.5,
  '@anotoki/lib/feedback': 1.5,
  '@anotoki/lib/error-report': 3,
  '@anotoki/lib/legal': 3,
  '@anotoki/lib/footer': 3,
};
const UI_AND_SHELL = 28.5;

/**
 * Gzipped kB each of the kit's input pieces of 0.6.0 may weigh - its code, without the comments. Lazy (no first load
 * takes them), but big: a limit of its own, set with a little room over what it weighed when it came, keeps one from
 * growing unseen. A limit crossed is a reason to look at what grew, not to raise the limit.
 */
const LAZY_LIMITS = {
  // 9.4 at 0.6.0: the field and its calendar - two components, their templates and styles (each twice in the FESM,
  // once more in the class metadata a site's production build drops) and the dates' reading and writing.
  '@anotoki/lib/ui/date-field': 10,
  '@anotoki/lib/ui/slider': 4,
  '@anotoki/lib/ui/color-field': 4.5,
  '@anotoki/lib/ui/file-picker': 5.5,
  '@anotoki/lib/ui/combobox': 7,
  // 5.4 at 0.6.0: the toolbar, its item, the contenteditable's driver and the copies of twelve icons.
  '@anotoki/lib/ui/rich-text': 6,
};

/** What an admin tool's page may import: the tools' configuration and shared parts, and the kit's pieces its page draws. */
const ADMIN_PAGE = [
  '@anotoki/lib/admin',
  '@anotoki/lib/admin/parts',
  ...PIECES,
  '@anotoki/lib/ui/dialog',
  '@anotoki/lib/ui/forms',
  '@anotoki/lib/ui/pagination',
  '@anotoki/lib/ui/copy',
  '@anotoki/lib/ui/tabs',
  '@anotoki/lib/ui/labelled-group',
];

/** What each entry point may import of the package's own (the rest: @angular/*, rxjs, tslib). */
const MAY_IMPORT = {
  '@anotoki/lib': [],
  [CORE]: PIECES,
  '@anotoki/lib/ui/config': [],
  '@anotoki/lib/ui/dom': [],
  '@anotoki/lib/ui/icon': ['@anotoki/lib/ui/config'],
  '@anotoki/lib/ui/spinner': ['@anotoki/lib/ui/config'],
  '@anotoki/lib/ui/button': ['@anotoki/lib/ui/spinner'],
  '@anotoki/lib/ui/badge': [],
  '@anotoki/lib/ui/alert': ['@anotoki/lib/ui/icon'],
  '@anotoki/lib/ui/card': [],
  '@anotoki/lib/ui/empty-state': ['@anotoki/lib/ui/icon'],
  '@anotoki/lib/ui/error-state': ['@anotoki/lib/ui/alert', '@anotoki/lib/ui/button', '@anotoki/lib/ui/config', '@anotoki/lib/ui/icon'],
  '@anotoki/lib/ui/page-header': [],
  '@anotoki/lib/ui/avatar': [],
  '@anotoki/lib/ui/segmented': ['@anotoki/lib/ui/icon'],
  '@anotoki/lib/ui/autofocus': [],
  // The family's icon set is a site's alone: no entry point imports it. A lazy page carries its own copies of the
  // icons it draws - a site that loads ui/icons up front would otherwise carry them in its first load (one file is
  // one chunk), as 0.4.0's admin pages put ~0.7 kB there (ui/icons/own-copies.spec.ts keeps the copies the family's).
  '@anotoki/lib/ui/icons': [],
  '@anotoki/lib/ui/menu': PIECES,
  '@anotoki/lib/ui/dialog': PIECES,
  '@anotoki/lib/ui/toast': PIECES,
  // The fields; since 0.6.0 the field base and the select are entry points of their own, which it names (a first load
  // can take the select alone, without every field).
  '@anotoki/lib/ui/forms': [...PIECES, '@anotoki/lib/ui/field', '@anotoki/lib/ui/select'],
  '@anotoki/lib/ui/field': ['@anotoki/lib/ui/config', '@anotoki/lib/ui/dom'],
  '@anotoki/lib/ui/select': [...PIECES, '@anotoki/lib/ui/field'],
  // The tabs and, 0.6.0, the link tabs: their arrows' words (read by the tabs themselves, READ_BY_THEIR_PAGES below)
  // and which link is the page's (ui/current-link).
  '@anotoki/lib/ui/tabs': [...PIECES, '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/tabs', '@anotoki/lib/ui/current-link'],
  '@anotoki/lib/ui/pagination': PIECES,
  '@anotoki/lib/ui/drawer': PIECES,
  '@anotoki/lib/ui/tooltip': PIECES,
  '@anotoki/lib/ui/copy': [...PIECES, '@anotoki/lib/ui/toast'],
  '@anotoki/lib/ui/qr': PIECES,
  // 0.6.0's pieces, each an entry point of its own: how a piece reads its own words (the site's string first), and
  // the pieces - those that say words import their namespace and read it through ui/piece-words, never registered
  // (READ_BY_THEIR_PAGES below).
  '@anotoki/lib/ui/piece-words': ['@anotoki/lib/ui/config'],
  '@anotoki/lib/ui/chips': [...PIECES, '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/chips'],
  '@anotoki/lib/ui/link-card': [],
  '@anotoki/lib/ui/stat-tiles': ['@anotoki/lib/ui/config'],
  '@anotoki/lib/ui/progress': [...PIECES, '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/progress'],
  '@anotoki/lib/ui/disclosure': PIECES,
  '@anotoki/lib/ui/stepper': [...PIECES, '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/stepper'],
  '@anotoki/lib/ui/labelled-group': PIECES,
  // Which of a navigation's links is the page's: the router alone. The side navigation: the kit's drawer on a phone,
  // its words the kit's own (the top bar's "{count} new", ui/config).
  '@anotoki/lib/ui/current-link': [],
  '@anotoki/lib/ui/side-nav': [...PIECES, '@anotoki/lib/ui/drawer', '@anotoki/lib/ui/current-link'],
  // The input pieces of 0.6.0: fields of the kit's (ui/field); the date field's calendar is a box under its button
  // (ui/menu's AnchoredPanel, already in the bar's first load); each reads its own words (READ_BY_THEIR_PAGES).
  '@anotoki/lib/ui/date-field': [...PIECES, '@anotoki/lib/ui/field', '@anotoki/lib/ui/menu', '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/date-field'],
  '@anotoki/lib/ui/slider': [...PIECES, '@anotoki/lib/ui/field'],
  '@anotoki/lib/ui/color-field': [...PIECES, '@anotoki/lib/ui/field', '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/color-field'],
  '@anotoki/lib/ui/file-picker': [...PIECES, '@anotoki/lib/ui/field', '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/file-picker'],
  // The combobox: its list box is a box under the field (AnchoredPanel), several chosen are the kit's removable chips.
  '@anotoki/lib/ui/combobox': [...PIECES, '@anotoki/lib/ui/field', '@anotoki/lib/ui/menu', '@anotoki/lib/ui/chips', '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/combobox'],
  // The rich-text toolbar: no field and no box - its buttons and its words.
  '@anotoki/lib/ui/rich-text': [...PIECES, '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/rich-text'],
  '@anotoki/lib/shell': [...PIECES, '@anotoki/lib/ui/menu'],
  '@anotoki/lib/migrations': [...PIECES, '@anotoki/lib/words/site-status'],
  '@anotoki/lib/migrations/page': ['@anotoki/lib/migrations', ...PIECES, '@anotoki/lib/ui/dialog'],
  '@anotoki/lib/translations': PIECES,
  '@anotoki/lib/translations/admin': ['@anotoki/lib/translations', ...PIECES, '@anotoki/lib/ui/dialog', '@anotoki/lib/ui/forms'],
  '@anotoki/lib/translations/testing': ['@anotoki/lib/translations'],
  // The error report's marker alone (a token), never the reporter; its own marker, whom a request is for.
  '@anotoki/lib/auth': [
    ...PIECES,
    '@anotoki/lib/migrations',
    '@anotoki/lib/error-report/marker',
    '@anotoki/lib/auth/marker',
    '@anotoki/lib/auth/core',
    '@anotoki/lib/auth/session',
    '@anotoki/lib/auth/screens',
  ],
  // Whom a request is for (0.7.2): a token and a function, importing nothing - the auth module's, and the feedback
  // form's, which names it without the module.
  '@anotoki/lib/auth/marker': [],
  // The auth module's shared part, and its parts loaded later: never the module itself (it names them, by import()
  // the session part - a site's build puts that in a chunk of its own).
  '@anotoki/lib/auth/core': ['@anotoki/lib/ui/config', '@anotoki/lib/words/sign-in'],
  '@anotoki/lib/auth/session': ['@anotoki/lib/auth/core'],
  '@anotoki/lib/auth/screens': ['@anotoki/lib/auth/core', ...PIECES],
  '@anotoki/lib/auth/testing': ['@anotoki/lib/auth'],
  // The People page's configuration needs nothing of the package; the page takes the kit (never the auth module: who
  // reads it is the site's to say, `me`) and is never pulled back into it.
  '@anotoki/lib/people': [],
  '@anotoki/lib/people/page': ['@anotoki/lib/people', ...PIECES, '@anotoki/lib/ui/dialog', '@anotoki/lib/ui/forms', '@anotoki/lib/ui/pagination'],
  // The admin tools: their configuration (and the unread feedback count, beside a site's admin navigation) imports
  // nothing of the package; their shared parts and their five pages, each on a lazy route, the kit's pieces.
  '@anotoki/lib/admin': [],
  '@anotoki/lib/admin/parts': ['@anotoki/lib/admin', ...PIECES, '@anotoki/lib/ui/dialog'],
  '@anotoki/lib/admin/errors': ADMIN_PAGE,
  '@anotoki/lib/admin/audit': ADMIN_PAGE,
  '@anotoki/lib/admin/feedback': ADMIN_PAGE,
  '@anotoki/lib/admin/backups': ADMIN_PAGE,
  '@anotoki/lib/admin/files': [...ADMIN_PAGE, '@anotoki/lib/ui/menu'],
  // The visitors' feedback form: its configuration registers its words; the form itself, on the pages that show it -
  // its message anybody's (0.7.2): the auth module's marker, never the auth module - and, 0.8.0, the form in the kit's
  // dialog, as the footer and the Contact page open it.
  '@anotoki/lib/feedback': ['@anotoki/lib/ui/config', '@anotoki/lib/words/feedback'],
  '@anotoki/lib/feedback/form': ['@anotoki/lib/feedback', ...PIECES, '@anotoki/lib/ui/forms', '@anotoki/lib/ui/dialog', '@anotoki/lib/auth/marker'],
  // The browser's errors, reported: Angular's own (its ErrorHandler and HttpClient) and the report's mark, an entry
  // point of its own that imports nothing.
  '@anotoki/lib/error-report': ['@anotoki/lib/error-report/marker'],
  '@anotoki/lib/error-report/marker': [],
  // The legal pages: their configuration and the footer's links register the links' words; the pages, each on a
  // lazy route, read their own (READ_BY_THEIR_PAGES) and load the feedback form's dialog by import() as it is opened.
  // The About and Support pages (0.8.0), an entry point each on a lazy route: the paths and the language of the
  // legal configuration, the core's pieces, and their own words, read by themselves.
  '@anotoki/lib/legal': ['@anotoki/lib/ui/config', '@anotoki/lib/words/legal-links'],
  '@anotoki/lib/legal/pages': ['@anotoki/lib/legal', '@anotoki/lib/words/legal', ...PIECES, '@anotoki/lib/ui/copy', '@anotoki/lib/feedback/form'],
  '@anotoki/lib/legal/about': ['@anotoki/lib/legal', '@anotoki/lib/words/about', ...PIECES],
  '@anotoki/lib/legal/support': ['@anotoki/lib/legal', '@anotoki/lib/words/support', ...PIECES],
  // The family's footer (0.6.3): the kit's buttons, the legal links, its own words (read by itself, READ_BY_THEIR_PAGES)
  // through ui/piece-words, and the feedback form's dialog by import() as it is opened (0.8.0; its own footer/feedback
  // before) - the kit's dialog and the feedback form, so that the footer's first load carries neither.
  '@anotoki/lib/footer': [...PIECES, '@anotoki/lib/ui/piece-words', '@anotoki/lib/words/footer', '@anotoki/lib/legal', '@anotoki/lib/feedback/form'],
  // @anotoki/lib/words and every @anotoki/lib/words/<namespace>: below, from the entry points the package has.
};
const OTHERS = /^(@angular\/|rxjs(\/|$)|tslib$)/;

/** The library's words: the kit's namespaces (ui/config's), and where every other module's are. */
const WORDS = '@anotoki/lib/words';
const KIT_WORDS = ['language', 'ui', 'topbar', 'theme'];

/**
 * The words entry points their readers read themselves, never registering them: a module's lazy pages (pages of text,
 * which a registration would bring with the module's eager configuration into every first load), and the kit's pieces
 * of their own entry points (0.6.0: a piece has no provide*() of its own, and provideAnotokiUi is in every first load -
 * each reads its words through ui/piece-words). No other entry point may import them, and no first load carries their
 * namespace (each FIRST_LOADS row names the namespaces it may carry).
 */
const READ_BY_THEIR_PAGES = {
  '@anotoki/lib/words/legal': ['@anotoki/lib/legal/pages'],
  '@anotoki/lib/words/chips': ['@anotoki/lib/ui/chips'],
  '@anotoki/lib/words/progress': ['@anotoki/lib/ui/progress'],
  '@anotoki/lib/words/stepper': ['@anotoki/lib/ui/stepper'],
  '@anotoki/lib/words/tabs': ['@anotoki/lib/ui/tabs'],
  '@anotoki/lib/words/date-field': ['@anotoki/lib/ui/date-field'],
  '@anotoki/lib/words/color-field': ['@anotoki/lib/ui/color-field'],
  '@anotoki/lib/words/file-picker': ['@anotoki/lib/ui/file-picker'],
  '@anotoki/lib/words/combobox': ['@anotoki/lib/ui/combobox'],
  '@anotoki/lib/words/rich-text': ['@anotoki/lib/ui/rich-text'],
  // The footer's (0.6.3): it is in a first load itself, which carries them (its row below) - no other does.
  '@anotoki/lib/words/footer': ['@anotoki/lib/footer'],
  // The About and Support pages' (0.8.0): pages of text, each read by its page alone.
  '@anotoki/lib/words/about': ['@anotoki/lib/legal/about'],
  '@anotoki/lib/words/support': ['@anotoki/lib/legal/support'],
};

/** The namespaces of the library keys a piece of code holds: `anotoki.<namespace>.<word>`, whole or a template's start. */
const namespacesIn = (code) => new Set([...code.matchAll(/anotoki\.([A-Za-z0-9][A-Za-z0-9_-]*)\./g)].map((match) => match[1]));

/**
 * A site's first page, what it imports of the package, the gzipped kB its first load may take of the package beside
 * lazy pages that use every other entry point, and the namespaces of the library's words it may carry (null: every
 * one). "the gate": genshin's and the build analyzer's whole use (the status page, its buttons, the kit's and the
 * status page's words); "the bar": the family's top bar and its theme; "the words": the translations module, with the
 * kit's words alone - a module's arrive with the module, by its registration; "a button": one piece alone; "the
 * sign-in": the gate and the auth module's every eager part, its callback page and failure's screen routed with the
 * first page - since 0.5.0 each route loads its screen as it is shown (auth/screens), and the client its token
 * requests as they are made (auth/session); "the badge": the admin tools'
 * configuration and the unread feedback count of a site's admin navigation - no words; "the words + feedback": a
 * site's translations with the feedback form's configuration, which registers the form's words - the form itself
 * (@anotoki/lib/feedback/form, the kit's fields) is loaded as it is opened: in a first load it would share ui/forms
 * with the lazy pages; "the error report": the browser's errors reported to the site's error log - no words; "the
 * words + legal links": a site's translations with the legal pages' configuration and the footer's three links, which
 * register their four words - never the pages' own (`anotoki.legal.*`), which come with the pages alone; "a select"
 * (0.6.0): the kit's select alone, where a first page draws one (a widget in the bar) - from ui/forms it took every
 * field with it, 11.2 kB beside lazy pages (6.0 alone), measured before ui/select; 7.0 with it (6.0 alone); "the
 * footer" (0.6.3): the family's footer with the legal configuration its links read - the kit's button, the legal links
 * and its own words; its feedback dialog (the kit's dialog, the feedback form) comes with the press - with the dialog
 * up front, the first load took 2.0 kB more beside lazy pages, which use the rest of ui/dialog's one file -, and none
 * of the legal pages' words.
 */
const FIRST_LOADS = [
  {
    title: 'the gate',
    imports: { '@anotoki/lib/migrations': ['SiteGateComponent', 'SitePagesDirective', 'SiteStatus', 'siteStatusInterceptor', 'provideAnotokiMigrations'] },
    limit: 9,
    words: [...KIT_WORDS, 'siteStatus'],
  },
  { title: 'the bar', imports: { '@anotoki/lib/shell': ['TopBarComponent', 'ThemeService', 'provideAnotokiShell'], '@anotoki/lib/ui/config': ['provideAnotokiUi'] }, limit: 21.5, words: KIT_WORDS },
  { title: 'the words', imports: { '@anotoki/lib/translations': ['TranslationService', 'TranslatePipe', 'provideAnotokiTranslations'] }, limit: 7.5, words: KIT_WORDS },
  { title: 'a button', imports: { '@anotoki/lib/ui/button': ['ButtonComponent'] }, limit: 5.5, words: KIT_WORDS },
  { title: 'a select', imports: { '@anotoki/lib/ui/select': ['SelectComponent'] }, limit: 7.5, words: KIT_WORDS },
  {
    title: 'the sign-in',
    imports: {
      '@anotoki/lib/migrations': ['SiteGateComponent', 'SitePagesDirective', 'SiteStatus', 'siteStatusInterceptor', 'provideAnotokiMigrations'],
      '@anotoki/lib/auth': [
        'AnotokiAuth',
        'anotokiAuthInterceptor',
        'provideAnotokiAuth',
        'personOrVisitorGuard',
        'staffGuard',
        'AccountPreferences',
        'AuthCallbackComponent',
        'SignInFailureComponent',
      ],
    },
    limit: 19.5,
    words: [...KIT_WORDS, 'siteStatus', 'signIn'],
  },
  { title: 'the badge', imports: { '@anotoki/lib/admin': ['provideAnotokiAdmin', 'FeedbackUnread'] }, limit: 1, words: [] },
  {
    title: 'the words + feedback',
    imports: {
      '@anotoki/lib/translations': ['TranslationService', 'TranslatePipe', 'provideAnotokiTranslations'],
      '@anotoki/lib/feedback': ['provideAnotokiFeedback'],
    },
    limit: 9,
    words: [...KIT_WORDS, 'feedback'],
  },
  { title: 'the error report', imports: { '@anotoki/lib/error-report': ['provideAnotokiErrorReport'] }, limit: 2.5, words: [] },
  {
    title: 'the words + legal links',
    imports: {
      '@anotoki/lib/translations': ['TranslationService', 'TranslatePipe', 'provideAnotokiTranslations'],
      '@anotoki/lib/legal': ['provideAnotokiLegal', 'LegalLinksComponent'],
    },
    limit: 9,
    words: [...KIT_WORDS, 'legalLinks'],
  },
  {
    title: 'the footer',
    imports: {
      '@anotoki/lib/legal': ['provideAnotokiLegal'],
      '@anotoki/lib/footer': ['SiteFooterComponent'],
    },
    limit: 9,
    words: [...KIT_WORDS, 'legalLinks', 'footer'],
  },
];

/**
 * Gzipped kB a first load may gain beside those lazy pages: what they use of a file the first page uses too (a token,
 * a provider function, the menu's popover beside the menu) and the exports the shared chunk gains for them. A
 * component of the kit is more; a first load that gains one has an import that reaches a piece it does not use.
 */
const SHARED_SLACK = 1;

/** Each entry point's name and its FESM, from the package's exports. */
const entries = Object.entries(manifest.exports)
  .filter(([key, value]) => key.startsWith('.') && typeof value === 'object' && value?.default?.endsWith('.mjs'))
  .map(([key, value]) => ({ name: '@anotoki/lib' + key.slice(1), file: join(dist, value.default) }));
const fileOf = new Map(entries.map((entry) => [entry.name, entry.file]));

// A module's own words import nothing; @anotoki/lib/words gathers the kit's (ui/config) and every module's. Known from
// the package itself, so a namespace the words script adds needs nothing here - only its module's MAY_IMPORT names it.
const WORD_ENTRIES = entries.map(({ name }) => name).filter((name) => name.startsWith(`${WORDS}/`));
for (const name of WORD_ENTRIES) {
  MAY_IMPORT[name] ??= [];
}
MAY_IMPORT[WORDS] = ['@anotoki/lib/ui/config', ...WORD_ENTRIES];

const problems = [];
const rows = [];
const codeOf = {};
const weights = {};

const kb = (bytes) => (bytes / 1024).toFixed(1);
const gz = (code) => gzipSync(code, { level: 9 }).length;

for (const { name, file } of entries) {
  const source = readFileSync(file, 'utf8');
  // The code alone: the comments (JSDoc, the license's) stay out of a site's bundle.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  codeOf[name] = code;
  weights[name] = gz(code) / 1024;
  const limit = name === CORE ? undefined : (LIMITS[name] ?? LAZY_LIMITS[name]);
  rows.push([name, kb(Buffer.byteLength(source)), weights[name].toFixed(1), limit ? `${limit}` : '']);

  if (!(name in MAY_IMPORT)) {
    problems.push(`${name}: an entry point check-package.mjs does not know - add it to MAY_IMPORT (and LIMITS if it is eager).`);
    continue;
  }
  // A module's name holds no white space: so the words 'from' and 'to' in a page's own code (the audit log's date
  // filters) are never read as an import of what follows them.
  const imported = new Set([...code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"\s]+)['"]/g)].map((match) => match[1]));
  for (const specifier of imported) {
    if (OTHERS.test(specifier)) {
      continue;
    }
    if (!MAY_IMPORT[name].includes(specifier)) {
      problems.push(`${name} imports ${specifier}, which it may not.`);
    }
  }
  if (limit && weights[name] > limit) {
    problems.push(`${name} is ${weights[name].toFixed(1)} kB gzipped, over its ${limit} kB.`);
  }
}
for (const name of Object.keys(LAZY_LIMITS).filter((name) => !fileOf.has(name))) {
  problems.push(`${name}: LAZY_LIMITS names an entry point the package does not have.`);
}

// The core's barrel holds re-exports alone: code of its own would be one more file every first page reaching it takes.
if (codeOf[CORE].replace(/export\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, '').trim() !== '') {
  problems.push(`${CORE} holds code of its own: it re-exports the pieces (${CORE}/...), and a piece is an entry point of its own.`);
}

// The library's words stay with their readers: the kit's file holds the kit's namespaces alone, and each words entry
// point one namespace - which its module imports, and the kit never does (MAY_IMPORT above).
const notTheKits = [...namespacesIn(codeOf['@anotoki/lib/ui/config'] ?? '')].filter((namespace) => !KIT_WORDS.includes(namespace));
if (notTheKits.length) {
  problems.push(
    `@anotoki/lib/ui/config holds the words of ${notTheKits.map((namespace) => `anotoki.${namespace}.*`).join(', ')}: the kit's file holds the kit's namespaces alone - a module's words are ${WORDS}/<namespace>'s (bun run words).`,
  );
}
for (const name of WORD_ENTRIES) {
  const held = [...namespacesIn(codeOf[name] ?? '')];
  if (held.length !== 1) {
    problems.push(`${name} holds the words of ${held.length ? held.join(', ') : 'no namespace'}: a words entry point holds one namespace (bun run words).`);
  }
}

// A module's words reach the translations module only through its registration: the translations module imports no
// words entry point, nor does any module @anotoki/lib/words (every namespace's), and a module that imports its own
// namespace's registers them - provideLibraryWords(<them>) among the providers of its provide*() function.
for (const [name, code] of Object.entries(codeOf)) {
  if (name === WORDS || name.startsWith(`${WORDS}/`)) {
    continue;
  }
  for (const [, bindings, from] of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](@anotoki\/lib\/words(?:\/[^'"]+)?)['"]/g)) {
    if (name.startsWith('@anotoki/lib/translations')) {
      problems.push(`${name} imports ${from}: a module's words reach the translations module only through the module's registration (provideLibraryWords), never by an import.`);
      continue;
    }
    if (from === WORDS) {
      problems.push(`${name} imports ${WORDS}, every module's words: a module imports its own namespace's alone.`);
      continue;
    }
    // Words their lazy pages read themselves: those pages import them unregistered, and nothing else imports them.
    if (from in READ_BY_THEIR_PAGES) {
      if (!READ_BY_THEIR_PAGES[from].includes(name)) {
        problems.push(`${name} imports ${from}, which only ${READ_BY_THEIR_PAGES[from].join(', ')} may: its pages read those words themselves, and no first load may carry them.`);
      }
      continue;
    }
    for (const binding of bindings
      .split(',')
      .map((part) =>
        part
          .trim()
          .split(/\s+as\s+/)
          .pop(),
      )
      .filter(Boolean)) {
      if (!new RegExp(`\\bprovideLibraryWords\\(\\s*${binding}\\s*\\)`).test(code)) {
        problems.push(`${name} takes ${binding} from ${from} without registering it (provideLibraryWords(${binding})): a module's words reach the translations module only through its registration.`);
      }
    }
  }
}

// The core whole: its pieces' code in one, as a site that uses every piece takes them.
const core = gz(PIECES.map((piece) => codeOf[piece] ?? '').join('\n')) / 1024;
if (core > LIMITS[CORE]) {
  problems.push(`${CORE} with its pieces is ${core.toFixed(1)} kB gzipped, over its ${LIMITS[CORE]} kB.`);
}
rows.push([`${CORE} + pieces`, '', core.toFixed(1), `${LIMITS[CORE]}`]);

// The Migrations page stays out of the gate's entry point: it is in every site's first load.
if (codeOf['@anotoki/lib/migrations'].includes('anotoki-migrations-page')) {
  problems.push('@anotoki/lib/migrations holds the Migrations page again: it belongs to @anotoki/lib/migrations/page alone.');
}

// The same for the translations: the service and the pipes are in every site's first load, the admin pages never.
if (/anotoki-(translations|languages)-page/.test(codeOf['@anotoki/lib/translations'])) {
  problems.push('@anotoki/lib/translations holds an admin page: they belong to @anotoki/lib/translations/admin alone.');
}

const together = core + (weights['@anotoki/lib/shell'] ?? 0);
if (together > UI_AND_SHELL) {
  problems.push(`ui and shell together are ${together.toFixed(1)} kB gzipped, over ${UI_AND_SHELL} kB.`);
}

const exported = Object.keys(manifest.exports).filter((key) => key !== './package.json' && !key.endsWith('*') && key !== './styles');
if (exported.length !== entries.length) {
  problems.push(`package.json exports ${exported.length} entry points with code, ${entries.length} of them name an FESM.`);
}
if (manifest.exports['./styles']?.sass !== './styles/_index.scss') {
  problems.push('package.json does not export ./styles to Sass.');
}

rows.sort((a, b) => a[0].localeCompare(b[0], 'en'));
const widths = [36, 10, 10, 8];
const line = (cells) => cells.map((cell, index) => String(cell)[index ? 'padStart' : 'padEnd'](widths[index])).join(' ');
console.log('\n' + line(['entry point', 'raw kB', 'code gz kB', 'limit']));
for (const row of rows) {
  console.log(line(row));
}
console.log(line(['ui + shell', '', together.toFixed(1), String(UI_AND_SHELL)]));

// The CLI's own tools: its Sass and its esbuild, and the transformer its esbuild plugin runs on a package's files (a
// private export of @angular/build - an Angular update that moves it fails here, and this check follows it).
const require = createRequire(import.meta.url);
const angularBuild = createRequire(require.resolve('@angular/build/package.json'));
const sass = angularBuild('sass');
const esbuild = angularBuild('esbuild');

// ---------------------------------------------------------------------------------------------------------------------
// Valid CSS: where Sass inspects a one-item list it writes `(…,)`, which no property takes - a shadow or a filter
// that reads it is dropped (0.2.0's shadow-sm in both themes, and the mark's light outline in dark). Neither the tokens
// as root() and token() write them - the family's, and a site's own one-item values - nor any component's styles hold
// one.

const TRAILING_COMMA = /,\s*\)/;
const tokens = sass.compileString(
  `@use "sass:map";
    @use "styles" as anotoki;
    @include anotoki.root;
    @include anotoki.root((light: (shadow-sm: (0 1px 2px red,)), dark: (mark-shadow: (drop-shadow(0 0 1px white),)), font-sans: ("A Site Font",)));
    @include anotoki.base;
    @include anotoki.utilities;
    @include anotoki.tables;
    @each $name, $value in map.merge(anotoki.$light, anotoki.$shared) { .token-#{$name} { value: anotoki.token($name); } }`,
  { loadPaths: [dist] },
).css;
const invalid = new Set();
for (const declaration of tokens.split(/[;{}]/).filter((part) => TRAILING_COMMA.test(part))) {
  invalid.add(`@anotoki/lib/styles writes a one-item list as Sass reads it, not as CSS: ${declaration.trim().slice(0, 140)}`);
}
for (const { name, file } of entries) {
  const source = readFileSync(file, 'utf8');
  for (const styles of source.matchAll(/styles:\s*\[\s*("(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")*)\s*\]/g)) {
    for (const broken of styles[1].match(/[^;{}"]*,\s*\)[^;{}"]*/g) ?? []) {
      invalid.add(`${name}: a component's styles hold a one-item list as Sass reads it, not as CSS: ${broken.trim().slice(0, 140)}`);
    }
  }
}
problems.push(...invalid);

// ---------------------------------------------------------------------------------------------------------------------
// Text, never markup: every bundle the package ships (fesm2022/*.mjs, as the IAM's deploy check reads them), line by
// line as it is - comments too - against the IAM's own pattern. The fix is code that draws text, never a spelling or
// a comment that slips past this. Every way a string becomes markup counts, as the IAM's deploy check counts them:
// innerHTML / outerHTML, the newer setHTMLUnsafe, inserting HTML, an iframe's srcdoc, document.write, parsing it
// (DOMParser, parseFromString, Document.parseHTMLUnsafe, a Range's createContextualFragment), and the sanitizer's
// bypasses (the 0.6.0 review: for the five sites with no deploy check of their own, this is the only gate).

const HTML_SINK = /innerHTML|outerHTML|setHTMLUnsafe|parseHTMLUnsafe|insertAdjacentHTML|bypassSecurityTrust|srcdoc|document\.write|DOMParser|parseFromString|createContextualFragment/i;
const bundles = join(dist, 'fesm2022');
for (const bundleName of readdirSync(bundles).filter((file) => file.endsWith('.mjs'))) {
  readFileSync(join(bundles, bundleName), 'utf8')
    .split(/\r?\n/)
    .forEach((text, index) => {
      const found = HTML_SINK.exec(text);
      if (found) {
        problems.push(
          `fesm2022/${bundleName}:${index + 1} names ${found[0]}: the library puts no string into a page as HTML and never switches Angular's sanitizer off (the IAM's deploy check refuses such a release).`,
        );
      }
    });
}

// ---------------------------------------------------------------------------------------------------------------------
// Floors and first loads: the package as a site's production build takes it.
const { JavaScriptTransformer } = require('@angular/build/private');
if (typeof JavaScriptTransformer !== 'function') {
  console.error("\ncheck-package: @angular/build/private has no JavaScriptTransformer any more - find what the CLI's esbuild plugin runs on a package's files now, and run that here.");
  process.exit(1);
}

// As the CLI's esbuild plugin does for a package's file: linked, its top-level code marked pure where Angular's own
// rules allow (in a package that is not @angular/*, a class with Angular's static fields and InjectionToken alone),
// the package's "sideEffects": false given.
const transformer = new JavaScriptTransformer({ sourcemap: false, advancedOptimizations: true, jit: false }, 2);
const transformed = new Map();
async function transform(file) {
  if (!transformed.has(file)) {
    transformed.set(file, Buffer.from(await transformer.transformFile(file, false, false)).toString('utf8'));
  }
  return transformed.get(file);
}

/** Bundles `modules` (name -> code) as the CLI does for production, Angular and rxjs left outside. */
async function bundle(modules, { forced = null, later = true } = {}) {
  return esbuild.build({
    entryPoints: Object.keys(modules).map((name) => 'page:' + name),
    bundle: true,
    format: 'esm',
    splitting: true,
    write: false,
    outdir: 'out',
    metafile: true,
    minify: true,
    target: 'es2022',
    pure: ['forwardRef'],
    conditions: ['module', 'production'],
    define: { ngDevMode: 'false', ngJitMode: 'false', ngServerMode: 'false', ngHmrMode: 'false' },
    logLevel: 'silent',
    plugins: [
      {
        name: 'check-package',
        setup(build) {
          build.onResolve({ filter: /^page:/ }, (args) => ({ path: args.path.slice(5), namespace: 'page' }));
          build.onLoad({ filter: /.*/, namespace: 'page' }, (args) => ({ contents: modules[args.path], loader: 'js', resolveDir: dist }));
          build.onResolve({ filter: /^@anotoki\/lib(\/.*)?$/ }, (args) =>
            // `later` false: a part an entry point loads by import() stays out (a floor counts what is kept up front).
            !later && args.kind === 'dynamic-import'
              ? { path: args.path, external: true }
              : fileOf.has(args.path)
                ? { path: fileOf.get(args.path), sideEffects: args.path === forced }
                : { errors: [{ text: `no entry point ${args.path}` }] },
          );
          build.onResolve({ filter: /^(@angular\/|rxjs|tslib)/ }, (args) => ({ path: args.path, external: true }));
          build.onLoad({ filter: /\.mjs$/ }, async (args) => ({ contents: await transform(args.path), loader: 'js' }));
        },
      },
    ],
  });
}

/** The code of an output, without its import statements (Angular's, which stay outside here, and the chunks'). */
const withoutImports = (text) => text.replace(/import\s*(?:[^;"']*?\s*from\s*)?["'][^"']+["'];?/g, '').trim();

/** What a page loads before it runs: its own output and every chunk it imports, transitively; the package's files in it. */
function firstLoad(result, page) {
  const outputs = result.metafile.outputs;
  const start = Object.keys(outputs).find((name) => outputs[name].entryPoint === 'page:' + page);
  const loaded = new Set();
  const visit = (name) => {
    if (loaded.has(name)) {
      return;
    }
    loaded.add(name);
    outputs[name].imports.filter((record) => record.kind === 'import-statement' && !record.external).forEach((record) => visit(record.path));
  };
  visit(start);
  const files = new Map();
  let code = '';
  for (const name of loaded) {
    code += withoutImports(result.outputFiles.find((output) => output.path.replace(/\\/g, '/').endsWith('/' + name)).text);
    for (const [input, { bytesInOutput }] of Object.entries(outputs[name].inputs)) {
      if (input.replace(/\\/g, '/').includes('/fesm2022/')) {
        files.set(basename(input), (files.get(basename(input)) ?? 0) + bytesInOutput);
      }
    }
  }
  return { files, code, gz: gz(code) / 1024 };
}

/** The namespaces of the library's words in a first load, the kit's as one: "kit, siteStatus". */
function wordsOf(code) {
  const namespaces = [...namespacesIn(code)];
  const others = namespaces.filter((namespace) => !KIT_WORDS.includes(namespace)).sort();
  return [...(namespaces.length > others.length ? ['kit'] : []), ...others].join(', ') || '-';
}

const firstLoadRows = [];
try {
  // Floors: an entry point taken for nothing - its module kept, nothing of it used - leaves no code.
  for (const { name } of entries) {
    const result = await bundle({ floor: `import "${name}";` }, { forced: name, later: false });
    const left = withoutImports(result.outputFiles.map((output) => output.text).join(''));
    if (left !== '') {
      problems.push(`${name} leaves ${Buffer.byteLength(left)} bytes in a bundle that uses nothing of it - top-level code a site's build keeps: ${left.slice(0, 160)}`);
    }
  }

  // First loads, beside lazy pages that use every other entry point whole (a testing helper is never in a page).
  for (const { title, imports, limit, words } of FIRST_LOADS) {
    const names = Object.values(imports).flat();
    const page = Object.entries(imports)
      .map(([entry, used]) => `import { ${used.join(', ')} } from "${entry}";`)
      .concat(`export default [${names.join(', ')}];`)
      .join('\n');
    const others = entries.filter(({ name }) => !(name in imports) && !name.endsWith('/testing') && name !== '@anotoki/lib');
    const lazy = others
      .map(({ name }, index) => `import * as m${index} from "${name}";`)
      .concat(`export default [${others.map((_, index) => 'm' + index).join(', ')}];`)
      .join('\n');
    const alone = firstLoad(await bundle({ first: page }), 'first');
    const beside = firstLoad(await bundle({ first: page, lazy }), 'first');
    const extra = [...beside.files.keys()].filter((file) => !alone.files.has(file));
    if (extra.length) {
      problems.push(`${title}: the first load takes ${extra.join(', ')} when lazy pages use them, files it does not use itself - an import of the first page reaches them (through ${CORE}?).`);
    }
    if (beside.gz - alone.gz > SHARED_SLACK) {
      const grown = [...beside.files]
        .map(([file, bytes]) => [file, bytes - (alone.files.get(file) ?? 0)])
        .filter(([, more]) => more > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([file, more]) => `${file} +${kb(more)} kB`);
      problems.push(
        `${title}: the first load gains ${(beside.gz - alone.gz).toFixed(1)} kB gzipped when lazy pages use the rest of the package, over ${SHARED_SLACK} kB - what they use shares a file with what it uses (${grown.join(', ')}).`,
      );
    }
    if (beside.gz > limit) {
      problems.push(`${title}: the first load takes ${beside.gz.toFixed(1)} kB gzipped of the package, over its ${limit} kB.`);
    }
    // Its words: the namespaces its page says, and no module's that it does not - beside lazy pages that say them all.
    const strange = words === null ? [] : [...namespacesIn(beside.code)].filter((namespace) => !words.includes(namespace));
    if (strange.length) {
      problems.push(
        `${title}: the first load carries the words of ${strange.map((namespace) => `anotoki.${namespace}.*`).join(', ')}, which its page does not say - a module's words are ${WORDS}/<namespace>'s, imported by that module alone.`,
      );
    }
    firstLoadRows.push([title, alone.gz.toFixed(1), beside.gz.toFixed(1), String(limit), wordsOf(beside.code)]);
  }
} finally {
  await transformer.close();
}

const loadWidths = [36, 10, 10, 8, 0];
const loadLine = (cells) => cells.map((cell, index) => (index === 4 ? '  ' + cell : String(cell)[index ? 'padStart' : 'padEnd'](loadWidths[index]))).join(' ');
console.log('\n' + loadLine(['first load (code gz kB)', 'alone', '+ lazy', 'limit', 'words']));
for (const row of firstLoadRows) {
  console.log(loadLine(row));
}

if (problems.length) {
  console.error('\n' + problems.map((problem) => 'check-package: ' + problem).join('\n'));
  process.exit(1);
}
console.log('\ncheck-package: every entry point within its limits and boundaries, its CSS valid, its strings text, nothing kept that is not used, every first load within its own.');
