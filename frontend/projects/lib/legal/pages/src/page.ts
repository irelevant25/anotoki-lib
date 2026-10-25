import { DOCUMENT, Signal, computed, inject } from '@angular/core';
import {
  ANOTOKI_LEGAL_CONFIG,
  AnotokiLegalConfig,
  LEGAL_ANALYTICS_HOST,
  LegalFacts,
  LegalOperator,
  LegalPaths,
  LegalStorageKind,
  LegalStoragePreset,
  legalEmail,
  legalOperator,
  legalPaths,
} from '@anotoki/lib/legal';
import { fillWords } from '@anotoki/lib/ui/config';
import { uniqueId } from '@anotoki/lib/ui/dom';
import { LEGAL_TEXTS_UPDATED, LegalWords, legalWords } from './words';

/** A link a sentence holds where its `{name}` stands: where it leads and what it says. */
export interface LegalLink {
  name: string;
  href: string;
  label: string;
}

/** A part of what the site keeps, ready to draw: its own (the site's list) or one of the library's modules. */
export interface LegalKept {
  id: string;
  name: string;
  what: string | null;
  why: string;
  kept: string;
}

/** A cookie or a stored item, ready to draw. */
export interface LegalStored {
  name: string;
  kind: string;
  purpose: string;
  kept: string;
}

/** Somebody else who handles data, ready to draw. */
export interface LegalRecipient {
  name: string;
  role: string;
  url: string | null;
}

/** Slovakia's data protection authority, where a complaint goes (its name: anotoki.legal.authority). */
export const DATA_PROTECTION_AUTHORITY_URL = 'https://dataprotection.gov.sk/';

/** The privacy policies the pages link the family's two companies to. */
const CLOUDFLARE = { name: 'Cloudflare, Inc.', url: 'https://www.cloudflare.com/privacypolicy/' };
const GOOGLE = { name: 'Google', url: 'https://policies.google.com/privacy' };

/** The library's defaults where a site changed nothing: Feedback's `keep`, ErrorLog's `days`, Backups' keeping. */
const FEEDBACK_RESOLVED_DAYS = 365;
const FEEDBACK_SPAM_DAYS = 30;
const ERROR_LOG_DAYS = 30;
const BACKUPS = { daily: 14, beforeUpdate: 5, beforeRestore: 5 };
const DELETION_DAYS = 30;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LOCALES: Readonly<Record<string, string>> = { en: 'en-GB', sk: 'sk-SK' };

