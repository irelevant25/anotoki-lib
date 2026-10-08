import { LIBRARY_WORDS } from '@anotoki/lib/ui';
import { SiteStatusWords } from './config';

/** The status page's words, each the library's word `anotoki.siteStatus.<name>`. */
const NAMES = [
  'updatingTitle',
  'updatingText',
  'unavailableTitle',
  'unavailableText',
  'notSetUpTitle',
  'notSetUpText',
  'openSetup',
  'tryAgain',
  'signIn',
] as const satisfies readonly (keyof SiteStatusWords)[];

function builtIn(language: 'en' | 'sk'): SiteStatusWords {
  return Object.fromEntries(NAMES.map((name) => [name, LIBRARY_WORDS[language][`anotoki.siteStatus.${name}`]])) as unknown as SiteStatusWords;
}

/**
 * The visitors' words, built in: the library's words `anotoki.siteStatus.*`
 * (generated from php/resources/library-words.json - every site's database
 * holds them too, where its owner may reword them). The administrators' words
 * are English only, in the templates.
 */
export const BUILT_IN_WORDS: Readonly<Record<'en' | 'sk', SiteStatusWords>> = { en: builtIn('en'), sk: builtIn('sk') };

/**
 * The words for a language - English, under the built-in words of that
 * language, under the site's own - and the language they are in ('en' when
 * neither the module nor the site has any for it).
 */
export function siteStatusWords(language: string, overrides: Record<string, Partial<SiteStatusWords>> | undefined): { lang: string; words: SiteStatusWords } {
  const code = (language || 'en').trim().toLowerCase();
  const primary = code.split('-')[0];
  const builtIn = BUILT_IN_WORDS[code as 'en'] ?? BUILT_IN_WORDS[primary as 'en'];
  const own = overrides?.[language] ?? overrides?.[code] ?? overrides?.[primary];

  const words: SiteStatusWords = { ...BUILT_IN_WORDS.en, ...builtIn };
  for (const [key, value] of Object.entries(own ?? {})) {
    if (typeof value === 'string' && value !== '') {
      words[key as keyof SiteStatusWords] = value;
    }
  }

  return { lang: builtIn || own ? code : 'en', words };
}
