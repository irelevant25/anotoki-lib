/*
 * @anotoki/lib/words/tabs - the anotoki library's own words of `anotoki.tabs.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's tabs and link tabs
 * (@anotoki/lib/ui/tabs), which read them themselves, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the tabs alone.
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.tabs.scrollBack': 'Earlier tabs',
  'anotoki.tabs.scrollForward': 'More tabs',
} as const;

/** A key of these words. */
export type TabsLibraryKey = keyof typeof EN;

const SK: Readonly<Record<TabsLibraryKey, string>> = {
  'anotoki.tabs.scrollBack': 'Predchádzajúce karty',
  'anotoki.tabs.scrollForward': 'Ďalšie karty',
};

/** These words, per language: English and Slovak, each with every key. */
export const TABS_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<TabsLibraryKey, string>>>> = { en: EN, sk: SK };
