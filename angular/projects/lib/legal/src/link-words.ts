import { LEGAL_LINKS_LIBRARY_WORDS } from '@anotoki/lib/words/legal-links';

/**
 * The footer's words: the three links' names and the name of their group. Each is the library's word
 * `anotoki.legalLinks.<name>`: built in for English and Slovak, and in every site's database
 * (anotoki_translations/005), where its owner may reword them (`translate`: the translations module's
 * libraryWord()).
 */
export interface LegalLinkWords {
  label: string;
  terms: string;
  privacy: string;
  contact: string;
}

/** The words' names, each the library's word `anotoki.legalLinks.<name>`. */
export const LEGAL_LINK_WORD_NAMES = ['label', 'terms', 'privacy', 'contact'] as const satisfies readonly (keyof LegalLinkWords)[];

function builtIn(language: 'en' | 'sk'): LegalLinkWords {
  return Object.fromEntries(LEGAL_LINK_WORD_NAMES.map((name) => [name, LEGAL_LINKS_LIBRARY_WORDS[language][`anotoki.legalLinks.${name}`]])) as unknown as LegalLinkWords;
}

/**
 * The built-in words (@anotoki/lib/words/legal-links, generated from php/resources/library-words.json). The calls
 * are marked pure: a site's build keeps a top-level call it is not told is pure.
 */
export const BUILT_IN_LEGAL_LINK_WORDS: Readonly<Record<'en' | 'sk', LegalLinkWords>> = {
  en: /* @__PURE__ */ builtIn('en'),
  sk: /* @__PURE__ */ builtIn('sk'),
};

/**
 * The footer's words for a language - English under the built-in words of that language, under the site's
 * database's (`translate`) - and the language they are in ('en' when nothing has that language).
 */
export function legalLinkWords(language: string | null | undefined, translate?: (key: string) => string | null | undefined): { lang: string; words: LegalLinkWords } {
  const code = (language || 'en').trim().toLowerCase();
  const builtIn = BUILT_IN_LEGAL_LINK_WORDS[code as 'en'] ?? BUILT_IN_LEGAL_LINK_WORDS[code.split('-')[0] as 'en'];
  const words: LegalLinkWords = { ...BUILT_IN_LEGAL_LINK_WORDS.en, ...builtIn };
  let translated = false;
  for (const name of LEGAL_LINK_WORD_NAMES) {
    const key = `anotoki.legalLinks.${name}`;
    const value = translate?.(key);
    // A bundle without the key answers the key itself, or nothing.
    if (typeof value === 'string' && value !== '' && value !== key) {
      words[name] = value;
      translated = true;
    }
  }
  return { lang: builtIn || translated ? code : 'en', words };
}
