/*
 * @anotoki/lib/translations - a site's words, one implementation for every
 * anotoki site: which language the pages are read in and the strings for it
 * (TranslationService, from the site's bundle route, with English under it),
 * the `translate` and `translatePlural` pipes, the wiring into the kit's words
 * and the shell's language switcher, the status page's words, and the guard of
 * the admin pages. The server's half is the PHP package anotoki/lib
 * (Anotoki\Lib\Translations); one wire format, the IAM's.
 *
 * Eager (every page reads it). The admin Translations and Languages pages are
 * an entry point of their own, @anotoki/lib/translations/admin, so a site's
 * first load never carries them; a spec's stand-in is
 * @anotoki/lib/translations/testing.
 */

export type { AnotokiTranslationsConfig, BundleRefusal, TranslationGroup, TranslationSettings, TranslationsAccount, TranslationsAdminConfig, TranslationsFailure } from './src/config';
export { ANOTOKI_TRANSLATIONS_CONFIG, ANOTOKI_TRANSLATION_BUNDLE, provideAnotokiTranslations, translationSettings } from './src/config';
export type { AdminLanguage, LanguageChanges, LanguageDeleted, NewLanguage, SiteLanguage, TranslationBundle, TranslationChanges, TranslationGrid, TranslationKeyRow } from './src/models';
export type { LanguageCandidate, LanguageSources, TranslationParams } from './src/language';
export { FALLBACK_LANGUAGE, addressLanguage, bundleFrom, fillPlaceholders, isAdminArea, languageCandidates, languageCode, pickLanguage } from './src/language';
export type { LanguageChoice, ShellLanguages } from './src/translation.service';
export { TranslationService } from './src/translation.service';
export { TranslatePipe } from './src/translate.pipe';
export { TranslatePluralPipe } from './src/translate-plural.pipe';
export type { SiteStatusWordName, StatusWords } from './src/site-status-words';
export { SITE_STATUS_WORD_NAMES, siteStatusWords } from './src/site-status-words';
export type { HoldsUnsavedChanges } from './src/unsaved-changes.guard';
export { anotokiUnsavedChangesGuard } from './src/unsaved-changes.guard';

// For @anotoki/lib/translations/admin only; not a site's API.
export { readTab as ɵreadTab, writeTab as ɵwriteTab } from './src/storage';
