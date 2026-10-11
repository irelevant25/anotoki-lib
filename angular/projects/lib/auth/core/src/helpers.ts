import { AnotokiAuthError, AnotokiPreferences } from './types';

/** What the IAM may say for each preference; anything else reads as the default. */
const THEMES = ['auto', 'light', 'dark'];
const DATE_FORMATS = ['dmy_dot', 'dmy_slash', 'mdy_slash', 'ymd_dash'];
const TIME_FORMATS = ['24', '12'];

/** An Error with the code the IAM or the client gave it. */
export function authError(code: string, message: string): AnotokiAuthError {
  return Object.assign(new Error(message), { code });
}

/**
 * Only a path on this site. Anything else - another origin, a protocol-relative
 * "//evil", a javascript: URL - would make the callback an open redirect.
 *
 * Judged as the browser will read it: the URL parser drops tabs and line breaks
 * and reads a backslash as a slash, so "/\t/evil" and "/\\evil" are "//evil" by
 * the time they are followed. No control character or backslash is let through,
 * and what is left must resolve to this origin with a path that does not itself
 * start "//" ("/.//evil" normalises to that). The text is handed back as it
 * came, never the normalised form.
 */
export function safeReturnTo(value: unknown, origin: string = location.origin): string {
  const text = typeof value === 'string' ? value : '';
  if (!text.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(text)) {
    return '/';
  }
  try {
    const url = new URL(text, origin);
    return url.origin === origin && !url.pathname.startsWith('//') ? text : '/';
  } catch {
    return '/';
  }
}

/** A JWT's payload, read without checking its signature (the ID token's claims are checked one by one), or null. */
export function decodeJwtPayload(jwt: unknown): Record<string, unknown> | null {
  const part = String(jwt ?? '').split('.')[1];
  if (!part) {
    return null;
  }
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The account's theme, date order and clock, or null when the IAM sends none -
 * an IAM from before preferences, or a scope without `profile` - and the site
 * keeps to its own. A value this client does not know (a newer IAM's) reads as
 * the default: "auto", or null for "automatic".
 */
export function preferencesFrom(value: unknown): AnotokiPreferences | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const given = value as Record<string, unknown>;
  return {
    theme: THEMES.includes(given['theme'] as string) ? (given['theme'] as AnotokiPreferences['theme']) : 'auto',
    date_format: DATE_FORMATS.includes(given['date_format'] as string) ? (given['date_format'] as AnotokiPreferences['date_format']) : null,
    time_format: TIME_FORMATS.includes(given['time_format'] as string) ? (given['time_format'] as AnotokiPreferences['time_format']) : null,
  };
}
