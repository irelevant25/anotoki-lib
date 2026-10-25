/*
 * @anotoki/lib/words/multiselect - the anotoki library's own words of `anotoki.multiselect.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's multiselect
 * (@anotoki/lib/ui/multiselect), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the multiselect alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.multiselect.more': 'and {count} more',
  'anotoki.multiselect.noneChosen': 'None chosen',
  'anotoki.multiselect.clear': 'Clear',
  'anotoki.multiselect.empty': 'Nothing to choose from',
} as const;

/** A key of these words. */
export type MultiselectLibraryKey = keyof typeof EN;

const SK: Readonly<Record<MultiselectLibraryKey, string>> = {
  'anotoki.multiselect.more': 'a ďalšie ({count})',
  'anotoki.multiselect.noneChosen': 'Nič nie je vybrané',
  'anotoki.multiselect.clear': 'Zrušiť výber',
  'anotoki.multiselect.empty': 'Nie je z čoho vyberať',
};

/** These words, per language: English and Slovak, each with every key. */
export const MULTISELECT_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<MultiselectLibraryKey, string>>>> = { en: EN, sk: SK };
