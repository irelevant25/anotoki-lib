/*
 * @anotoki/lib/words/maintenance - the anotoki library's own words of `anotoki.maintenance.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the closed sign
 * (@anotoki/lib/migrations/maintenance, which the status page loads while the site is closed for maintenance), which
 * reads them itself, never registered - never by the kit, the gate nor the translations module, so they reach a site
 * with the closed sign alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.maintenance.title': 'Back shortly',
  'anotoki.maintenance.text': 'The site is closed for a moment while something is being fixed. This page reloads by itself once it is back.',
  'anotoki.maintenance.staffLead': 'An administrator can sign in here and use the site while it is closed.',
  'anotoki.maintenance.signIn': 'Sign in',
} as const;

/** A key of these words. */
export type MaintenanceLibraryKey = keyof typeof EN;

const SK: Readonly<Record<MaintenanceLibraryKey, string>> = {
  'anotoki.maintenance.title': 'Hneď sme späť',
  'anotoki.maintenance.text': 'Stránka je na chvíľu zatvorená, kým niečo opravujeme. Táto stránka sa obnoví sama, keď bude späť.',
  'anotoki.maintenance.staffLead': 'Administrátor sa tu môže prihlásiť a používať stránku, aj keď je zatvorená.',
  'anotoki.maintenance.signIn': 'Prihlásiť sa',
};

/** These words, per language: English and Slovak, each with every key. */
export const MAINTENANCE_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<MaintenanceLibraryKey, string>>>> = { en: EN, sk: SK };
