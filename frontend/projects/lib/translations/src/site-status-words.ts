import { TranslationService } from './translation.service';

/** The words of the migrations module's status page - each the library's word `anotoki.siteStatus.<name>`. */
export const SITE_STATUS_WORD_NAMES = ['updatingTitle', 'updatingText', 'unavailableTitle', 'unavailableText', 'notSetUpTitle', 'notSetUpText', 'openSetup', 'tryAgain', 'signIn'] as const;

export type SiteStatusWordName = (typeof SITE_STATUS_WORD_NAMES)[number];

/** Some of the status page's words, in one language. */
export type StatusWords = Partial<Record<SiteStatusWordName, string>>;

/**
 * The status page's words for the migrations module (provideAnotokiMigrations'
 * `words`), from the words in memory: `{ [language on the page]: { ... } }` -
 * the database's `anotoki.siteStatus.*` (an owner's rewording) or the site's
 * `libraryWords`; what neither has, the module's built-in words fill.
 * `overrides` win over both: a site's own page around the library's (the
 * IAM's `/not-set-up`) words it with its own keys.
 *
 * The module reads `words` whenever it draws, so a site returns this from a
 * getter - and the page follows a change of language or of the strings:
 *
 * ```ts
 * provideAnotokiMigrations(() => {
 *   const i18n = inject(TranslationService);
 *   return { ..., language: () => i18n.effectiveLanguage(), get words() { return siteStatusWords(i18n); } };
 * })
 * ```
 */
export function siteStatusWords(i18n: TranslationService, overrides?: Readonly<Record<string, StatusWords>>): Record<string, StatusWords> {
  const language = i18n.effectiveLanguage();
  const words: StatusWords = {};
  for (const name of SITE_STATUS_WORD_NAMES) {
    const word = i18n.libraryWord(`anotoki.siteStatus.${name}`);
    if (word) {
      words[name] = word;
    }
  }
  const own = overrides?.[language] ?? overrides?.[language.split('-')[0]];
  for (const name of SITE_STATUS_WORD_NAMES) {
    const word = own?.[name];
    if (typeof word === 'string' && word !== '') {
      words[name] = word;
    }
  }
  return { [language]: words };
}
