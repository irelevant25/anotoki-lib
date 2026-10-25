import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { provideLibraryWords } from '@anotoki/lib/ui/config';
import { LEGAL_LINKS_LIBRARY_WORDS } from '@anotoki/lib/words/legal-links';

/** Who runs a site: its name, its own site, the address to write to, and - when given - its registered details. */
export interface LegalOperator {
  /** As the pages say it: 'Code Hero s.r.o.'. */
  name: string;
  /** Its own site, which its name links to on Privacy and Contact: 'https://codehero.sk'. Null: no link. */
  url: string | null;
  /**
   * The address every page gives for writing. Two parts - the mailbox and the domain - are joined only when a page
   * draws it, so the whole address stands in no file a simple harvester reads; a whole one is taken too.
   */
  email: string | readonly [mailbox: string, domain: string];
  /** Its registered office and registration, a line each, as they are to be read - shown under who runs the site. */
  details?: readonly string[];
}

/**
 * The family's operator, the owner's decision of 2026-10-13: Code Hero s.r.o., run from Slovakia, written to at the
 * family's support mailbox (in two parts here, never whole). The pages' words say Slovakia (its law, its data
 * protection authority): a site run by another operator from elsewhere rewords them on its Translations page.
 */
export const LEGAL_OPERATOR: LegalOperator = { name: 'Code Hero s.r.o.', url: 'https://codehero.sk', email: ['support', 'anotoki.eu'] };

/** Where a site shows the legal pages and, 0.8.0, the About and Support pages: its own paths. */
export interface LegalPaths {
  terms: string;
  privacy: string;
  contact: string;
  /** The About page (@anotoki/lib/legal/about): '/about'. */
  about: string;
  /** The Support page (@anotoki/lib/legal/support): '/support'. */
  support: string;
}

export const DEFAULT_LEGAL_PATHS: Readonly<LegalPaths> = { terms: '/terms', privacy: '/privacy', contact: '/contact', about: '/about', support: '/support' };

/** The anotoki account, as the pages speak of it. */
export interface LegalAccount {
  /** True on the anotoki account's own site (the IAM): what it keeps is the account itself. */
  isIam?: boolean;
  /** The account page where a person deletes their account: the IAM's (with the auth module, `auth.accountUrl()`); on the IAM, its own path. */
  deleteUrl: string;
  /** The anotoki account's own privacy policy - every site but the IAM links to it. */
  privacyUrl?: string | null;
  /** The days between asking for a deletion and the deletion: the IAM's 30. */
  deletionDays?: number;
}

/** A kind of data the site keeps, in the page's language. */
export interface LegalDataItem {
  /** Short: a heading on Privacy, and its line under "How long it is kept" - 'Your progress'. */
  name: string;
  /** What exactly, a sentence or two. */
  what?: string | null;
  /** What it is for. */
  why: string;
  /** How long it stays: 'Until you delete it, or your account is deleted.' */
  kept: string;
}

/** What a site keeps for people who use it without an account, in the page's language. */
export interface LegalVisitors {
  what: string;
  /** What it is for; the library's "So that the site can be used without an account." when none. */
  why?: string | null;
  /** '30 days after the last visit.' */
  kept: string;
}

/**
 * One of the library's modules the site runs, described in the library's words; each part the site's own where
 * it does more or otherwise (the IAM's audit log keeps people's own security changes and their address).
 */
export interface LegalModule {
  what?: string | null;
  why?: string | null;
  kept?: string | null;
}

/** The visitors' feedback form (Anotoki\Lib\Feedback): its `keep`, when the site changed it. */
export interface LegalFeedback extends LegalModule {
  /** Days a resolved message stays: 365. */
  resolvedDays?: number;
  /** Days a message marked as spam stays: 30. */
  spamDays?: number;
}

/** The error log (Anotoki\Lib\ErrorLog): its `days`, when the site changed it. */
export interface LegalErrorLog extends LegalModule {
  /** 30. */
  days?: number;
}

