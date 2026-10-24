import { HttpInterceptorFn, HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer, provideZonelessChangeDetection, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideAnotokiAdmin } from '@anotoki/lib/admin';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { provideAnotokiFeedback } from '@anotoki/lib/feedback';
import { provideAnotokiLegal } from '@anotoki/lib/legal';
import { provideAnotokiMigrations, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { provideAnotokiPeople } from '@anotoki/lib/people';
import { AnotokiThemeMode, ThemeService, provideAnotokiShell } from '@anotoki/lib/shell';
import { TranslationService, anotokiUnsavedChangesGuard, provideAnotokiTranslations, siteStatusWords } from '@anotoki/lib/translations';
import { provideAnotokiUi } from '@anotoki/lib/ui';
import { iconGamepad, iconLanguages, iconLightbulb, iconMinus, iconPause, iconRocket, iconSave, iconTrash, iconUpload, iconUsers, iconWrench } from '@anotoki/lib/ui/icons';
import { ToastService } from '@anotoki/lib/ui/toast';
import { delay, of } from 'rxjs';
import { IAM_CASE, adminServer } from './app/admin-server';
import { AppComponent } from './app/app.component';
import { showcaseLegalFacts } from './app/legal-facts';
import { peopleServer } from './app/people-server';
import { SignInDemoComponent, signInDemoProviders } from './app/sign-in-demo/sign-in-demo.component';
import { SHOWCASE_GROUPS, wordsServer } from './app/words-server';

/** The query, read before the translations take ?lang=sk out of the address (it holds for the tab then). */
const params = new URLSearchParams(location.search);

/** ?visitor=1: nobody signed in, not the site's ADMIN (the status page's visitor view, with Sign in; the admin pages say whose they are). */
const admin = signal(!params.get('visitor'));

/** The account's theme: ?account=1 makes somebody signed in whose account refuses a choice (the refusal note). */
const account = signal<AnotokiThemeMode | null>(params.get('account') ? 'light' : null);

/** ?editor=1: the admin pages for somebody the site lets change its words and languages, but not delete or import (the survey's EDITORs). */
const editor = signal(!!params.get('editor'));

const MIGRATIONS = {
  sets: ['site', 'anotoki_translations'],
  applied: [
    { set: 'site', name: '001_initial_schema.sql', applied_at: '2026-09-28T10:00:00Z' },
    { set: 'site', name: '002_translations.sql', applied_at: '2026-09-30T18:12:00Z' },
    { set: 'site', name: '003_languages.sql', applied_at: '2026-10-02T08:40:00Z' },
    { set: 'anotoki_translations', name: '001_languages_and_strings.sql', applied_at: '2026-10-11T07:30:00Z' },
    { set: 'anotoki_translations', name: '002_library_words.sql', applied_at: '2026-10-11T07:30:00Z' },
  ],
  pending: [
    { set: 'site', name: '004_announcements.sql', ready: true, blocked: false },
    { set: 'site', name: '005_account_deletion.sql', ready: false, blocked: false },
    { set: 'site', name: '006_sign_in_devices.sql', ready: true, blocked: true },
    { set: 'anotoki_translations', name: '003_sign_in_words.sql', ready: true, blocked: true },
  ],
  missing: [{ set: 'site', name: '000_bootstrap.sql', applied_at: '2026-09-01T00:00:00Z' }],
};

/** A migration file as the family writes them - what View shows for every file: its comments, tables, rows and gate. */
const MIGRATION_SQL = [
  '-- site 001 - the first tables: the people who use the site, and the notes they leave',
  '--',
  '-- Released with the first version, and never edited once released: a change is a new file.',
  '',
  'CREATE TABLE IF NOT EXISTS people (',
  '    id          BIGSERIAL     PRIMARY KEY,',
  '    name        VARCHAR(200)  NOT NULL,',
  '    email       TEXT          NOT NULL UNIQUE,',
  "    language    VARCHAR(10)   NOT NULL DEFAULT 'en',",
  '    score       NUMERIC(5, 2) NOT NULL DEFAULT 0.5,',
  '    created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  "    CONSTRAINT people_language_check CHECK (language ~ '^[a-z]{2}$')",
  ');',
  '',
  '/* The notes: kept 365 days, an "address" only where the sender typed one. */',
  'CREATE TABLE IF NOT EXISTS notes (',
  '    id         BIGSERIAL PRIMARY KEY,',
  '    person_id  BIGINT    REFERENCES people (id) ON DELETE CASCADE,',
  '    body       TEXT      NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),',
  '    "address"  TEXT',
  ');',
  '',
  'INSERT INTO people (name, email, language)',
  "VALUES ('Ana', 'ana@example.com', 'sk'), ('O''Brien', 'ob@example.com', 'en')",
  'ON CONFLICT (email) DO NOTHING;',
  '',
  '-- The table must be the site’s: every column there.',
  'DO $$',
  'DECLARE',
  '    problems TEXT[] := ARRAY[]::TEXT[];',
  '    wanted   CONSTANT INTEGER := 6;',
  '    found    INTEGER;',
  'BEGIN',
  '    SELECT count(*) INTO found',
  '      FROM information_schema.columns',
  "     WHERE table_schema = current_schema() AND table_name = 'people';",
  '    IF found <> wanted THEN',
  "        problems := problems || format('people has %s columns, not %s', found, wanted);",
  '    END IF;',
  '    IF array_length(problems, 1) > 0 THEN',
  "        RAISE EXCEPTION 'site 001: %.', array_to_string(problems, '; ');",
  '    END IF;',
  'END $$;',
  '',
  '-- end of 001',
  '',
].join('\n');

/** The server, as the showcase imagines it: a site whose database waits for an update. */
const fixtures: HttpInterceptorFn = (request, next) => {
  const answer = (body: unknown, wait = 0) => of(new HttpResponse({ status: 200, body })).pipe(delay(wait));
  switch (request.url) {
    case '/api/site-status':
      return answer({ state: 'update_pending', installed: true });
    case '/api/admin/migrations':
      return answer(MIGRATIONS, 300);
    case '/api/admin/migrations/file':
      return answer({ set: 'site', name: request.params.get('name'), sql: MIGRATION_SQL }, 300);
    case '/api/admin/migrations/apply':
      return answer({ applied: [{ set: 'site', name: '004_announcements.sql' }], failed: null, error: null, note: 'A copy of every table was saved first.' }, 900);
    default:
      return next(request);
  }
};

/** The showcase's admin pages: English, whatever the page is read in (the admin frame's, 0.10.0, too). */
const ENGLISH_AREAS = /^\/(migrations|translations|languages|people|admin|admin-frame)(\/|\?|#|$)/;

/** The admin frame's pages (0.10.0): one page of its own a section, titled by its route. */
const framePage = (path: string, title: string) => ({
  path,
  pathMatch: 'full' as const,
  data: { title },
  loadComponent: () => import('./app/admin-frame-demo/admin-frame-page.component').then((m) => m.AdminFramePageComponent),
});

/** ?signedin=1: somebody signed in, for the feedback form (their address written in, "send it without my name"). */
const signedIn = signal(!!params.get('signedin'));

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    // The translations' routes (words-server.ts), the people's (people-server.ts), and the admin tools' and the
    // feedback form's (admin-server.ts) answer from memory, before the rest of the imagined server.
    provideHttpClient(withInterceptors([wordsServer, peopleServer, adminServer, fixtures, siteStatusInterceptor])),
    provideRouter([
      { path: '', loadComponent: () => import('./app/gallery/gallery.component').then((m) => m.GalleryComponent) },
      { path: 'migrations', loadComponent: () => import('./app/migrations-demo/migrations-demo.component').then((m) => m.MigrationsDemoComponent) },
      { path: 'translations', canDeactivate: [anotokiUnsavedChangesGuard], loadComponent: () => import('@anotoki/lib/translations/admin').then((m) => m.TranslationsPageComponent) },
      { path: 'languages', canDeactivate: [anotokiUnsavedChangesGuard], loadComponent: () => import('@anotoki/lib/translations/admin').then((m) => m.LanguagesPageComponent) },
      // The People page, against the imagined server (?people=unready, ?people=down for its other states).
      { path: 'people', loadComponent: () => import('@anotoki/lib/people/page').then((m) => m.PeoplePageComponent) },
      // The sign-in failure's screen on a route of its own (?code=state_mismatch, ..., unavailable): the auth module is the route's.
      {
        path: 'sign-in',
        providers: signInDemoProviders(),
        canActivate: [
          () =>
            inject(AnotokiAuth)
              .init()
              .then(() => true),
        ],
        component: SignInDemoComponent,
      },
      {
        path: 'admin',
        loadComponent: () => import('./app/admin-demo/admin-demo.component').then((m) => m.AdminDemoComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'errors' },
          { path: 'errors', loadComponent: () => import('@anotoki/lib/admin/errors').then((m) => m.ErrorLogPageComponent) },
          { path: 'audit', loadComponent: () => import('@anotoki/lib/admin/audit').then((m) => m.AuditLogPageComponent) },
          { path: 'feedback', loadComponent: () => import('@anotoki/lib/admin/feedback').then((m) => m.FeedbackPageComponent) },
          { path: 'backups', loadComponent: () => import('@anotoki/lib/admin/backups').then((m) => m.BackupsPageComponent) },
          { path: 'files', loadComponent: () => import('@anotoki/lib/admin/files').then((m) => m.FilesPageComponent) },
        ],
      },
      // The admin panel's frame (0.10.0): a whole page of its own, outside the showcase's bar and footer (app.component).
      {
        path: 'admin-frame',
        loadComponent: () => import('./app/admin-frame-demo/admin-frame-demo.component').then((m) => m.AdminFrameDemoComponent),
        children: [
          framePage('', 'Dashboard'),
          framePage('characters', 'Characters'),
          framePage('weapons', 'Weapons'),
          framePage('materials', 'Materials'),
          framePage('languages', 'Languages'),
          framePage('translations', 'Translations'),
          framePage('settings', 'Site settings'),
          framePage('feedback', 'Feedback'),
          framePage('backups', 'Backups'),
        ],
      },
      { path: 'feedback', loadComponent: () => import('./app/feedback-demo/feedback-demo.component').then((m) => m.FeedbackDemoComponent) },
      // The legal pages with a sample site's facts (legal-facts.ts: ?iam=1, ?fan=1, ?feedback=0), linked from the footer.
      { path: 'terms', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.TermsPageComponent) },
      { path: 'privacy', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.PrivacyPageComponent) },
      { path: 'contact', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.ContactPageComponent) },
      // The About and Support pages (0.8.0), the same on every site, linked from the footer before the legal pages.
      { path: 'about', loadComponent: () => import('@anotoki/lib/legal/about').then((m) => m.AboutPageComponent) },
      { path: 'support', loadComponent: () => import('@anotoki/lib/legal/support').then((m) => m.SupportPageComponent) },
      { path: '**', redirectTo: '' },
    ]),
    // The People page: the reader is Mira (7); the site deletes what it keeps of a person, in its own words.
    provideAnotokiPeople(() => ({
      me: () => (admin() ? '7' : null),
      isAdmin: admin,
      lead: 'Everybody who signed in and whom the showcase keeps anything of, the most recently seen first: their notes, their time zone, their last import.',
      delete: { label: 'Delete their progress', allowed: (person) => person.anonymized_at === null || person['notes'] !== null },
      visitorsLine: (visitors) => `${visitors.count} visitors - people practising without signing in - with ${visitors['sessions']} rounds. A visitor is deleted 30 days after their last visit.`,
      migrationsRoute: '/migrations',
    })),
    // The admin tools: for the site's ADMIN (?visitor=1: nobody); "Sign in again" says what a site would do.
    provideAnotokiAdmin(() => {
      const toasts = inject(ToastService);
      return {
        isAdmin: admin,
        signInAgain: () => toasts.info("A site sends you through the IAM's sign-in here, and back to this page."),
        migrationsRoute: '/migrations',
        siteName: IAM_CASE ? 'the IAM' : 'the showcase',
        feedbackFields: { steps: 'Steps to reproduce', expected: 'What should have happened' },
        restoreOffText: IAM_CASE
          ? 'A restore of the IAM would bring back the sign-ins ended since and the accounts deleted since: it waits for the work that ends every session and deletes those accounts again.'
          : null,
      };
    }),
    // The visitors' feedback form: in the page's language, the database's words over the library's.
    provideAnotokiFeedback(() => {
      const i18n = inject(TranslationService);
      const slovak = () => i18n.language() === 'sk';
      return {
        language: () => i18n.language(),
        translate: (key) => i18n.libraryWord(key),
        sections: () => [
          { value: 'Characters', label: slovak() ? 'Postavy' : 'Characters' },
          { value: 'Weapons', label: slovak() ? 'Zbrane' : 'Weapons' },
          { value: 'The map', label: slovak() ? 'Mapa' : 'The map' },
        ],
        fields: () => [{ name: 'steps', label: slovak() ? 'Ako sa k tomu dostať' : 'Steps to reproduce', kinds: ['bug'], max: 5000 }],
        signedIn: () => signedIn(),
        email: () => (signedIn() ? 'mira@example.test' : null),
      };
    }),
    // The legal pages and the footer's links: in the page's language, the database's words over the library's.
    provideAnotokiLegal(() => {
      const i18n = inject(TranslationService);
      return {
        language: () => i18n.language(),
        translate: (key) => i18n.libraryWord(key),
        facts: () => showcaseLegalFacts(i18n.language(), IAM_CASE),
      };
    }),
    // The words: the bundle's language (?lang=sk, a choice in the bar), the database's strings over the library's.
    provideAnotokiTranslations(() => ({
      storagePrefix: 'anotoki-showcase',
      englishOnly: (url) => ENGLISH_AREAS.test(url),
      admin: {
        allows: {
          strings: () => admin(),
          importStrings: () => admin() && !editor(),
          languages: () => admin(),
          deleteLanguages: () => admin() && !editor(),
        },
        routes: { translations: '/translations', languages: '/languages', migrations: '/migrations' },
        siteName: 'the showcase',
        groups: SHOWCASE_GROUPS,
      },
    })),
    provideAnotokiUi(() => ({
      ...inject(TranslationService).forKit(),
      icons: {
        trash: iconTrash,
        users: iconUsers,
        languages: iconLanguages,
        // 0.6.0: the build analyzer's own, the family's now.
        rocket: iconRocket,
        upload: iconUpload,
        lightbulb: iconLightbulb,
        pause: iconPause,
        minus: iconMinus,
        wrench: iconWrench,
        gamepad: iconGamepad,
        save: iconSave,
      },
    })),
    provideAnotokiShell(() => ({
      theme: {
        storageKey: 'anotoki-showcase:theme',
        account,
        save: () => new Promise((_, refuse) => setTimeout(() => refuse(new Error('refused')), 300)),
      },
      languages: inject(TranslationService).forShell(),
    })),
    provideAnotokiMigrations(() => {
      const i18n = inject(TranslationService);
      return {
        statusUrl: '/api/site-status',
        apiBase: '/api/admin/migrations',
        migrationsRoute: '/migrations',
        isAdmin: admin,
        isSignedIn: () => false,
        signIn: () => undefined,
        language: () => i18n.effectiveLanguage(),
        get words() {
          return siteStatusWords(i18n);
        },
      };
    }),
    provideAppInitializer(() => inject(TranslationService).init()),
    provideAppInitializer(() => {
      const theme = inject(ThemeService);
      const wanted = params.get('theme');
      if (wanted === 'light' || wanted === 'dark' || wanted === 'auto') {
        theme.set(wanted);
      }
    }),
  ],
}).catch((error) => console.error(error));
