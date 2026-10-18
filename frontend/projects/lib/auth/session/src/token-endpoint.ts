import {
  AnotokiAuthError,
  AnotokiInitResult,
  AnotokiPreferenceChanges,
  AnotokiSavedPreferences,
  AnotokiUser,
  ClientParts,
  StoredSession,
  authError,
  decodeJwtPayload,
  preferencesFrom,
  safeReturnTo,
} from '@anotoki/lib/auth/core';

/*
 * The client's parts that run only at a moment - the IAM's SDK 1.2.0 as ported, moved out of the first part of
 * the client (createAuthClient(), @anotoki/lib/auth) so a site's first load does not carry them: a callback's
 * code exchanged for tokens, a refresh, a save of the account's preferences. The client loads this entry point
 * the first time one of them is needed, and hands itself over (ClientParts).
 *
 * The ID token's claims are checked (issuer, audience, nonce, expiry with ten minutes for a device's clock); its
 * signature is not. It arrives straight from the token endpoint over TLS, and it only tells this page who signed
 * in - the backend verifies the access token, which is the one that grants anything.
 */

/** A sign-in that has not come back within this long is abandoned. */
const PENDING_TTL_MS = 3_600_000;

/**
 * Slack on the ID token's expiry, for a device whose clock is a few minutes
 * out. Wider than a backend would allow, because a phone's clock is not a
 * server's.
 */
const CLOCK_LEEWAY_S = 600;

interface PendingSignIn {
  verifier: string;
  nonce: string;
  returnTo: string;
  createdAt: number;
  silent?: boolean;
}

interface TokenAnswer {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
}

/** The lock that serialises refreshes across tabs, where the browser has Web Locks. */
function withLock<T>(name: string, run: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks?.request ? (locks.request(name, run) as Promise<T>) : run();
}

// ── the ID token, and who it says is signed in ─────────────────────────────

function checkIdToken(parts: ClientParts, idToken: string, expectedNonce: string | undefined): Record<string, unknown> {
  const claims = decodeJwtPayload(idToken);
  const now = Math.floor(Date.now() / 1000);

  if (!claims) {
    throw authError('invalid_id_token', 'The sign-in answer could not be read');
  }
  if (claims['iss'] !== parts.issuer) {
    throw authError('invalid_id_token', 'The sign-in answer came from a different issuer');
  }
  const audience = Array.isArray(claims['aud']) ? (claims['aud'] as unknown[]) : [claims['aud']];
  if (!audience.includes(parts.clientId) || (audience.length > 1 && claims['azp'] !== parts.clientId)) {
    throw authError('invalid_id_token', 'The sign-in answer was meant for a different site');
  }
  if (typeof claims['exp'] !== 'number' || claims['exp'] + CLOCK_LEEWAY_S < now) {
    throw authError('invalid_id_token', "The sign-in answer has expired - is this device's clock right?");
  }
  if (expectedNonce !== undefined && claims['nonce'] !== expectedNonce) {
    throw authError('invalid_id_token', 'The sign-in answer does not belong to this sign-in');
  }

  return claims;
}

function userFrom(claims: Record<string, unknown>): AnotokiUser {
  return {
    sub: String(claims['sub']),
    preferred_username: (claims['preferred_username'] as string | undefined) ?? null,
    email: (claims['email'] as string | undefined) ?? null,
    email_verified: claims['email_verified'] === true,
    locale: (claims['locale'] as string | undefined) ?? null,
    roles: Array.isArray(claims['roles']) ? (claims['roles'] as unknown[]).map(String) : [],
    preferences: preferencesFrom(claims['preferences']),
  };
}