/** The backups (Anotoki\Lib\Backups): encrypted or not, and their keeping, when the site changed it. */
export interface LegalBackups extends LegalModule {
  /** The IAM's are (`encryption`); the sites' are not. */
  encrypted?: boolean;
  /** `keepDaily`: 14. */
  daily?: number;
  /** `keepBeforeMigration`: 5. */
  beforeUpdate?: number;
  /** `keepBeforeRestore`: 5. */
  beforeRestore?: number;
}

/** Where a browser keeps a thing: a cookie, its local storage, its session storage. */
export type LegalStorageKind = 'cookie' | 'local' | 'session';

/**
 * The family's own browser storage, in the library's words: the IAM's sign-in hint (a cookie for every anotoki
 * site), the sign-in the auth module keeps, the theme, the language, the key of a visitor without an account, and -
 * 0.11.0 - the announcement bar's mark of the announcement its reader hid (@anotoki/lib/site-settings).
 */
export type LegalStoragePreset = 'signInHint' | 'signIn' | 'theme' | 'language' | 'visitorKey' | 'announcement';

/** A cookie or a stored item: one of the family's (`preset`), or the site's own in its own words. */
export type LegalStorageItem =
  | { preset: LegalStoragePreset; name: string; kind?: LegalStorageKind; purpose?: string | null; kept?: string | null }
  | { preset?: undefined; name: string; kind: LegalStorageKind; purpose: string; kept: string };

/**
 * Who else handles data: the family's (`preset`) - the hosting company and the mail service named by the site, or
 * "to be named" until it does; Cloudflare, in front of every site; Google, for signing in with Google (the IAM) - or
 * the site's own, in its own words.
 */
export type LegalProcessorPreset = 'hosting' | 'cloudflare' | 'google' | 'mail';

export type LegalProcessor =
  | { preset: LegalProcessorPreset; name?: string | null; role?: string | null; url?: string | null }
  | { preset?: undefined; name: string; role: string; url?: string | null };

/** The family's Umami, on the owner's own server: no cookie, no personal data, the query and the fragment left out. */
export const LEGAL_ANALYTICS_HOST = 'umami.anotoki.eu';

/**
 * A site's facts, worded in the page's language - every statement on its pages that is the site's: what it is, what
 * it keeps and for how long, its cookies, its analytics, who else handles data. The library's words say the rest.
 */
export interface LegalFacts {
  /** The site's name as the pages say it: 'anotoki survey'. */
  site: string;
  /** What the site is: a sentence or two, the first thing Terms says. */
  about: string;
  /**
   * The day the site's facts last changed ('2026-10-13'), for both pages or each: a page shows the later of it and
   * the day the library's words last did (LEGAL_TEXTS_UPDATED, @anotoki/lib/legal/pages).
   */
  updated?: string | { terms?: string | null; privacy?: string | null } | null;
  account: LegalAccount;
  /** What the site keeps of its own: its record of the people who sign in, their progress, ... */
  data: readonly LegalDataItem[];
  /** People who use the site without an account: what it keeps for their browser. None: the site has no visitors. */
  visitors?: LegalVisitors | null;
  /** The feedback form (the library's): true, or its keeping. Absent: the site takes no feedback - the Contact page gives the address alone. */
  feedback?: LegalFeedback | boolean;
  /** The error log - every site has it; false leaves it out. */
  errorLog?: LegalErrorLog | boolean;
  /** The audit log - every site has it; false leaves it out. */
  auditLog?: LegalModule | boolean;
  /** The backups - every site has them; false leaves them out. */
  backups?: LegalBackups | boolean;
  /** Its cookies and browser storage, each by its name. */
  storage: readonly LegalStorageItem[];
  /** Counting visits with the family's Umami: true by default; false, a site that counts none. */
  analytics?: boolean | { host?: string };
  /** Who else handles data. */
  processors: readonly LegalProcessor[];
  /** The fan clause on Terms and Contact: 'hoyoverse' (the genshin site, the build analyzer). */
  fanDisclaimer?: 'hoyoverse' | null;
}

