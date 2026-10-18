/*
 * @anotoki/lib/words/date-field - the anotoki library's own words of `anotoki.dateField.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's date field
 * (@anotoki/lib/ui/date-field), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the date field alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.dateField.choose': 'Choose a date: {field}',
  'anotoki.dateField.previousMonth': 'Previous month',
  'anotoki.dateField.nextMonth': 'Next month',
  'anotoki.dateField.invalid': 'Write the date like {example}.',
  'anotoki.dateField.tooEarly': 'The earliest date is {date}.',
  'anotoki.dateField.tooLate': 'The latest date is {date}.',
} as const;

/** A key of these words. */
export type DateFieldLibraryKey = keyof typeof EN;

const SK: Readonly<Record<DateFieldLibraryKey, string>> = {
  'anotoki.dateField.choose': 'Vybrať dátum: {field}',
  'anotoki.dateField.previousMonth': 'Predchádzajúci mesiac',
  'anotoki.dateField.nextMonth': 'Nasledujúci mesiac',
  'anotoki.dateField.invalid': 'Dátum treba zadať v tvare {example}.',
  'anotoki.dateField.tooEarly': 'Najskorší možný dátum je {date}.',
  'anotoki.dateField.tooLate': 'Najneskorší možný dátum je {date}.',
};

/** These words, per language: English and Slovak, each with every key. */
export const DATE_FIELD_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<DateFieldLibraryKey, string>>>> = { en: EN, sk: SK };