function sessionFrom(parts: ClientParts, tokens: TokenAnswer, previous: StoredSession | null, expectedNonce?: string): StoredSession {
  const user = tokens.id_token ? userFrom(checkIdToken(parts, tokens.id_token, expectedNonce)) : (previous?.user ?? null);

  return {
    access_token: tokens.access_token,
    access_expires_at: Date.now() + Number(tokens.expires_in ?? 0) * 1000,
    // A refresh answer without one (a personal token never rotates, and an IAM may choose not to) keeps
    // the one it was given.
    refresh_token: tokens.refresh_token ?? previous?.refresh_token ?? null,
    id_token: tokens.id_token ?? previous?.id_token ?? null,
    user,
    updated_at: Date.now(),
    // A new session is made under the hint the browser holds now; a refreshed one keeps its own.
    hint: previous === null ? parts.hintNow() : previous.hint,
  };
}

// ── the token endpoint ─────────────────────────────────────────────────────

async function tokenRequest(parts: ClientParts, parameters: Record<string, string>): Promise<TokenAnswer> {
  const tokenEndpoint = parts.endpoint(await parts.endpoints(), 'token_endpoint');
  const response = await parts.fetch(tokenEndpoint, {
    method: 'POST',
    // A form body keeps this a "simple" CORS request: no preflight, one round trip.
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: parts.clientId, ...parameters }),
  });

  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw authError(String(body?.['error'] ?? `http_${response.status}`), String(body?.['error_description'] ?? 'The IAM refused the request'));
  }

  return body as unknown as TokenAnswer;
}

/**
 * One refresh, under the lock every tab takes - the client keeps it to one at a time in this page.
 *
 * Refresh tokens rotate: each one is good once. Two tabs refreshing at the same moment would spend the same
 * token twice, which the IAM reads as theft and answers by ending the session - so a tab that waited for the
 * lock re-reads what the other one got instead of refreshing again.
 *
 * `refusedToken` is the access token an API has just answered 401 to. It is refreshed even though it looks
 * fresh - a revoked session or a rotated key does not show on the token itself - unless another tab has
 * meanwhile got a different one, which is then the answer.
 */
export function refresh(parts: ClientParts, refusedToken: string | null): Promise<string | null> {
  return withLock(parts.lockName, async (): Promise<string | null> => {
    // Another tab may have refreshed, or signed out, while this one waited for the lock. What it wrote
    // is newer than what this page holds.
    const stored = parts.readSession();
    if (stored !== undefined) {
      parts.adoptSession(stored);
    }
    const fresh = parts.freshToken(parts.session());
    if (fresh !== null && fresh !== refusedToken) {
      return fresh;
    }
    const current = parts.session();
    if (!current?.refresh_token) {
      return null;
    }

    try {
      const tokens = await tokenRequest(parts, { grant_type: 'refresh_token', refresh_token: current.refresh_token });
      parts.writeSession(sessionFrom(parts, tokens, current));
      return parts.session()?.access_token ?? null;
    } catch (error) {
      // The IAM said no: the session is over (signed out elsewhere, account disabled, access taken away).
      // Anything else - no network, a 500 - leaves the session where it is to be tried again.
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'invalid_grant' || code === 'invalid_client') {
        parts.writeSession(null);
        parts.sessionEnded(current);
      }
      return null;
    }
  });
}

// ── the callback ───────────────────────────────────────────────────────────

function takePending(parts: ClientParts, state: string): PendingSignIn | null {
  const key = parts.pendingPrefix + state;
  let pending: PendingSignIn | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(key) ?? 'null') as PendingSignIn | null;
    sessionStorage.removeItem(key);
  } catch {
    pending = null;
  }
  return pending && typeof pending.createdAt === 'number' && pending.createdAt > Date.now() - PENDING_TTL_MS ? pending : null;
}

