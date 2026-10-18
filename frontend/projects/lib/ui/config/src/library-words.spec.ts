import source from '../../../../../../backend/resources/library-words.json';
import { LIBRARY_WORDS } from '@anotoki/lib/words';
import { CHIPS_LIBRARY_WORDS } from '@anotoki/lib/words/chips';
import { COLOR_FIELD_LIBRARY_WORDS } from '@anotoki/lib/words/color-field';
import { COMBOBOX_LIBRARY_WORDS } from '@anotoki/lib/words/combobox';
import { DATE_FIELD_LIBRARY_WORDS } from '@anotoki/lib/words/date-field';
import { FILE_PICKER_LIBRARY_WORDS } from '@anotoki/lib/words/file-picker';
import { PROGRESS_LIBRARY_WORDS } from '@anotoki/lib/words/progress';
import { RICH_TEXT_LIBRARY_WORDS } from '@anotoki/lib/words/rich-text';
import { SIGN_IN_LIBRARY_WORDS } from '@anotoki/lib/words/sign-in';
import { SITE_STATUS_LIBRARY_WORDS } from '@anotoki/lib/words/site-status';
import { STEPPER_LIBRARY_WORDS } from '@anotoki/lib/words/stepper';
import { TABS_LIBRARY_WORDS } from '@anotoki/lib/words/tabs';
import { BUILT_IN_WORDS as STATUS_WORDS } from '../../../migrations/src/words';
import { KIT_LIBRARY_WORDS, LibraryKey } from './library-words';
import { ANOTOKI_WORD_KEYS, BUILT_IN_WORDS } from './words';

/** backend/resources/library-words.json: the one source of the library's words. */
const JSON_WORDS = source.keys as Readonly<Record<string, { description: string; en: string; sk: string }>>;

/** The JSON's words of one language whose keys `belongs` takes. */
function json(language: 'en' | 'sk', belongs: (key: string) => boolean): Record<string, string> {
  return Object.fromEntries(
    Object.entries(JSON_WORDS)
      .filter(([key]) => belongs(key))
      .map(([key, entry]) => [key, entry[language]]),
  );
}

describe('the library’s own words (generated a namespace at a time from backend/resources/library-words.json)', () => {
  it('are the JSON’s, key for key and word for word, in English and Slovak - when not, run `bun run words`', () => {
    expect(Object.keys(LIBRARY_WORDS.en).sort()).toEqual(Object.keys(JSON_WORDS).sort());
    for (const language of ['en', 'sk'] as const) {
      expect(LIBRARY_WORDS[language], language).toEqual(json(language, () => true));
    }
  });

  it('live with their readers: the kit’s namespaces in ui/config alone, each other module’s in its own entry point', () => {
    for (const language of ['en', 'sk'] as const) {
      expect(KIT_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => /^anotoki\.(language|ui|topbar|theme)\./.test(key)));
      expect(SITE_STATUS_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.siteStatus.')));
      expect(SIGN_IN_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.signIn.')));
      // The kit's pieces of their own entry points (0.6.0): each piece's namespace, never the kit's file.
      expect(CHIPS_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.chips.')));
      expect(PROGRESS_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.progress.')));
      expect(STEPPER_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.stepper.')));
      expect(TABS_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.tabs.')));
      expect(DATE_FIELD_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.dateField.')));
      expect(COLOR_FIELD_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.colorField.')));
      expect(FILE_PICKER_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.filePicker.')));
      expect(COMBOBOX_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.combobox.')));
      expect(RICH_TEXT_LIBRARY_WORDS[language], language).toEqual(json(language, (key) => key.startsWith('anotoki.richText.')));
    }
    // LibraryKey names every key, every module's - a type only: the kit's file holds no other module's words.
    const signIn: LibraryKey = 'anotoki.signIn.retry';
    expect(Object.keys(KIT_LIBRARY_WORDS.en)).not.toContain(signIn);
  });

  it('are all under the library’s namespace, and have the same placeholders in both languages', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
    for (const key of Object.keys(LIBRARY_WORDS.en) as LibraryKey[]) {
      expect(key).toMatch(/^anotoki(\.[A-Za-z0-9][A-Za-z0-9_-]*){2,}$/);
      expect(placeholders(LIBRARY_WORDS.sk[key]), key).toEqual(placeholders(LIBRARY_WORDS.en[key]));
    }
  });

  it('give the kit its words: every key under its namespaces, by the kit’s own names, in the JSON’s order', () => {
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
