import { HttpContextToken } from '@angular/common/http';
import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminLanguage, LanguageDeleted } from './models';
import { isAdminArea } from './language';

/** The person's anotoki account, as far as the language goes - the site's session or token, through these. */
export interface TranslationsAccount {
  /**
   * The account's language (a signal is followed): the IAM token's `locale`,
   * the IAM's own session's language; null while nobody is signed in.
   */
  language: () => string | null;
  /**
   * Whether the account's language decides (a signal works): somebody is
   * signed in and the IAM keeps the person's choices (its token carries
   * `preferences`; the IAM itself: signed in). Then it comes before what this
   * device remembered - only this tab's `?lang=` and a choice of this visit
   * come first - and a choice made on the page is saved to it. Default: never.
   */
  decides?: () => boolean;
  /** Saves a language chosen on the page to the account (the SDK's savePreferences({ language }); the IAM's own API); rejects when the account refuses it. */
  save?: (code: string) => Promise<unknown>;
  /**
   * A refusal nothing is said about: the IAM does not offer that language, so
   * it stays this site's own for the visit. Default: an error whose `code` is
   * `invalid_request` (the SDK's).
   */
  quiet?: (error: unknown) => boolean;
  /** Who is signed in, as a string (null: nobody): whose drafts the admin pages keep, and whether the guard asks at all. */
  userKey?: () => string | null;
}

/** A bundle the server refused with an answer: its status and what it said. */
export interface BundleRefusal {
  status: number;
  /** The answer's body (HttpErrorResponse's `error`, or the thrown thing's `body`). */
  body: unknown;
  /** What was thrown, as it came. */
  error: unknown;
  /** While the site starts (init()), when a page is not drawn yet. */
  starting: boolean;
  /** A bundle (or the cache) is in memory: the pages have their words. */
  hasWords: boolean;
}

/**
 * Keys the server alone reads - the IAM's mails - shown on the Translations
 * page as blocks of their own (a mail: its subject and its paragraphs in the
 * message's order), apart from the pages' keys and under their own rules.
 */
export interface TranslationGroup {
  /** The keys of the group start with it: 'mail.'. */
  prefix: string;
  /** The heading of its part of the grid: 'Mails'. */
  heading: string;
  /** What its strings may hold, said once above it (the server's rules for them). */
  lead?: string;
  /** Its blocks in this order, by the name after the prefix ('confirm', 'reset', ...); one not named comes after. */
  order?: readonly string[];
  /** A block's keys in this order, by their last segment ('subject', 'greeting', ...); one not named comes after. */
  parts?: readonly string[];
  /** A block's title and what it is, by the block's name ('mail.reset'); a block not named shows its name alone. */
  about?: Readonly<Record<string, { title: string; text?: string }>>;
  /** The icon at the head of each block: one the kit or the site has ('mail'). */
  icon?: string;
}

/** A failed request, as the admin pages read it - whatever the site's HTTP layer made of it. */
export interface TranslationsFailure {
  /** The HTTP status; 0 for no answer at all. */
  status: number;
  /** The server's code (`translations_unavailable`, `placeholder_changed`...), or `network` / `unknown`. */
  code: string;
  /** The server's own sentence (English), or a plain one. */
  message: string;
  /** Anything else the answer carried: `key`, `language`, `placeholder`, `keys`... */
  details: Readonly<Record<string, unknown>>;
}

