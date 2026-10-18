/*
 * @anotoki/lib/words/site-status - the anotoki library's own words of `anotoki.siteStatus.*`, in English and in
 * Slovak (informal, "ty"). Imported by the module that says them, which registers them with the translations module
 * (provideLibraryWords) - never by the kit nor by the translations module, so they reach a site with the module alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.siteStatus.updatingTitle': 'The site is being updated',
  'anotoki.siteStatus.updatingText': 'It will be back in a few minutes. This page reloads by itself.',
  'anotoki.siteStatus.unavailableTitle': 'The site is not available right now',
  'anotoki.siteStatus.unavailableText': 'Please try again in a few minutes. This page reloads by itself.',
  'anotoki.siteStatus.notSetUpTitle': 'This site is not set up yet',
  'anotoki.siteStatus.notSetUpText': 'Its setup page connects it to its database and to the anotoki sign-in.',
  'anotoki.siteStatus.openSetup': 'Open the setup page',
  'anotoki.siteStatus.tryAgain': 'Try again',
  'anotoki.siteStatus.signIn': 'Sign in',
} as const;

/** A key of these words. */
export type SiteStatusLibraryKey = keyof typeof EN;

const SK: Readonly<Record<SiteStatusLibraryKey, string>> = {
  'anotoki.siteStatus.updatingTitle': 'Stránku práve aktualizujeme',
  'anotoki.siteStatus.updatingText': 'O pár minút bude späť. Táto stránka sa obnoví sama.',
  'anotoki.siteStatus.unavailableTitle': 'Stránka teraz nie je dostupná',
  'anotoki.siteStatus.unavailableText': 'Skús to znova o pár minút. Táto stránka sa obnoví sama.',
  'anotoki.siteStatus.notSetUpTitle': 'Táto stránka ešte nie je nastavená',
  'anotoki.siteStatus.notSetUpText': 'Stránka nastavenia ju prepojí s databázou a s prihlasovaním anotoki.',
  'anotoki.siteStatus.openSetup': 'Otvoriť stránku nastavenia',
  'anotoki.siteStatus.tryAgain': 'Skúsiť znova',
  'anotoki.siteStatus.signIn': 'Prihlásiť sa',
};

/** These words, per language: English and Slovak, each with every key. */
export const SITE_STATUS_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<SiteStatusLibraryKey, string>>>> = { en: EN, sk: SK };
