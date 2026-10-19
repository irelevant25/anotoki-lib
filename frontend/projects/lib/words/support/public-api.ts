/*
 * @anotoki/lib/words/support - the anotoki library's own words of `anotoki.support.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the Support page
 * (@anotoki/lib/legal/support), which reads them itself, never registered - never by the kit nor by the translations
 * module, so they reach a site with that page alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.support.title': 'Support anotoki',
  'anotoki.support.text': 'anotoki is made and run by me alone, in my free time, and every project here is free to use. If something here helps you or you simply enjoy it, you can support its development on Ko-fi – every coffee helps pay for the hosting and the time new features take.',
  'anotoki.support.button': 'Support on Ko-fi',
  'anotoki.support.thanks': 'Thank you!',
} as const;

/** A key of these words. */
export type SupportLibraryKey = keyof typeof EN;

const SK: Readonly<Record<SupportLibraryKey, string>> = {
  'anotoki.support.title': 'Podporiť anotoki',
  'anotoki.support.text': 'anotoki tvorím a prevádzkujem sám, vo voľnom čase, a každý projekt tu je zadarmo. Ak niečo z toho pomáha alebo jednoducho teší, vývoj sa dá podporiť na Ko-fi – každá káva pomôže zaplatiť hosting aj čas, ktorý nové funkcie zaberú.',
  'anotoki.support.button': 'Podporiť na Ko-fi',
  'anotoki.support.thanks': 'Ďakujem!',
};

/** These words, per language: English and Slovak, each with every key. */
export const SUPPORT_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<SupportLibraryKey, string>>>> = { en: EN, sk: SK };
