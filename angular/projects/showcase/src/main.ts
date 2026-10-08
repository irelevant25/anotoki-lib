import { HttpInterceptorFn, HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer, provideZonelessChangeDetection, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideAnotokiMigrations, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { AnotokiThemeMode, ThemeService, provideAnotokiShell } from '@anotoki/lib/shell';
import { TranslationService, anotokiUnsavedChangesGuard, provideAnotokiTranslations, siteStatusWords } from '@anotoki/lib/translations';
import { provideAnotokiUi } from '@anotoki/lib/ui';
import { iconLanguages, iconTrash, iconUsers } from '@anotoki/lib/ui/icons';
import { delay, of } from 'rxjs';
import { AppComponent } from './app/app.component';
import { SHOWCASE_GROUPS, wordsServer } from './app/words-server';

/** The query, read before the translations take ?lang=sk out of the address (it holds for the tab then). */
const params = new URLSearchParams(location.search);

/** ?visitor=1: nobody signed in, not the site's ADMIN (the status page's visitor view, with Sign in; the admin pages say whose they are). */
const admin = signal(!params.get('visitor'));

/** The account's theme: ?account=1 makes somebody signed in whose account refuses a choice (the refusal note). */
const account = signal<AnotokiThemeMode | null>(params.get('account') ? 'light' : null);

const MIGRATIONS = {
  sets: ['site'],
  applied: [
    { set: 'site', name: '001_initial_schema.sql', applied_at: '2026-09-28T10:00:00Z' },
    { set: 'site', name: '002_translations.sql', applied_at: '2026-09-30T18:12:00Z' },
    { set: 'site', name: '003_languages.sql', applied_at: '2026-10-02T08:40:00Z' },
  ],
  pending: [
    { set: 'site', name: '004_announcements.sql', ready: true, blocked: false },
    { set: 'site', name: '005_account_deletion.sql', ready: false, blocked: false },
    { set: 'site', name: '006_sign_in_devices.sql', ready: true, blocked: true },
  ],
  missing: [{ set: 'site', name: '000_bootstrap.sql', applied_at: '2026-09-01T00:00:00Z' }],
};

/** The server, as the showcase imagines it: a site whose database waits for an update. */
const fixtures: HttpInterceptorFn = (request, next) => {
  const answer = (body: unknown, wait = 0) => of(new HttpResponse({ status: 200, body })).pipe(delay(wait));
  switch (request.url) {
    case '/api/site-status':
      return answer({ state: 'update_pending', installed: true });
    case '/api/admin/migrations':
      return answer(MIGRATIONS, 300);
    case '/api/admin/migrations/file':
      return answer({ set: 'site', name: request.params.get('name'), sql: '-- The first tables.\nCREATE TABLE people (\n    id SERIAL PRIMARY KEY,\n    name VARCHAR(200) NOT NULL\n);\n' }, 300);
    case '/api/admin/migrations/apply':
      return answer({ applied: [{ set: 'site', name: '004_announcements.sql' }], failed: null, error: null, note: 'A copy of every table was saved first.' }, 900);
    default:
      return next(request);
  }
};

/** The showcase's admin pages: English, whatever the page is read in. */
const ENGLISH_AREAS = /^\/(migrations|translations|languages)(\/|\?|#|$)/;

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    // The translations' routes (words-server.ts) answer from memory, before the rest of the imagined server.
    provideHttpClient(withInterceptors([wordsServer, fixtures, siteStatusInterceptor])),
    provideRouter([
      { path: '', loadComponent: () => import('./app/gallery/gallery.component').then((m) => m.GalleryComponent) },
      { path: 'migrations', loadComponent: () => import('./app/migrations-demo/migrations-demo.component').then((m) => m.MigrationsDemoComponent) },
      { path: 'translations', canDeactivate: [anotokiUnsavedChangesGuard], loadComponent: () => import('@anotoki/lib/translations/admin').then((m) => m.TranslationsPageComponent) },
      { path: 'languages', canDeactivate: [anotokiUnsavedChangesGuard], loadComponent: () => import('@anotoki/lib/translations/admin').then((m) => m.LanguagesPageComponent) },
      { path: '**', redirectTo: '' },
    ]),
    // The words: the bundle's language (?lang=sk, a choice in the bar), the database's strings over the library's.
    provideAnotokiTranslations(() => ({
      storagePrefix: 'anotoki-showcase',
      englishOnly: (url) => ENGLISH_AREAS.test(url),
      admin: {
        allows: { strings: () => admin(), languages: () => admin() },
        routes: { translations: '/translations', languages: '/languages', migrations: '/migrations' },
        siteName: 'the showcase',
        groups: SHOWCASE_GROUPS,
      },
    })),
    provideAnotokiUi(() => ({ ...inject(TranslationService).forKit(), icons: { trash: iconTrash, users: iconUsers, languages: iconLanguages } })),
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