/** The later of some days ('YYYY-MM-DD'); a value that is none is passed over. */
export function laterDay(...days: (string | null | undefined)[]): string {
  return days.filter((day): day is string => typeof day === 'string' && DAY.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`))).reduce((a, b) => (b > a ? b : a), LEGAL_TEXTS_UPDATED);
}

/**
 * A sentence cut at one placeholder, for a link in its place: the words before and after it, each filled. A
 * sentence an owner reworded without the placeholder keeps its words, and the link follows them.
 */
export function cutAt(text: string, name: string | null, params?: Readonly<Record<string, string | number>>): { before: string; after: string } {
  const mark = name === null ? null : `{${name}}`;
  const at = mark === null ? -1 : text.indexOf(mark);
  if (at < 0 || mark === null) {
    return { before: fillWords(text, params) + (name === null ? '' : ' '), after: '' };
  }
  return { before: fillWords(text.slice(0, at), params), after: fillWords(text.slice(at + mark.length), params) };
}

/** A path of the site's own (a link the router follows), not an address of somewhere else. */
export function isOwnPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}

/** Whether a module the site runs is on: `true`, its own words, or - for the ones every site has - nothing said. */
function on<T extends object>(value: T | boolean | undefined, byDefault: boolean): T | null {
  if (value === undefined) {
    return byDefault ? ({} as T) : null;
  }
  if (value === false) {
    return null;
  }
  return value === true ? ({} as T) : value;
}

/** What the site keeps: its own list, then what it keeps for visitors, then the library's modules it runs. */
export function keptParts(facts: LegalFacts, w: LegalWords): LegalKept[] {
  const parts: LegalKept[] = facts.data.map((item, index) => ({ id: `data-${index}`, name: item.name, what: item.what ?? null, why: item.why, kept: item.kept }));
  if (facts.visitors) {
    parts.push({ id: 'visitors', name: w.visitorsName, what: facts.visitors.what, why: facts.visitors.why || w.visitorsWhy, kept: facts.visitors.kept });
  }
  const feedback = on(facts.feedback, false);
  if (feedback) {
    const kept = fillWords(w.feedbackKept, { resolvedDays: feedback.resolvedDays ?? FEEDBACK_RESOLVED_DAYS, spamDays: feedback.spamDays ?? FEEDBACK_SPAM_DAYS });
    parts.push({ id: 'feedback', name: w.feedbackName, what: feedback.what || w.feedbackWhat, why: feedback.why || w.feedbackWhy, kept: feedback.kept || kept });
  }
  const errorLog = on(facts.errorLog, true);
  if (errorLog) {
    parts.push({
      id: 'error-log',
      name: w.errorLogName,
      what: errorLog.what || w.errorLogWhat,
      why: errorLog.why || w.errorLogWhy,
      kept: errorLog.kept || fillWords(w.errorLogKept, { days: errorLog.days ?? ERROR_LOG_DAYS }),
    });
  }
  const auditLog = on(facts.auditLog, true);
  if (auditLog) {
    parts.push({ id: 'audit-log', name: w.auditLogName, what: auditLog.what || w.auditLogWhat, why: auditLog.why || w.auditLogWhy, kept: auditLog.kept || w.auditLogKept });
  }
  const backups = on(facts.backups, true);
  if (backups) {
    const where = backups.encrypted ? w.backupsWhereEncrypted : w.backupsWherePlain;
    const kept = fillWords(w.backupsKept, {
      daily: backups.daily ?? BACKUPS.daily,
      beforeUpdate: backups.beforeUpdate ?? BACKUPS.beforeUpdate,
      beforeRestore: backups.beforeRestore ?? BACKUPS.beforeRestore,
    });
    parts.push({ id: 'backups', name: w.backupsName, what: `${backups.what || w.backupsWhat} ${where}`, why: backups.why || w.backupsWhy, kept: backups.kept || kept });
  }
  return parts;
}

const PRESETS: Readonly<Record<LegalStoragePreset, { kind: LegalStorageKind; purpose: keyof LegalWords; kept: keyof LegalWords }>> = {
  signInHint: { kind: 'cookie', purpose: 'storageHintPurpose', kept: 'storageHintKept' },
  signIn: { kind: 'local', purpose: 'storageSignInPurpose', kept: 'storageSignInKept' },
  theme: { kind: 'local', purpose: 'storageThemePurpose', kept: 'storageUntilCleared' },
  language: { kind: 'local', purpose: 'storageLanguagePurpose', kept: 'storageUntilCleared' },
  visitorKey: { kind: 'local', purpose: 'storageVisitorPurpose', kept: 'storageVisitorKept' },
  announcement: { kind: 'local', purpose: 'storageAnnouncementPurpose', kept: 'storageUntilCleared' },
};

const KINDS: Readonly<Record<LegalStorageKind, keyof LegalWords>> = { cookie: 'storageCookie', local: 'storageLocal', session: 'storageSession' };

/** The site's cookies and stored items, the family's in the library's words. */
export function storedParts(facts: LegalFacts, w: LegalWords): LegalStored[] {
  return facts.storage.map((item) => {
    const preset = item.preset ? PRESETS[item.preset] : null;
    const kind = item.kind ?? preset?.kind ?? 'local';
    return {
      name: item.name,
      kind: w[KINDS[kind]],
      purpose: item.purpose || (preset ? w[preset.purpose] : ''),
      kept: item.kept || (preset ? w[preset.kept] : ''),
    };
  });
}

/** Who else handles data: a company the site has not named yet is said to be named later. */
export function recipients(facts: LegalFacts, w: LegalWords): LegalRecipient[] {
  const unnamed = (generic: string) => `${generic} (${w.toBeNamed})`;
  return facts.processors.map((processor) => {
    switch (processor.preset) {
      case 'hosting':
        return { name: processor.name || unnamed(w.hostingName), role: processor.role || w.hostingRole, url: processor.url ?? null };
      case 'mail':
        return { name: processor.name || unnamed(w.mailName), role: processor.role || w.mailRole, url: processor.url ?? null };
      case 'cloudflare':
        return { name: processor.name || CLOUDFLARE.name, role: processor.role || w.cloudflareRole, url: processor.url === undefined ? CLOUDFLARE.url : processor.url };
      case 'google':
        return { name: processor.name || GOOGLE.name, role: processor.role || w.googleRole, url: processor.url === undefined ? GOOGLE.url : processor.url };
      default:
        return { name: processor.name, role: processor.role, url: processor.url ?? null };
    }
  });
}

/** What every legal page reads: the configuration, the words in the page's language, the site's facts, who runs it. */
export interface LegalPageParts {
  readonly config: AnotokiLegalConfig;
  readonly id: string;
  readonly language: Signal<string>;
  readonly lang: Signal<string>;
  readonly w: Signal<LegalWords>;
  readonly facts: Signal<LegalFacts>;
  readonly operator: Signal<LegalOperator>;
  readonly paths: Signal<LegalPaths>;
  readonly email: Signal<string>;
  readonly emailLink: Signal<LegalLink>;
  readonly operatorLink: Signal<LegalLink | null>;
  readonly params: Signal<Readonly<Record<string, string | number>>>;
  readonly deleteUrl: Signal<string>;
  readonly analytics: Signal<string>;
  fill(text: string, extra?: Readonly<Record<string, string | number>>): string;
  updated(page: 'terms' | 'privacy'): { day: string; text: string; before: string; after: string };
}

/**
 * The legal pages' shared part - called in a page's field initializer, in its injection context. The site's facts
 * are read inside computed signals: what the site's function reads (the page's language, the IAM's address) is
 * followed.
 */
export function legalPage(prefix: string): LegalPageParts {
  const config = inject(ANOTOKI_LEGAL_CONFIG);
  const document = inject(DOCUMENT);

  const language = computed(() => (config.language?.() || document.documentElement.lang || 'en').trim());
  const said = computed(() => legalWords(language(), config.translate));
  const w = computed(() => said().words);
  const facts = computed(() => config.facts());
  const operator = computed(() => legalOperator(config.operator));
  const email = computed(() => legalEmail(operator().email));
  const params = computed(() => ({ site: facts().site, operator: operator().name, days: facts().account.deletionDays ?? DELETION_DAYS }));

  const parts: LegalPageParts = {
    config,
    id: uniqueId(prefix),
    language,
    lang: computed(() => said().lang),
    w,
    facts,
    operator,
    paths: computed(() => legalPaths(config.paths)),
    email,
    emailLink: computed(() => ({ name: 'email', href: `mailto:${email()}`, label: email() })),
    operatorLink: computed(() => {
      const { url, name } = operator();
      return url ? { name: 'operator', href: url, label: name } : null;
    }),
    params,
    deleteUrl: computed(() => facts().account.deleteUrl),
    analytics: computed(() => {
      const analytics = facts().analytics ?? true;
      if (analytics === false) {
        return w().privacyAnalyticsNone;
      }
      return fillWords(w().privacyAnalyticsText, { host: (analytics === true ? null : analytics.host) || LEGAL_ANALYTICS_HOST });
    }),
    fill: (text, extra) => fillWords(text, { ...params(), ...extra }),
    updated: (page) => {
      const own = facts().updated;
      const day = laterDay(typeof own === 'string' ? own : own?.[page]);
      const text = config.formatDate ? config.formatDate(day) : formatDay(day, language());
      const { before, after } = cutAt(w().updated, 'date');
      return { day, text, before, after };
    },
  };
  return parts;
}

/** A day as the language writes it: '13 October 2026', '13. októbra 2026'. */
function formatDay(day: string, language: string): string {
  const code = language.toLowerCase();
  const locale = LOCALES[code] ?? LOCALES[code.split('-')[0]] ?? code;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  } catch {
    return day;
  }
}
