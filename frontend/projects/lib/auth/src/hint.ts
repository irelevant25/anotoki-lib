/*
 * The IAM's sign-in hint, as a site reads it: the cookie `anotoki_signed_in`,
 * which the IAM sets wherever it opens a session (a random value per session,
 * readable by script, for every host under the IAM's parent domain) and clears
 * when its session ends. It says that somebody signed in at the IAM in this
 * browser - never who: it is a reason to try one silent sign-in, and nothing
 * else. Sites never write it or delete it.
 *
 * The loop protection is the site's own marker, kept in localStorage - never a
 * cookie - under anotoki-auth:{clientId}:hint: {value, at, failed?}. Each hint
 * value is tried once, at most one try a minute whatever the value, and ten
 * minutes after the IAM did not answer its discovery document.
 */

/** The hint's shape, as the IAM makes it (16 random bytes in base64url) and reads it back. */
export const HINT_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/** At most one try in this long, whatever the value (the breaker). */
export const HINT_BREAKER_MS = 60_000;

/** After the IAM did not answer the probe, the next try waits this long. */
export const HINT_FAILED_WAIT_MS = 600_000;

/** How long the IAM's discovery document is waited for before a hop. */
export const HINT_PROBE_MS = 1_500;

export interface HintMarker {
  /** The hint value tried last (or that a failed probe was for). */
  value: string;
  /** When, in ms since the epoch. */
  at: number;
  /** The IAM did not answer its discovery document: the value was not tried. */
  failed?: boolean;
}

/** The hint cookie's value in `cookies` (document.cookie), when it is one: of the hint's shape - or null. */
export function readHint(cookies: string, name: string): string | null {
  for (const part of cookies.split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) {
      continue;
    }
    let value = part.slice(at + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
    return HINT_SHAPE.test(value) ? value : null;
  }
  return null;
}

/** The key of the marker in localStorage, beside the client's tokens. */
export function markerKey(clientId: string): string {
  return `anotoki-auth:${clientId}:hint`;
}

/** The marker kept, or null - for none, and for anything that is not one. */
export function readMarker(storage: Storage, clientId: string): HintMarker | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(markerKey(clientId)) ?? 'null');
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const marker = parsed as Partial<HintMarker>;
    return typeof marker.value === 'string' && typeof marker.at === 'number' && Number.isFinite(marker.at)
      ? { value: marker.value, at: marker.at, ...(marker.failed === true ? { failed: true } : {}) }
      : null;
  } catch {
    return null;
  }
}

/** Writes the marker and reads it back: false when storage cannot keep it - and then there is no hop, ever. */
export function writeMarker(storage: Storage, clientId: string, marker: HintMarker): boolean {
  const text = JSON.stringify(marker);
  try {
    storage.setItem(markerKey(clientId), text);
    return storage.getItem(markerKey(clientId)) === text;
  } catch {
    return false;
  }
}

/**
 * Whether the marker lets a hop go for this value now. A clock that went back
 * (a marker from the future) counts as long enough ago: the value check alone
 * still stops a second try for the same value.
 */
export function hintMayHop(marker: HintMarker | null, value: string, now: number): boolean {
  if (marker === null) {
    return true;
  }
  const age = now - marker.at;
  if (marker.failed) {
    return age < 0 || age >= HINT_FAILED_WAIT_MS;
  }
  return marker.value !== value && (age < 0 || age >= HINT_BREAKER_MS);
}
