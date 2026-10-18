/*
 * @anotoki/lib/words/progress - the anotoki library's own words of `anotoki.progress.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's progress bar
 * (@anotoki/lib/ui/progress), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the progress bar alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.progress.count': '{value} of {max}',
} as const;

/** A key of these words. */
export type ProgressLibraryKey = keyof typeof EN;

const SK: Readonly<Record<ProgressLibraryKey, string>> = {
  'anotoki.progress.count': '{value} z {max}',
};

/** These words, per language: English and Slovak, each with every key. */
export const PROGRESS_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<ProgressLibraryKey, string>>>> = { en: EN, sk: SK };
