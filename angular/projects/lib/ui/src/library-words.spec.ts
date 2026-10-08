import source from '../../../../../php/resources/library-words.json';
import { BUILT_IN_WORDS as STATUS_WORDS } from '../../migrations/src/words';
import { LIBRARY_WORDS, LibraryKey } from './library-words';
import { ANOTOKI_WORD_KEYS, BUILT_IN_WORDS } from './words';

/** php/resources/library-words.json: the one source of the library's words. */
const JSON_WORDS = source.keys as Readonly<Record<string, { description: string; en: string; sk: string }>>;

describe('the library’s own words (library-words.ts, generated from php/resources/library-words.json)', () => {
  it('are the JSON’s, key for key and word for word, in English and Slovak - when not, run `bun run words`', () => {
    expect(Object.keys(LIBRARY_WORDS.en)).toEqual(Object.keys(JSON_WORDS));
    for (const language of ['en', 'sk'] as const) {
      expect(LIBRARY_WORDS[language], language).toEqual(Object.fromEntries(Object.entries(JSON_WORDS).map(([key, entry]) => [key, entry[language]])));
    }
  });

  it('are all under the library’s namespace, and have the same placeholders in both languages', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
    for (const key of Object.keys(LIBRARY_WORDS.en) as LibraryKey[]) {
      expect(key).toMatch(/^anotoki(\.[A-Za-z0-9][A-Za-z0-9_-]*)+$/);
      expect(placeholders(LIBRARY_WORDS.sk[key]), key).toEqual(placeholders(LIBRARY_WORDS.en[key]));
    }
  });

  it('give the kit its words: every key under its namespaces, by the kit’s own names', () => {
    const kit = Object.keys(JSON_WORDS)
      .filter((key) => /^anotoki\.(ui|topbar|language|theme)\./.test(key))
      .map((key) => key.slice('anotoki.'.length));
    expect([...ANOTOKI_WORD_KEYS]).toEqual(kit);
    for (const language of ['en', 'sk'] as const) {
      for (const word of ANOTOKI_WORD_KEYS) {
        expect(BUILT_IN_WORDS[language][word], `${language} ${word}`).toBe(JSON_WORDS[`anotoki.${word}`][language]);
      }
    }
  });

  it('give the status page its words: anotoki.siteStatus.*', () => {
    for (const language of ['en', 'sk'] as const) {
      const status = Object.entries(JSON_WORDS)
        .filter(([key]) => key.startsWith('anotoki.siteStatus.'))
        .map(([key, entry]) => [key.slice('anotoki.siteStatus.'.length), entry[language]]);
      expect(STATUS_WORDS[language], language).toEqual(Object.fromEntries(status));
    }
  });
});
