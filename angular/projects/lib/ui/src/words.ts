import { LIBRARY_WORDS, LibraryKey } from './library-words';

/**
 * Every word the kit itself says (the toast region's name, "optional", the bar's
 * "Sign out"...), built in for English and Slovak (informal, "ty"). A site
 * changes any of them per language (provideAnotokiUi's `words`) or feeds them
 * from its database (`lookup`): every site's database holds them as
 * `anotoki.<key>` (the library's migration anotoki_translations/002).
 *
 * They are the library's words under the kit's namespaces - `anotoki.ui.*`,
 * `anotoki.topbar.*`, `anotoki.language.*`, `anotoki.theme.*` - read from the
 * one table generated from php/resources/library-words.json (library-words.ts),
 * never copied by hand.
 *
 * Names are never kit words: a site's sections, brand area and "Back to ..."
 * are the site's own, passed in as they read.
 *
 * One table for all the kit's entry points, kept in the core one: a site's
 * wrapper words its own menu items with the same keys (topbar.account), through
 * the one AnotokiWords.t().
 */

/** The namespaces of the library's words that are the kit's own; the others belong to other modules (siteStatus: the migrations module's status page). */
const KIT_NAMESPACES = ['ui', 'topbar', 'language', 'theme'] as const;

type KitNamespace = (typeof KIT_NAMESPACES)[number];

/** A library key's kit word, or nothing: `anotoki.ui.close` -> `ui.close`. */
type KitWord<Key> = Key extends `anotoki.${infer Word}` ? (Word extends `${KitNamespace}.${string}` ? Word : never) : never;

/** A word the kit says. */
export type AnotokiWordKey = KitWord<LibraryKey>;

/** Words for some of the keys, in one language. */
export type AnotokiWordTable = Readonly<Partial<Record<AnotokiWordKey, string>>>;

const PREFIX = 'anotoki.';

/** The kit's words of one language, by the kit's own names. */
function kitWords(language: 'en' | 'sk'): Readonly<Record<AnotokiWordKey, string>> {
  const words: Record<string, string> = {};
  for (const [key, word] of Object.entries(LIBRARY_WORDS[language])) {
    const name = key.slice(PREFIX.length);
    if ((KIT_NAMESPACES as readonly string[]).includes(name.split('.')[0])) {
      words[name] = word;
    }
  }
  return words as Record<AnotokiWordKey, string>;
}

/** The built-in words, per language. English has every key; it is what any other word falls back on. */
export const BUILT_IN_WORDS: Readonly<Record<string, Readonly<Record<AnotokiWordKey, string>>>> = { en: kitWords('en'), sk: kitWords('sk') };

/** Every key the kit has. */
export const ANOTOKI_WORD_KEYS = Object.keys(BUILT_IN_WORDS['en']) as readonly AnotokiWordKey[];