/** The callback's code exchanged for tokens - the page is the redirect URI with ?code&state (or ?error). */
export async function finishCallback(parts: ClientParts): Promise<AnotokiInitResult> {
  const params = new URLSearchParams(location.search);
  const pending = takePending(parts, params.get('state') ?? '');

  if (!pending) {
    return { returnTo: '/', error: authError('state_mismatch', 'That sign-in did not start here, or took too long'), silent: false };
  }

  const returnTo = safeReturnTo(pending.returnTo);
  const silent = pending.silent === true;

  if (params.has('error')) {
    return { returnTo, silent, error: authError(params.get('error') ?? 'unknown', params.get('error_description') ?? 'The sign-in did not complete') };
  }

  // RFC 9207: the answer names who sent it, so one IAM's code cannot be passed off as another's.
  if (params.has('iss') && params.get('iss') !== parts.issuer) {
    return { returnTo, silent, error: authError('invalid_issuer', 'The sign-in answer came from a different issuer') };
  }

  try {
    const tokens = await tokenRequest(parts, {
      grant_type: 'authorization_code',
      code: params.get('code') ?? '',
      redirect_uri: parts.redirectUri,
      code_verifier: pending.verifier,
    });
    parts.writeSession(sessionFrom(parts, tokens, null, pending.nonce));
    return { returnTo, silent, error: null };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return { returnTo, silent, error: typeof code === 'string' ? (error as AnotokiAuthError) : authError('network', 'The IAM could not be reached') };
  }
}

// ── the account's preferences ─────────────────────────────────────────────

/**
 * Changes the account's preferences - for every anotoki site, not just this one. Resolves to the
 * account's preferences and locale as they now stand, and puts them in user() at once, in every tab.
 * Rejects with the IAM's error code: "login_required" when nobody is signed in, "insufficient_scope",
 * "invalid_request" for a value the IAM does not take, "access_denied" when the site no longer lets the
 * person in, "network" when the IAM cannot be reached.
 */
export async function savePreferences(parts: ClientParts, changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> {
  const sub = parts.session()?.user?.sub;
  if (!sub) {
    throw authError('login_required', 'Nobody is signed in');
  }

  // Only ever with this person's own token. Another tab may sign somebody else in while this one waits
  // for a token, and a refresh takes up what that tab stored: a token that is no longer this person's is
  // not sent, or the change would land on the other account.
  const ownToken = async (refused: string | null): Promise<string | null> => {
    const token = await (refused ? parts.refresh(refused) : parts.getAccessToken());
    const now = parts.session();
    if (now?.user?.sub !== sub) {
      throw authError('login_required', now?.user ? 'Somebody else signed in meanwhile' : 'Nobody is signed in');
    }
    return token;
  };
  const send = async (token: string): Promise<Response> => {
    try {
      return await parts.fetch(`${parts.issuer}/api/oidc/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(changes ?? {}),
      });
    } catch {
      throw authError('network', 'The IAM could not be reached');
    }
  };

  const token = await ownToken(null);
  if (!token) {
    throw authError('network', 'The IAM could not be reached');
  }
  let response = await send(token);
  if (response.status === 401) {
    // One retry, and only with a token that is actually different.
    const renewed = await ownToken(token);
    if (renewed && renewed !== token) {
      response = await send(renewed);
    }
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw authError(String(body?.['error'] ?? `http_${response.status}`), String(body?.['error_description'] ?? 'The IAM refused the change'));
  }

  const saved: AnotokiSavedPreferences = { locale: (body?.['locale'] as string | undefined) ?? null, preferences: preferencesFrom(body?.['preferences']) };
  // Written over what is stored now - unless this tab or another signed out, or somebody else signed in,
  // while the change was on its way: then the answer belongs to nobody on the page. Under the refresh lock:
  // what is written back holds the refresh token too, and one another tab rotates between the read and
  // the write would put a spent token back - whose next use the IAM takes for theft, and ends the session.
  await withLock(parts.lockName, async () => {
    const stored = parts.readSession();
    const current = stored === undefined ? parts.session() : stored;
    if (current?.user?.sub === sub) {
      parts.writeSession({ ...current, user: { ...current.user, ...saved } });
    }
  });
  return saved;
}