/**
 * What a site gives the legal pages, through provideAnotokiLegal(). The functions run in an injection context when
 * the factory does, and are read as a page is drawn: a signal read in them is followed (the page's language, the
 * IAM's address once the site knows it).
 */
export interface AnotokiLegalConfig {
  /** The page's language: the pages' words are in it ('en' and 'sk' built in). */
  language?: () => string | null | undefined;
  /**
   * The site's own string for a library key (`anotoki.legal.termsTitle`) - an owner's rewording in its database -
   * before the built-in words. With the translations module: `(key) => inject(TranslationService).libraryWord(key)`.
   */
  translate?: (key: string) => string | null | undefined;
  /** Where the site shows the pages: /terms, /privacy, /contact, /about and /support unless it says otherwise. */
  paths?: Partial<LegalPaths>;
  /** Who runs the site: the family's operator (LEGAL_OPERATOR), each part the site's where it names another. */
  operator?: Partial<LegalOperator>;
  /** The site's facts, read by the pages alone (the footer's links need none of them). */
  facts: () => LegalFacts;
  /** How a day is written; by default the page's language's long date ('13 October 2026', '13. októbra 2026'). */
  formatDate?: (day: string) => string;
}

export const ANOTOKI_LEGAL_CONFIG = new InjectionToken<AnotokiLegalConfig>('ANOTOKI_LEGAL_CONFIG');

/**
 * Configures the legal pages (@anotoki/lib/legal/pages), the About and Support pages (@anotoki/lib/legal/about,
 * @anotoki/lib/legal/support - their language, words and paths) and the footer's links (<anotoki-legal-links>). The
 * factory runs in an injection context, so it can inject the site's own services:
 *
 * ```ts
 * provideAnotokiLegal(() => {
 *   const i18n = inject(TranslationService), auth = inject(AnotokiAuth);
 *   return {
 *     language: () => i18n.language(),
 *     translate: (key) => i18n.libraryWord(key),
 *     facts: () => ({ site: i18n.t('brand.name'), about: i18n.t('legal.about'), account: { deleteUrl: auth.accountUrl() }, ... }),
 *   };
 * })
 * ```
 *
 * It registers the footer's words (`anotoki.legalLinks.*`) with the translations module. The pages' own words
 * (`anotoki.legal.*`, `anotoki.about.*`, `anotoki.support.*`: pages of text) come with the pages alone: they read
 * them themselves.
 */
export function provideAnotokiLegal(factory: () => AnotokiLegalConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: factory }, provideLibraryWords(LEGAL_LINKS_LIBRARY_WORDS)]);
}

/** The site's paths, the defaults under them. */
export function legalPaths(paths?: Partial<LegalPaths> | null): LegalPaths {
  return {
    terms: paths?.terms || DEFAULT_LEGAL_PATHS.terms,
    privacy: paths?.privacy || DEFAULT_LEGAL_PATHS.privacy,
    contact: paths?.contact || DEFAULT_LEGAL_PATHS.contact,
    about: paths?.about || DEFAULT_LEGAL_PATHS.about,
    support: paths?.support || DEFAULT_LEGAL_PATHS.support,
  };
}

/** The operator: the family's, each part the site's where it names one. */
export function legalOperator(operator?: Partial<LegalOperator> | null): LegalOperator {
  return {
    name: operator?.name || LEGAL_OPERATOR.name,
    url: operator?.url === undefined ? LEGAL_OPERATOR.url : operator.url,
    email: operator?.email || LEGAL_OPERATOR.email,
    details: operator?.details ?? [],
  };
}

/** The address to write to, whole - joined here, as a page draws it. */
export function legalEmail(email: LegalOperator['email']): string {
  return typeof email === 'string' ? email.trim() : `${email[0]}@${email[1]}`;
}
