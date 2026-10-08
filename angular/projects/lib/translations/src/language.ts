import { SiteLanguage, TranslationBundle } from './models';

/**
 * What everything falls back to: the server merges English underneath every
 * bundle, the English areas (an admin panel) are English whatever the person
 * reads, and a site's compiled English is English.
 */
export const FALLBACK_LANGUAGE = 'en';

/** A language code as the database keeps it - the same expression as the server's check (LanguageCode::ok). */
const LANGUAGE_CODE = /^[a-z]{2}(-[a-z]{2})?$/;

/** A placeholder in a string - the same expression as the server's (Placeholders::PATTERN). */
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/** What fills a string's {placeholders}. */
export type TranslationParams = Readonly<Record<string, string | number | null | undefined>>;

/** The code, lower-cased, when it has the shape of one - anything else is nothing: never stored, never sent. */
export function languageCode(raw: unknown): string | null {
  const code = typeof raw === 'string' ? raw.toLowerCase() : '';
  return LANGUAGE_CODE.test(code) ? code : null;
}

/** A language somebody may want, and whether it is the browser that said so (only there do aliases count). */
export interface LanguageCandidate {
  code: string;
  browser: boolean;
}

/** Where a wish for a language can come from, strongest first. */
export interface LanguageSources {
  /** `?lang=`, kept for this tab. */
  tab?: string | null;
  /**
   * The choice: what this device remembered - or, while the account's
   * language decides, a choice of this visit the account has not taken (on
   * its way to it, refused, or made before signing in).
   */
  chosen?: string | null;
  /** The account's language (an IAM token's `locale`; the IAM's own session). */
  account?: string | null;
  /** While the account's language decides: what this device remembered, under the account's. */
  device?: string | null;
  /** `navigator.languages`. */
  browser?: readonly (string | null | undefined)[];
}

/**
 * Every language the reader may want, in order: this tab's `?lang=`, the
 * choice, the account's language, the device's remembered choice where it
 * stands under the account's, each browser tag and then its first subtag
 * (`sk-SK` also asks for `sk`), and English.
 */
export function languageCandidates(sources: LanguageSources): LanguageCandidate[] {
  const candidates: LanguageCandidate[] = [];
  const add = (raw: unknown, browser: boolean): void => {
    const code = languageCode(raw);
    if (code && !candidates.some((candidate) => candidate.code === code && candidate.browser === browser)) {
      candidates.push({ code, browser });
    }
  };
  add(sources.tab, false);
  add(sources.chosen, false);
  add(sources.account, false);
  add(sources.device, false);
  for (const tag of sources.browser ?? []) {
    add(tag, true);
    add(typeof tag === 'string' ? tag.split('-')[0] : null, true);
  }
  add(FALLBACK_LANGUAGE, false);
  return candidates;
}

/**
 * The first candidate that is on offer - or, for a browser's wish, whose
 * alias is (a Czech browser reads Slovak while no Czech is on offer) - else
 * English.
 */
export function pickLanguage(candidates: readonly LanguageCandidate[], offered: readonly string[], aliases: Readonly<Record<string, string>> = {}): string {
  for (const candidate of candidates) {
    if (offered.includes(candidate.code)) {
      return candidate.code;
    }
    if (candidate.browser && Object.hasOwn(aliases, candidate.code) && offered.includes(aliases[candidate.code])) {
      return aliases[candidate.code];
    }
  }
  return FALLBACK_LANGUAGE;
}

/** The family's English areas: the admin panel - `/admin`, or anything under it, query and hash aside. */
export function isAdminArea(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === '/admin' || path.startsWith('/admin/');
}

/**
 * A string with its {placeholders} filled, in one pass: a parameter's own
 * text is never scanned again, a placeholder with no parameter stays as
 * written (a page cuts a sentence there for markup), and only what the
 * parameters hold themselves fills one - never what every object inherits.
 */
export function fillPlaceholders(value: string, params?: TranslationParams): string {
  if (!params) {
    return value;
  }
  return value.replace(PLACEHOLDER, (whole, name: string) => {
    const given = Object.hasOwn(params, name) ? params[name] : undefined;
    return given === undefined || given === null ? whole : String(given);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A flat {key: text} map, copied - or null when it is anything else. */
function stringsFrom(raw: unknown): Record<string, string> | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const strings: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') {
      return null;
    }
    strings[key] = value;
  }
  return strings;
}

/**
 * A bundle, from the server or from the cache, only when it is one: a
 * language code, the offered languages (each a code and two names, the
 * bundle's own among them), a flat map of strings that is not empty - and
 * English beside it for every other language. A bundle with no strings is no
 * bundle: it would put a key where every word should be, and the site's
 * compiled English is better than that.
 */
export function bundleFrom(raw: unknown): TranslationBundle | null {
  if (!isPlainObject(raw) || !Array.isArray(raw['languages'])) {
    return null;
  }
  const language = raw['language'];
  if (typeof language !== 'string' || !LANGUAGE_CODE.test(language)) {
    return null;
  }
  const languages: SiteLanguage[] = [];
  for (const entry of raw['languages']) {
    if (!isPlainObject(entry)) {
      return null;
    }
    const { code, name, native_name } = entry;
    if (typeof code !== 'string' || !LANGUAGE_CODE.test(code) || typeof name !== 'string' || typeof native_name !== 'string') {
      return null;
    }
    languages.push({ code, name, native_name });
  }
  const values = stringsFrom(raw['values']);
  if (!values || !Object.keys(values).length || !languages.some((entry) => entry.code === language)) {
    return null;
  }
  if (language === FALLBACK_LANGUAGE) {
    return { language, languages, values };
  }
  const english = stringsFrom(raw['english']);
  return english ? { language, languages, values, english } : null;
}

/** `?lang=` of an address, as the most it can ask for: the code it has the shape of, else its first subtag's, else nothing. */
export function addressLanguage(url: string): string | null {
  const query = url.split('#')[0];
  const at = query.indexOf('?');
  if (at < 0) {
    return null;
  }
  for (const part of query.slice(at + 1).split('&')) {
    const [name, value = ''] = part.split('=');
    if (name !== 'lang') {
      continue;
    }
    let text = '';
    try {
      text = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      return null;
    }
    return languageCode(text) ?? languageCode(text.split('-')[0]);
  }
  return null;
}
