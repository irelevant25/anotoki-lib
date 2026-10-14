/*
 * @anotoki/lib/words/file-picker - the anotoki library's own words of `anotoki.filePicker.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's file picker
 * (@anotoki/lib/ui/file-picker), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the file picker alone.
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.filePicker.chooseFile': 'Choose a file',
  'anotoki.filePicker.chooseFiles': 'Choose files',
  'anotoki.filePicker.dropFile': 'Drop a file here',
  'anotoki.filePicker.dropFiles': 'Drop files here',
  'anotoki.filePicker.tooLarge': '{name} is too large: {size}, at most {max}.',
  'anotoki.filePicker.wrongType': '{name} is not a kind of file taken here ({types}).',
  'anotoki.filePicker.oneOnly': 'Only one file can be chosen here.',
  'anotoki.filePicker.remove': 'Remove: {name}',
  'anotoki.filePicker.chosen': 'Chosen: {names}',
} as const;

/** A key of these words. */
export type FilePickerLibraryKey = keyof typeof EN;

const SK: Readonly<Record<FilePickerLibraryKey, string>> = {
  'anotoki.filePicker.chooseFile': 'Vybrať súbor',
  'anotoki.filePicker.chooseFiles': 'Vybrať súbory',
  'anotoki.filePicker.dropFile': 'Súbor sem stačí pretiahnuť',
  'anotoki.filePicker.dropFiles': 'Súbory sem stačí pretiahnuť',
  'anotoki.filePicker.tooLarge': 'Súbor {name} je príliš veľký: {size}, najviac {max}.',
  'anotoki.filePicker.wrongType': 'Súbor {name} nie je z povolených typov ({types}).',
  'anotoki.filePicker.oneOnly': 'Tu sa dá vybrať iba jeden súbor.',
  'anotoki.filePicker.remove': 'Odstrániť: {name}',
  'anotoki.filePicker.chosen': 'Vybrané: {names}',
};

/** These words, per language: English and Slovak, each with every key. */
export const FILE_PICKER_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<FilePickerLibraryKey, string>>>> = { en: EN, sk: SK };
