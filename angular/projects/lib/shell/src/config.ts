import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** The account's own words for the themes: light, dark, or as the device is set. */
export type AnotokiThemeMode = 'auto' | 'light' | 'dark';

/** A language on offer, named as its own speakers write it ("Slovenčina", not "Slovak"). */
export interface AnotokiLanguage {
  code: string;
  name: string;
}

/**
 * What a site tells the shell, through provideAnotokiShell(): where its theme
 * is kept and how it reaches the account, and its languages. The shell talks
 * to the site's session and translations only through these.
 */
export interface AnotokiShellConfig {
  theme?: {
    /** The localStorage key the site's theme-boot.js reads too: 'anotoki-survey:theme', 'academy-theme'. Default 'anotoki:theme'. */
    storageKey?: string;
    /**
     * The account's theme while somebody is signed in and the IAM sends
     * preferences (a signal works); null otherwise - signed out, a visitor, an
     * IAM before the preferences: then the device's choice is shown and nothing is saved.
     */
    account?: () => AnotokiThemeMode | null;
    /** Saves a choice to the account (the SDK's savePreferences({ theme }), the IAM's own API); rejects when the account refuses it. */
    save?: (mode: AnotokiThemeMode) => Promise<unknown>;
    /** <meta name="theme-color"> per theme shown; the family's page backgrounds by default. */
    themeColor?: { light: string; dark: string };
  };
  languages?: {
    /** The language on the page (a signal works). */
    current: () => string;
    /** The languages on offer. */
    offered: () => readonly AnotokiLanguage[];
    /**
     * Switches to a language once its words are there: true when the page
     * reads in it. Saving it to the account is the site's (latestChoiceSaver helps).
     */
    choose: (code: string) => Promise<boolean>;
    /** The account refused the language: a note under the language button says so while this is true. */
    notSaved?: () => boolean;
    /** How the switcher puts that note away (the next choice, a click elsewhere, Escape). */
    clearNotSaved?: () => void;
  };
}

export const ANOTOKI_SHELL_CONFIG = new InjectionToken<AnotokiShellConfig>('ANOTOKI_SHELL_CONFIG');

/**
 * Configures the shell. The factory runs in an injection context, so it can
 * inject the site's own services (its session, its translations):
 *
 * ```ts
 * provideAnotokiShell(() => {
 *   const auth = inject(AuthService);
 *   const i18n = inject(TranslationService);
 *   return {
 *     theme: { storageKey: 'anotoki-survey:theme', account: () => auth.preferences()?.theme ?? null, save: (theme) => auth.savePreferences({ theme }) },
 *     languages: { current: i18n.language, offered: i18n.languages, choose: (code) => i18n.setLanguage(code) },
 *   };
 * })
 * ```
 */
export function provideAnotokiShell(factory: () => AnotokiShellConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_SHELL_CONFIG, useFactory: factory }]);
}

export const DEFAULT_THEME_STORAGE_KEY = 'anotoki:theme';
export const DEFAULT_THEME_COLOR = { light: '#f3f6fb', dark: '#070d1c' } as const;
