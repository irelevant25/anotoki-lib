/*
 * @anotoki/lib/words/stepper - the anotoki library's own words of `anotoki.stepper.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's stepper and progress dots
 * (@anotoki/lib/ui/stepper), which read them themselves, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with them alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.stepper.stepOf': 'Step {current} of {total}',
  'anotoki.stepper.done': 'done',
} as const;

/** A key of these words. */
export type StepperLibraryKey = keyof typeof EN;

const SK: Readonly<Record<StepperLibraryKey, string>> = {
  'anotoki.stepper.stepOf': 'Krok {current} z {total}',
  'anotoki.stepper.done': 'hotovo',
};

/** These words, per language: English and Slovak, each with every key. */
export const STEPPER_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<StepperLibraryKey, string>>>> = { en: EN, sk: SK };
