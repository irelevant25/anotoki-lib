/*
 * @anotoki/lib/words/chips - the anotoki library's own words of `anotoki.chips.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's chips (@anotoki/lib/ui/chips),
 * which read them themselves, never registered - never by the kit's core nor by the translations module, so they reach
 * a site with the chips alone.
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.chips.remove': 'Remove: {name}',
} as const;

/** A key of these words. */
export type ChipsLibraryKey = keyof typeof EN;

const SK: Readonly<Record<ChipsLibraryKey, string>> = {
  'anotoki.chips.remove': 'Odstrániť: {name}',
};

/** These words, per language: English and Slovak, each with every key. */
export const CHIPS_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<ChipsLibraryKey, string>>>> = { en: EN, sk: SK };
