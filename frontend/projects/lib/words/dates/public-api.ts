/*
 * @anotoki/lib/words/dates - the anotoki library's own words of `anotoki.dates.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's dates (@anotoki/lib/ui/dates: its
 * pipes and AnotokiDates), which read them themselves, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the dates alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.dates.justNow': 'just now',
  'anotoki.dates.soon': 'in a moment',
  'anotoki.dates.onDate': 'on {date}',
} as const;

/** A key of these words. */
export type DatesLibraryKey = keyof typeof EN;

const SK: Readonly<Record<DatesLibraryKey, string>> = {
  'anotoki.dates.justNow': 'práve teraz',
  'anotoki.dates.soon': 'o chvíľu',
  'anotoki.dates.onDate': '{date}',
};

/** These words, per language: English and Slovak, each with every key. */
export const DATES_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<DatesLibraryKey, string>>>> = { en: EN, sk: SK };
