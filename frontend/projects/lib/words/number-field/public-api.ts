/*
 * @anotoki/lib/words/number-field - the anotoki library's own words of `anotoki.numberField.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's number field
 * (@anotoki/lib/ui/number-field), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the number field alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.numberField.invalid': 'Write a number, like {example}.',
  'anotoki.numberField.whole': 'Write a whole number.',
  'anotoki.numberField.step': 'Write a number in steps of {step}.',
  'anotoki.numberField.tooSmall': 'The smallest number is {min}.',
  'anotoki.numberField.tooLarge': 'The largest number is {max}.',
} as const;

/** A key of these words. */
export type NumberFieldLibraryKey = keyof typeof EN;

const SK: Readonly<Record<NumberFieldLibraryKey, string>> = {
  'anotoki.numberField.invalid': 'Číslo treba zadať v tvare {example}.',
  'anotoki.numberField.whole': 'Treba zadať celé číslo.',
  'anotoki.numberField.step': 'Číslo treba zadať v krokoch po {step}.',
  'anotoki.numberField.tooSmall': 'Najmenšie možné číslo je {min}.',
  'anotoki.numberField.tooLarge': 'Najväčšie možné číslo je {max}.',
};

/** These words, per language: English and Slovak, each with every key. */
export const NUMBER_FIELD_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<NumberFieldLibraryKey, string>>>> = { en: EN, sk: SK };
