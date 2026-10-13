import { LEGAL_LIBRARY_WORDS, LegalLibraryKey } from '@anotoki/lib/words/legal';

/**
 * The legal pages' words - their headings, the family's shared wording of Terms, Privacy and Contact, the browser
 * storage and the companies the sites name. Each is the library's word `anotoki.legal.<name>`: built in for English
 * and Slovak (impersonal - no "ty", no "Vy" - so that the pages fit the informal sites and the formal survey alike),
 * and in every site's database (anotoki_translations/005), where its owner may reword them (`translate`: the
 * translations module's libraryWord()). Their names come from php/resources/library-words.json, through the
 * generated words: one source.
 *
 * The pages read them themselves and never register them with the translations module: pages of text, they would
 * otherwise come with the eager configuration, in every first load. A site's own `i18n.t('anotoki.legal.x')` reads
 * the database's string.
 */
export type LegalWordName = LegalLibraryKey extends `anotoki.legal.${infer Name}` ? Name : never;
export type LegalWords = Record<LegalWordName, string>;

/** The day the library's words of the legal pages last changed: each page's "Last updated" is never earlier. */
export const LEGAL_TEXTS_UPDATED = '2026-10-13';

const PREFIX = 'anotoki.legal.';

function builtIn(language: 'en' | 'sk'): LegalWords {
  const words = {} as LegalWords;
  for (const [key, text] of Object.entries(LEGAL_LIBRARY_WORDS[language])) {
    words[key.slice(PREFIX.length) as LegalWordName] = text;
  }
  return words;
}

/**
 * The built-in words (@anotoki/lib/words/legal, generated from php/resources/library-words.json) - never a copy by
 * hand, and in no first load. The calls are marked pure: a site's build keeps a top-level call it is not told is pure.
 */
export const BUILT_IN_LEGAL_WORDS: Readonly<Record<'en' | 'sk', LegalWords>> = {
  en: /* @__PURE__ */ builtIn('en'),
  sk: /* @__PURE__ */ builtIn('sk'),
};

/** Every word's name, in the JSON's order. */
export function legalWordNames(): LegalWordName[] {
  return Object.keys(BUILT_IN_LEGAL_WORDS.en) as LegalWordName[];
}

/** The library's key of a word, as a site's database holds it. */
export function legalKey(name: LegalWordName): string {
  return PREFIX + name;
}

/**
 * The words for a language - English, under the built-in words of that language, under the site's database's
 * (`translate`) - and the language they are in ('en' when nothing has that language).
 */
export function legalWords(language: string | null | undefined, translate?: (key: string) => string | null | undefined): { lang: string; words: LegalWords } {
  const code = (language || 'en').trim().toLowerCase();
  const builtIn = BUILT_IN_LEGAL_WORDS[code as 'en'] ?? BUILT_IN_LEGAL_WORDS[code.split('-')[0] as 'en'];
  const words: LegalWords = { ...BUILT_IN_LEGAL_WORDS.en, ...builtIn };
  let translated = false;
  if (translate) {
    for (const name of legalWordNames()) {
      const key = legalKey(name);
      const value = translate(key);
      // A bundle without the key answers the key itself, or nothing.
      if (typeof value === 'string' && value !== '' && value !== key) {
        words[name] = value;
        translated = true;
      }
    }
  }
  return { lang: builtIn || translated ? code : 'en', words };
}
