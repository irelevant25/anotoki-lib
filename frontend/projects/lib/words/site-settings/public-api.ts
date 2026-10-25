/*
 * @anotoki/lib/words/site-settings - the anotoki library's own words of `anotoki.siteSettings.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the site settings' pieces on a site's pages
 * (@anotoki/lib/site-settings: the announcement bar, the administrators' notice), which read them themselves, never
 * registered - never by the kit nor by the translations module, so they reach a site with those pieces alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.siteSettings.announcement': 'Announcement',
  'anotoki.siteSettings.levelInfo': 'Information',
  'anotoki.siteSettings.levelWarning': 'Warning',
  'anotoki.siteSettings.levelDanger': 'Important',
  'anotoki.siteSettings.hide': 'Hide',
  'anotoki.siteSettings.hideName': 'Hide the announcement',
  'anotoki.siteSettings.maintenanceOnTitle': 'The site is closed for maintenance',
  'anotoki.siteSettings.maintenanceOnText': 'Everybody else sees the maintenance page. It shows here because this account is an administrator\'s.',
  'anotoki.siteSettings.pageOffTitle': 'This page is switched off',
  'anotoki.siteSettings.pageOffText': 'Only administrators see it: everybody else gets a page that is not there.',
  'anotoki.siteSettings.pageLimitedTitle': 'This page is not for everybody',
  'anotoki.siteSettings.pageLimitedText': 'It is shown to {audience}. It shows here because this account is an administrator\'s.',
  'anotoki.siteSettings.audienceUser': 'people who are signed in',
  'anotoki.siteSettings.audienceEditor': 'editors and administrators',
  'anotoki.siteSettings.audienceAdmin': 'administrators only',
} as const;

/** A key of these words. */
export type SiteSettingsLibraryKey = keyof typeof EN;

const SK: Readonly<Record<SiteSettingsLibraryKey, string>> = {
  'anotoki.siteSettings.announcement': 'Oznámenie',
  'anotoki.siteSettings.levelInfo': 'Informácia',
  'anotoki.siteSettings.levelWarning': 'Upozornenie',
  'anotoki.siteSettings.levelDanger': 'Dôležité',
  'anotoki.siteSettings.hide': 'Skryť',
  'anotoki.siteSettings.hideName': 'Skryť oznámenie',
  'anotoki.siteSettings.maintenanceOnTitle': 'Stránka je zatvorená pre údržbu',
  'anotoki.siteSettings.maintenanceOnText': 'Všetci ostatní vidia stránku o údržbe. Tu sa zobrazuje, lebo tento účet patrí administrátorovi.',
  'anotoki.siteSettings.pageOffTitle': 'Táto stránka je vypnutá',
  'anotoki.siteSettings.pageOffText': 'Vidia ju len administrátori: všetci ostatní dostanú stránku, ktorá neexistuje.',
  'anotoki.siteSettings.pageLimitedTitle': 'Táto stránka nie je pre každého',
  'anotoki.siteSettings.pageLimitedText': 'Zobrazuje sa {audience}. Tu sa zobrazuje, lebo tento účet patrí administrátorovi.',
  'anotoki.siteSettings.audienceUser': 'prihláseným',
  'anotoki.siteSettings.audienceEditor': 'editorom a administrátorom',
  'anotoki.siteSettings.audienceAdmin': 'len administrátorom',
};

/** These words, per language: English and Slovak, each with every key. */
export const SITE_SETTINGS_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<SiteSettingsLibraryKey, string>>>> = { en: EN, sk: SK };
