/*
 * What the translations module's specs share: a site's bundles as its server
 * answers them, an account the test drives, and the providers that wire the
 * module into a zoneless app. Only the specs import this; it is not part of the
 * package (the stand-in a site's specs use is @anotoki/lib/translations/testing).
 */

import { HttpErrorResponse } from '@angular/common/http';
import { EnvironmentProviders, Provider, WritableSignal, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { type Mock } from 'vitest';
import { AnotokiTranslationsConfig, provideAnotokiTranslations } from './config';
import { SiteLanguage, TranslationBundle } from './models';

export const LANGUAGES: SiteLanguage[] = [
  { code: 'en', name: 'English', native_name: 'English' },
  { code: 'sk', name: 'Slovak', native_name: 'Slovenčina' },
];

export const LANGUAGE_KEY = 'test-site:language';
export const CACHE_KEY = 'test-site:language-cache';

/**
 * The database's English: worded differently from the site's compiled English
 * (COMPILED says "Theme"), so a test can tell which of the two a page reads.
 */
export const ENGLISH: Record<string, string> = {
  'theme.label': 'Appearance',
  'reviews.due.one': '{count} review due',
  'reviews.due.few': '{count} reviews due',
  'reviews.due.other': '{count} reviews due',
  'greeting.named': 'Hello, {name}!',
  // Placeholders named like what every object inherits: filled only from what a parameter object has itself.
  'error.odd': 'x {constructor} {toString} y',
  'error.offline': 'Cannot reach the server.',
  'anotoki.topbar.account': 'Your anotoki account (reworded)',
};

export const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'theme.label': 'Vzhľad',
  'reviews.due.one': '{count} opakovanie',
  'reviews.due.few': '{count} opakovania',
  'reviews.due.other': '{count} opakovaní',
  'greeting.named': 'Ahoj, {name}!',
  'error.offline': 'Server je nedostupný.',
  'anotoki.topbar.account': 'Tvoj účet anotoki (prepísané)',
};

/** The site's compiled English: every key, as the code has it. */
export const COMPILED: Record<string, string> = {
  'theme.label': 'Theme',
  'reviews.due.one': '{count} review due',
  'reviews.due.few': '{count} reviews due',
  'reviews.due.other': '{count} reviews due',
  'greeting.named': 'Hello, {name}!',
  'error.offline': 'The server cannot be reached.',
};

export const EN_BUNDLE: TranslationBundle = { language: 'en', languages: LANGUAGES, values: ENGLISH };
export const SK_BUNDLE: TranslationBundle = { language: 'sk', languages: LANGUAGES, values: SLOVAK, english: ENGLISH };

/** The server: Slovak for `sk`, English - saying so - for anything else. */
export function answer(code: string): Promise<unknown> {
  return Promise.resolve(code === 'sk' ? SK_BUNDLE : EN_BUNDLE);
}

/** The Slovak bundle once somebody reworded a string on the Translations page. */
export function reworded(theme: string): TranslationBundle {
  return { ...SK_BUNDLE, values: { ...SLOVAK, 'theme.label': theme } };
}

/** The server out of reach - and, between an upload and Apply, the route's 503. */
export const OFFLINE = new HttpErrorResponse({ status: 0 });
export const UNAVAILABLE = new HttpErrorResponse({ status: 503, error: { message: 'The translations are not there yet.', code: 'translations_unavailable' } });

/** Everything already on its way has run: the answers of requests that were settled, and what follows them. */
export function settled(): Promise<void> {
  return new Promise((done) => setTimeout(done));
}

/** A promise the test settles by hand: the server's answer, when the test says. */
export function later<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** The site around the module: its server, its account, whether it can be asked - each a mock or a signal the test drives. */
export interface TranslationsSite {
  /** The codes asked for, in order. */
  calls: string[];
  /** How the server answers; and, before it, the answers queued for the next requests. */
  respond: (code: string) => Promise<unknown>;
  once: ((code: string) => Promise<unknown>)[];
  canAsk: WritableSignal<boolean>;
  /** The account: its language, and whether it keeps the person's choices; null: nobody signed in. */
  account: WritableSignal<{ language: string | null; keeps: boolean; key?: string } | null>;
  save: Mock<(code: string) => Promise<unknown>>;
}

export function translationsSite(): TranslationsSite {
  const site: TranslationsSite = {
    calls: [],
    respond: answer,
    once: [],
    canAsk: signal(true),
    account: signal(null),
    save: vi.fn<(code: string) => Promise<unknown>>(),
  };
  // The account takes the change, as the SDK does: its language is the new one at once.
  site.save.mockImplementation(async (code: string) => {
    const account = site.account();
    site.account.set(account ? { ...account, language: code } : account);
  });
  return site;
}

export const fails = (error: unknown) => (): Promise<unknown> => Promise.reject(error);
export const gives = (value: unknown) => (): Promise<unknown> => Promise.resolve(value);

/** A zoneless app with the module configured for `site` (and whatever the test adds). */
export function translationsProviders(site: TranslationsSite, extra: Partial<AnotokiTranslationsConfig> = {}): (Provider | EnvironmentProviders)[] {
  const decides = computed(() => site.account()?.keeps ?? false);
  return [
    provideZonelessChangeDetection(),
    provideAnotokiTranslations(() => ({
      storagePrefix: 'test-site',
      fallbackEnglish: COMPILED,
      fetchBundle: (code: string) => {
        site.calls.push(code);
        return (site.once.shift() ?? site.respond)(code);
      },
      canAsk: () => site.canAsk(),
      account: {
        language: () => site.account()?.language ?? null,
        decides: () => decides(),
        save: (code: string) => site.save(code),
        userKey: () => site.account()?.key ?? null,
      },
      ...extra,
    })),
  ];
}
