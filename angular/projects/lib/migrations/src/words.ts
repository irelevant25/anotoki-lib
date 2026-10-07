import { SiteStatusWords } from './config';

/** The visitors' words, built in. The administrators' words are English only, in the templates. */
export const BUILT_IN_WORDS: Readonly<Record<'en' | 'sk', SiteStatusWords>> = {
  en: {
    updatingTitle: 'The site is being updated',
    updatingText: 'It will be back in a few minutes. This page reloads by itself.',
    unavailableTitle: 'The site is not available right now',
    unavailableText: 'Please try again in a few minutes. This page reloads by itself.',
    notSetUpTitle: 'This site is not set up yet',
    notSetUpText: 'Its setup page connects it to its database and to the anotoki sign-in.',
    openSetup: 'Open the setup page',
    tryAgain: 'Try again',
    signIn: 'Sign in',
  },
  sk: {
    updatingTitle: 'Stránku práve aktualizujeme',
    updatingText: 'O pár minút bude späť. Táto stránka sa obnoví sama.',
    unavailableTitle: 'Stránka teraz nie je dostupná',
    unavailableText: 'Skús to znova o pár minút. Táto stránka sa obnoví sama.',
    notSetUpTitle: 'Táto stránka ešte nie je nastavená',
    notSetUpText: 'Stránka nastavenia ju prepojí s databázou a s prihlasovaním anotoki.',
    openSetup: 'Otvoriť stránku nastavenia',
    tryAgain: 'Skúsiť znova',
    signIn: 'Prihlásiť sa',
  },
};

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
