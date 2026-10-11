/*
 * @anotoki/lib/ui/config - the kit's configuration (provideAnotokiUi) and its
 * words: the library's words of the kit's namespaces (`anotoki.language|ui|
 * topbar|theme.*`, English and Slovak), the name of every library key
 * (LibraryKey), and AnotokiWords, which reads the kit's words in the page's
 * language. No other module's words are here: each is in
 * @anotoki/lib/words/<namespace>, and @anotoki/lib/words has them all.
 * Re-exported by @anotoki/lib/ui.
 */

export type { AnotokiUiConfig, IconPaths, IconSet } from './src/config';
export { ANOTOKI_ICONS, ANOTOKI_UI_CONFIG, provideAnotokiUi } from './src/config';
export type { KitLibraryKey, LibraryKey } from './src/library-words';
export { KIT_LIBRARY_WORDS } from './src/library-words';
export type { AnotokiWordKey, AnotokiWordTable } from './src/words';
export { ANOTOKI_WORD_KEYS, BUILT_IN_WORDS } from './src/words';
export type { WordParams } from './src/anotoki-words.service';
export { AnotokiWords, fillWords } from './src/anotoki-words.service';
