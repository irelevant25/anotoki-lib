/*
 * @anotoki/lib/words/color-field - the anotoki library's own words of `anotoki.colorField.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's colour field
 * (@anotoki/lib/ui/color-field), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the colour field alone.
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.colorField.picker': 'Pick from the palette',
  'anotoki.colorField.swatches': 'Suggested colours',
  'anotoki.colorField.invalid': 'Write the colour as # and six digits or letters a–f, like #1f5fbf.',
} as const;

/** A key of these words. */
export type ColorFieldLibraryKey = keyof typeof EN;

const SK: Readonly<Record<ColorFieldLibraryKey, string>> = {
  'anotoki.colorField.picker': 'Vybrať z palety',
  'anotoki.colorField.swatches': 'Navrhované farby',
  'anotoki.colorField.invalid': 'Farbu treba zadať ako # a šesť číslic alebo písmen a – f, napríklad #1f5fbf.',
};

/** These words, per language: English and Slovak, each with every key. */
export const COLOR_FIELD_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<ColorFieldLibraryKey, string>>>> = { en: EN, sk: SK };
