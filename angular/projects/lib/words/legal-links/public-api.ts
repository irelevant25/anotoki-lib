/*
 * @anotoki/lib/words/legal-links - the anotoki library's own words of `anotoki.legalLinks.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the module that says them, which registers
 * them with the translations module (provideLibraryWords) - never by the kit nor by the translations module, so they
 * reach a site with the module alone.
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.legalLinks.label': 'Legal',
  'anotoki.legalLinks.terms': 'Terms',
  'anotoki.legalLinks.privacy': 'Privacy',
  'anotoki.legalLinks.contact': 'Contact',
} as const;

/** A key of these words. */
export type LegalLinksLibraryKey = keyof typeof EN;

const SK: Readonly<Record<LegalLinksLibraryKey, string>> = {
  'anotoki.legalLinks.label': 'Právne informácie',
  'anotoki.legalLinks.terms': 'Podmienky',
  'anotoki.legalLinks.privacy': 'Súkromie',
  'anotoki.legalLinks.contact': 'Kontakt',
};

/** These words, per language: English and Slovak, each with every key. */
export const LEGAL_LINKS_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<LegalLinksLibraryKey, string>>>> = { en: EN, sk: SK };
