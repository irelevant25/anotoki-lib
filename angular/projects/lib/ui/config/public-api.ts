/*
 * @anotoki/lib/ui/config - the kit's configuration (provideAnotokiUi) and its
 * words: the library's own words (every `anotoki.*` key, English and Slovak),
 * the kit's share of them and AnotokiWords, which reads them in the page's
 * language. Re-exported by @anotoki/lib/ui: a site imports from there.
 */

export type { AnotokiUiConfig, IconPaths, IconSet } from './src/config';
export { ANOTOKI_ICONS, ANOTOKI_UI_CONFIG, provideAnotokiUi } from './src/config';
export type { LibraryKey } from './src/library-words';
export { LIBRARY_WORDS } from './src/library-words';
export type { AnotokiWordKey, AnotokiWordTable } from './src/words';
export { ANOTOKI_WORD_KEYS, BUILT_IN_WORDS } from './src/words';
export type { WordParams } from './src/anotoki-words.service';
export { AnotokiWords, fillWords } from './src/anotoki-words.service';