/** The admin pages: who may use them, where they are, and the site's own words around them. */
export interface TranslationsAdminConfig {
  /** The admin routes' base, '/api/admin' by default ({base}/translations, {base}/languages). */
  apiBase?: string;
  /**
   * What the person may do (signals work) - the site's own rules; the server
   * checks them again. Nobody may, by default: the page then says whose it is
   * and asks the server nothing.
   */
  allows?: {
    /** The Translations page: rewording, export, import (the IAM: ADMIN; the other sites: ADMIN or EDITOR). */
    strings?: () => boolean;
    /** The Languages page: adding, naming, ordering, offering, deleting (ADMIN; genshin: ADMIN or EDITOR). */
    languages?: () => boolean;
  };
  /** The site's routes of the two pages and of its Migrations page: links between them, and to Migrations while the tables are not there yet. */
  routes?: { translations?: string; languages?: string; migrations?: string };
  /** How the pages call the site: 'the site' by default ('the IAM', 'the app'). */
  siteName?: string;
  /** The line under each page's heading, where the site says more than the default. */
  leads?: { translations?: string; languages?: string };
  /** The keys only the server reads, in blocks of their own (the IAM's mails). */
  groups?: readonly TranslationGroup[];
  /** What the pages' keys may hold, said above them when there are groups. */
  pagesLead?: string;
  /** The site's own fields of a language, in words (the IAM's `accounts`): beside its name, in the question before a delete, and after it. */
  languageNotes?: {
    row?: (language: AdminLanguage) => string | null;
    beforeDelete?: (language: AdminLanguage) => string | null;
    afterDelete?: (language: AdminLanguage, answer: LanguageDeleted) => string | null;
  };
  /** A failure in the site's words, or null for the pages' own. */
  failureText?: (failure: TranslationsFailure) => string | null;
  /** The largest file an import takes: the server's body limit, 1 MiB by default. */
  importMaxBytes?: number;
}

/** What a site tells the module, through provideAnotokiTranslations(). Everything is optional. */
export interface AnotokiTranslationsConfig {
  /** Where this device's choice, the cached bundle and the admin drafts are kept: `<prefix>:language`, `:language-cache`, `:localization-drafts`. Default 'anotoki'. */
  storagePrefix?: string;
  /** A site's existing names, so a visitor's choice and cache survive the upgrade: `{ language: 'academy-language', cache: 'academy-language-cache', drafts: 'academy-admin-drafts' }`. */
  storageKeys?: { language?: string; cache?: string; drafts?: string };
  /** The site's compiled English (every key - the IAM's en.ts, build-analyzer's), read only while no bundle is in memory. */
  fallbackEnglish?: Readonly<Record<string, string>>;
  /**
   * Per language, the site's own words for library keys - the survey's formal
   * Slovak: `{ sk: { 'anotoki.siteStatus.unavailableText': '...' } }` - under
   * the database's strings, over the library's built-in ones.
   */
  libraryWords?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  account?: TranslationsAccount;
  /** Whether the server can be asked at all (a signal works): false while the site is not set up or out of reach - nothing is asked then. Default: always. */
  canAsk?: () => boolean;
  /** The bundle's path, '/api/translations' by default: GET {bundleUrl}/{code}. */
  bundleUrl?: string;
  /** A site's own way to the bundle (Japanese Academy's plain fetch()): the server's answer, unchecked; a refusal throws something with `status` and `body` (or `error`). */
  fetchBundle?: (code: string) => Promise<unknown> | Observable<unknown>;
  /** The server refused a bundle with an answer (a 503 not_set_up, update_pending...): the site decides what that says. */
  onBundleRefused?: (refusal: BundleRefusal) => void;
  /** The areas that are English whatever the person reads; default the admin panel, `/admin` and under it. */
  englishOnly?: (url: string) => boolean;
  /** What `Intl` is given for a language; British English and Slovak by default ({ en: 'en-GB', sk: 'sk-SK' }). */
  locales?: Readonly<Record<string, string>>;
  /** At the browser step only, a language nobody offers that reads another more easily than English: { cs: 'sk' } by default. */
  browserAliases?: Readonly<Record<string, string>>;
  /** How long the start waits (ms): with a cache (1000), without one (3000), before its one retry (500); and settled() at most (2000). */
  waits?: { cache?: number; first?: number; retry?: number; settle?: number };
  /** The admin Translations and Languages pages (@anotoki/lib/translations/admin). */
  admin?: TranslationsAdminConfig;
}

