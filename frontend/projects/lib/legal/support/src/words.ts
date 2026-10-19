import { SUPPORT_LIBRARY_WORDS, SupportLibraryKey } from '@anotoki/lib/words/support';

/**
 * The Support page's words - the owner's own, the same on every anotoki site. Each is the library's word
 * `anotoki.support.<name>`: built in for English and Slovak (impersonal - no "ty", no "Vy": the owner speaks of
 * himself), and in every site's database (anotoki_translations/013), where its owner may reword them (`translate`:
 * the translations module's libraryWord()). Their names come from backend/resources/library-words.json, through the
 * generated words: one source.
 *
 * The page reads them itself and never registers them with the translations module: they come with the page alone.
 */
export type SupportWordName = SupportLibraryKey extends `anotoki.support.${infer Name}` ? Name : never;
export type SupportWords = Record<SupportWordName, string>;

const PREFIX = 'anotoki.support.';

function builtIn(language: 'en' | 'sk'): SupportWords {
  const words = {} as SupportWords;
  for (const [key, text] of Object.entries(SUPPORT_LIBRARY_WORDS[language])) {
    words[key.slice(PREFIX.length) as SupportWordName] = text;
  }
  return words;
}

/**
 * The built-in words (@anotoki/lib/words/support, generated from backend/resources/library-words.json). The calls are
 * marked pure: a site's build keeps a top-level call it is not told is pure.
 */
export const BUILT_IN_SUPPORT_WORDS: Readonly<Record<'en' | 'sk', SupportWords>> = {
  en: /* @__PURE__ */ builtIn('en'),
  sk: /* @__PURE__ */ builtIn('sk'),
};

/** Every word's name, in the JSON's order. */
export function supportWordNames(): SupportWordName[] {
  return Object.keys(BUILT_IN_SUPPORT_WORDS.en) as SupportWordName[];
}

/** The library's key of a word, as a site's database holds it. */
export function supportKey(name: SupportWordName): string {
  return PREFIX + name;
}

/**
 * The words for a language - English, under the built-in words of that language, under the site's database's
 * (`translate`) - and the language they are in ('en' when nothing has that language).
 */
export function supportWords(language: string | null | undefined, translate?: (key: string) => string | null | undefined): { lang: string; words: SupportWords } {
  const code = (language || 'en').trim().toLowerCase();
  const builtIn = BUILT_IN_SUPPORT_WORDS[code as 'en'] ?? BUILT_IN_SUPPORT_WORDS[code.split('-')[0] as 'en'];
  const words: SupportWords = { ...BUILT_IN_SUPPORT_WORDS.en, ...builtIn };
  let translated = false;
  if (translate) {
    for (const name of supportWordNames()) {
      const key = supportKey(name);
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
