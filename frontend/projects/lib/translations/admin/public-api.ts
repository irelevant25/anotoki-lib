/*
 * @anotoki/lib/translations/admin - the admin Translations and Languages
 * pages, <anotoki-translations-page> and <anotoki-languages-page> (English,
 * drawn with the kit), and the drafts they keep: an entry point of its own, so
 * a site's first load never carries them.
 *
 *   { path: 'translations', canDeactivate: [anotokiUnsavedChangesGuard],
 *     loadComponent: () => import('@anotoki/lib/translations/admin').then((m) => m.TranslationsPageComponent) }
 *
 * (The guard is @anotoki/lib/translations': a route's guard is in the first load.)
 */

export { TranslationsPageComponent } from './src/translations-page/translations-page.component';
export { LanguagesPageComponent } from './src/languages-page/languages-page.component';
export type { LanguageDraft } from './src/localization-drafts.service';
export { LocalizationDrafts } from './src/localization-drafts.service';