export const ANOTOKI_TRANSLATIONS_CONFIG = new InjectionToken<AnotokiTranslationsConfig>('ANOTOKI_TRANSLATIONS_CONFIG');

/**
 * Marks the bundle's request, so a site's interceptor can leave its failure
 * alone: a 503 there (`translations_unavailable` between an upload and Apply)
 * means "read the compiled English", not an error to show or a sign-in to start.
 */
export const ANOTOKI_TRANSLATION_BUNDLE = new HttpContextToken<boolean>(() => false);

/**
 * Configures the module. The factory runs in an injection context - so it can
 * inject the site's own services (its session) - the first time the module
 * needs it, which is never while the TranslationService is being made: a site
 * whose AuthService reaches its Router (and the Router its title strategy,
 * which reads the translations) does not close a circle.
 *
 * ```ts
 * provideAnotokiTranslations(() => {
 *   const auth = inject(AuthService);
 *   return {
 *     storagePrefix: 'anotoki-survey',
 *     account: {
 *       language: () => auth.user()?.locale ?? null,
 *       decides: () => auth.preferences() !== null,
 *       save: (code) => auth.savePreferences({ language: code }),
 *       userKey: () => auth.userKey(),
 *     },
 *     admin: { allows: { strings: () => auth.isStaff(), languages: () => auth.isAdmin() }, routes: { migrations: '/admin/migrations' } },
 *   };
 * })
 * ```
 */
export function provideAnotokiTranslations(factory: () => AnotokiTranslationsConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_TRANSLATIONS_CONFIG, useFactory: factory }]);
}

/** The configuration with every default filled in. */
export interface TranslationSettings {
  keys: { language: string; cache: string; drafts: string };
  fallbackEnglish: Readonly<Record<string, string>>;
  libraryWords: Readonly<Record<string, Readonly<Record<string, string>>>>;
  account: TranslationsAccount | null;
  canAsk: () => boolean;
  bundleUrl: string;
  fetchBundle: ((code: string) => Promise<unknown> | Observable<unknown>) | null;
  onBundleRefused: ((refusal: BundleRefusal) => void) | null;
  englishOnly: (url: string) => boolean;
  locales: Readonly<Record<string, string>>;
  browserAliases: Readonly<Record<string, string>>;
  waits: { cache: number; first: number; retry: number; settle: number };
  admin: TranslationsAdminConfig;
}

export const DEFAULT_LOCALES: Readonly<Record<string, string>> = { en: 'en-GB', sk: 'sk-SK' };
export const DEFAULT_BROWSER_ALIASES: Readonly<Record<string, string>> = { cs: 'sk' };
export const DEFAULT_WAITS = { cache: 1000, first: 3000, retry: 500, settle: 2000 } as const;

/** The settings a configuration makes (none: the defaults). */
export function translationSettings(config: AnotokiTranslationsConfig | null | undefined): TranslationSettings {
  const prefix = config?.storagePrefix || 'anotoki';
  return {
    keys: {
      language: config?.storageKeys?.language || `${prefix}:language`,
      cache: config?.storageKeys?.cache || `${prefix}:language-cache`,
      drafts: config?.storageKeys?.drafts || `${prefix}:localization-drafts`,
    },
    fallbackEnglish: config?.fallbackEnglish ?? {},
    libraryWords: config?.libraryWords ?? {},
    account: config?.account ?? null,
    canAsk: config?.canAsk ?? (() => true),
    bundleUrl: (config?.bundleUrl || '/api/translations').replace(/\/+$/, ''),
    fetchBundle: config?.fetchBundle ?? null,
    onBundleRefused: config?.onBundleRefused ?? null,
    englishOnly: config?.englishOnly ?? isAdminArea,
    locales: { ...DEFAULT_LOCALES, ...config?.locales },
    browserAliases: config?.browserAliases ?? DEFAULT_BROWSER_ALIASES,
    waits: { ...DEFAULT_WAITS, ...config?.waits },
    admin: config?.admin ?? {},
  };
}
