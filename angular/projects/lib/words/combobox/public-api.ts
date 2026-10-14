/*
 * @anotoki/lib/words/combobox - the anotoki library's own words of `anotoki.combobox.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's combobox
 * (@anotoki/lib/ui/combobox), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the combobox alone.
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.combobox.noMatches': 'No matches',
  'anotoki.combobox.more': '{count} more: keep typing to narrow the list.',
  'anotoki.combobox.chosen': '{field}: chosen',
} as const;

/** A key of these words. */
export type ComboboxLibraryKey = keyof typeof EN;

const SK: Readonly<Record<ComboboxLibraryKey, string>> = {
  'anotoki.combobox.noMatches': 'Nič sa nenašlo',
  'anotoki.combobox.more': 'Ďalších možností: {count} – zoznam zúži ďalšie písanie.',
  'anotoki.combobox.chosen': '{field}: vybrané',
};

/** These words, per language: English and Slovak, each with every key. */
export const COMBOBOX_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<ComboboxLibraryKey, string>>>> = { en: EN, sk: SK };
