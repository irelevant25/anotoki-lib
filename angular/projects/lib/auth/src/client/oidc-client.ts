/*
 * The browser client for the anotoki IAM - the IAM's SDK anotoki-auth.mjs
 * 1.2.0, ported into the library with everything it kept: OpenID Connect's
 * authorization code flow with PKCE, for a site whose frontend talks to its
 * own backend with a bearer token.
 *
 * What it keeps, and where - the SDK's keys, so nobody is signed out by the
 * move and a sign-in in flight during an upload still lands:
 *
 *   localStorage   anotoki-auth:{clientId}                the tokens and who they belong to, shared by every
 *                                                         tab; now also the hint the session was made under
 *   sessionStorage anotoki-auth:{clientId}:login:{state}  the PKCE verifier and nonce of a sign-in in
 *                                                         progress, until its callback lands; now also whether
 *                                                         it was silent
 *   sessionStorage anotoki-auth:discovery:{issuer}        the IAM's discovery document, for an hour
 *
 * Refresh tokens rotate: each one is good once. Two tabs refreshing at the
 * same moment would spend the same token twice, which the IAM reads as theft
 * and answers by ending the session - so refreshes are serialised across tabs
 * with the Web Lock anotoki-auth-refresh:{storageKey}, and a tab that waited
 * re-reads what the other one got instead of refreshing again.
 *
 * The ID token's claims are checked (issuer, audience, nonce, expiry with ten
 * minutes for a device's clock); its signature is not. It arrives straight
 * from the token endpoint over TLS, and it only tells this page who signed in
 * - the backend verifies the access token, which is the one that grants
 * anything.
 */

import {
  AnotokiAuthClient,
  AnotokiAuthEnvironment,
  AnotokiAuthError,
  AnotokiAuthOptions,
  AnotokiInitResult,
  AnotokiLoginParameters,
  AnotokiPreferenceChanges,
  AnotokiPreferences,
  AnotokiSavedPreferences,
  AnotokiUser,
  StoredSession,
} from './types';

/** What the IAM may say for each preference; anything else reads as the default. */
const THEMES = ['auto', 'light', 'dark'];
const DATE_FORMATS = ['dmy_dot', 'dmy_slash', 'mdy_slash', 'ymd_dash'];
const TIME_FORMATS = ['24', '12'];

const DEFAULT_SCOPE = 'openid profile email';

/** Refresh when less than this is left on the access token. */
const REFRESH_MARGIN_MS = 30_000;

/** How long a discovery document is reused before being asked for again. */
const DISCOVERY_TTL_MS = 3_600_000;

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

type Discovery = Record<string, unknown>;

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

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** The lock that serialises refreshes across tabs, where the browser has Web Locks. */
function withLock<T>(name: string, run: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks?.request ? (locks.request(name, run) as Promise<T>) : run();
}

/** The client for one IAM and one application (createAuth() of the SDK). */
export function createAuthClient(options: AnotokiAuthOptions, environment: AnotokiAuthEnvironment = {}): AnotokiAuthClient {
  const issuer = String(options?.issuer ?? '').replace(/\/+$/, '');
  const clientId = String(options?.clientId ?? '');
  const redirectUri = String(options?.redirectUri ?? '');

  if (!issuer || !clientId || !redirectUri) {
    throw new Error('anotoki auth: issuer, clientId and redirectUri are required');
  }

  const scope = options.scope ?? DEFAULT_SCOPE;
  const postLogoutRedirectUri = options.postLogoutRedirectUri ?? null;
  const storageKey = options.storageKey ?? `anotoki-auth:${clientId}`;
  const pendingPrefix = `${storageKey}:login:`;
  const discoveryKey = `anotoki-auth:discovery:${issuer}`;
  const lockName = `anotoki-auth-refresh:${storageKey}`;
  const doFetch: typeof fetch = environment.fetch ?? ((input, init) => fetch(input, init));
  const navigate = environment.navigate ?? ((url: string) => location.assign(url));
  const hintNow = environment.hintNow ?? (() => null);

  const listeners = new Set<() => void>();
  const endedListeners = new Set<(ended: StoredSession) => void>();
  let session: StoredSession | null = readSession() ?? null;
  let refreshing: Promise<string | null> | null = null;

  // Another tab signed in, refreshed or signed out: pick up what it wrote.
  const onStorage = (event: StorageEvent): void => {
    if (event.key === storageKey) {
      session = readSession() ?? null;
      notify();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  // ── storage ────────────────────────────────────────────────────────────────

  /**
   * What is stored, null for nothing - or undefined when storage cannot be read
   * at all, which callers take as "keep what this page already has in memory".
   */
  function readSession(): StoredSession | null | undefined {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const stored = parsed as StoredSession;
      // Kept by a copy of the SDK from before preferences: none known yet, and the next refresh brings them.
      if (stored.user && typeof stored.user === 'object' && !('preferences' in stored.user)) {
        (stored.user as AnotokiUser).preferences = null;
      }
      return stored;
    } catch {
      return undefined;
    }
  }

  function writeSession(next: StoredSession | null): void {
    session = next;
    try {
      if (next) {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // A browser refusing storage (private mode on some engines) still gets a working session for this
      // page; it just will not survive a reload.
    }
    notify();
  }

  function notify(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error('[anotoki auth] a change listener threw', error);
      }
    }
  }

  // ── discovery ──────────────────────────────────────────────────────────────

  // The IAM's own paths, used when discovery cannot be reached. Refreshing an existing session should not
  // depend on one more request succeeding.
  function defaultEndpoints(): Discovery {
    return {
      issuer,
      authorization_endpoint: `${issuer}/api/oidc/authorize`,
      token_endpoint: `${issuer}/api/oidc/token`,
      end_session_endpoint: `${issuer}/api/oidc/logout`,
      revocation_endpoint: `${issuer}/api/oidc/revoke`,
      userinfo_endpoint: `${issuer}/api/oidc/userinfo`,
    };
  }

  function keepDiscovery(document: Discovery): void {
    try {
      sessionStorage.setItem(discoveryKey, JSON.stringify({ document, expiresAt: Date.now() + DISCOVERY_TTL_MS }));
    } catch {
      // Not cached; asked again next time.
    }
  }

  async function endpoints(): Promise<Discovery> {
    try {
      const cached = JSON.parse(sessionStorage.getItem(discoveryKey) ?? 'null') as { document?: Discovery; expiresAt?: number } | null;
      if (cached?.document && typeof cached.expiresAt === 'number' && cached.expiresAt > Date.now()) {
        return cached.document;
      }
    } catch {
      // Fall through to asking.
    }

    try {
      const response = await doFetch(`${issuer}/.well-known/openid-configuration`);
      if (response.ok) {
        const document = (await response.json()) as Discovery;
        if (document?.['issuer'] === issuer) {
          keepDiscovery(document);
          return document;
        }
        console.warn('[anotoki auth] discovery names a different issuer; using the default endpoints');
      }
    } catch {
      // Offline, or the IAM is down: the defaults are right for this IAM.
    }

    return defaultEndpoints();
  }

  function endpoint(document: Discovery, name: string): string {
    const value = document[name];
    return typeof value === 'string' && value !== '' ? value : (defaultEndpoints()[name] as string);
  }

  // ── the ID token, and who it says is signed in ─────────────────────────────

  function checkIdToken(idToken: string, expectedNonce: string | undefined): Record<string, unknown> {
    const claims = decodeJwtPayload(idToken);
    const now = Math.floor(Date.now() / 1000);

    if (!claims) {
      throw authError('invalid_id_token', 'The sign-in answer could not be read');
    }
    if (claims['iss'] !== issuer) {
      throw authError('invalid_id_token', 'The sign-in answer came from a different issuer');
    }
    const audience = Array.isArray(claims['aud']) ? (claims['aud'] as unknown[]) : [claims['aud']];
    if (!audience.includes(clientId) || (audience.length > 1 && claims['azp'] !== clientId)) {
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

  function sessionFrom(tokens: TokenAnswer, previous: StoredSession | null, expectedNonce?: string): StoredSession {
    const user = tokens.id_token ? userFrom(checkIdToken(tokens.id_token, expectedNonce)) : (previous?.user ?? null);

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
      hint: previous === null ? hintNow() : previous.hint,
    };
  }

  // ── the token endpoint ─────────────────────────────────────────────────────

  async function tokenRequest(parameters: Record<string, string>): Promise<TokenAnswer> {
    const token_endpoint = endpoint(await endpoints(), 'token_endpoint');
    const response = await doFetch(token_endpoint, {
      method: 'POST',
      // A form body keeps this a "simple" CORS request: no preflight, one round trip.
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, ...parameters }),
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

  /** The fresh access token of a session, or null: none, or under $margin left. */
  function freshToken(current: StoredSession | null, margin = REFRESH_MARGIN_MS): string | null {
    return current?.access_token && current.access_expires_at - margin > Date.now() ? current.access_token : null;
  }

  /**
   * One refresh at a time, across every tab.
   *
   * `refusedToken` is the access token an API has just answered 401 to. It is refreshed even though it
   * looks fresh - a revoked session or a rotated key does not show on the token itself - unless another
   * tab has meanwhile got a different one, which is then the answer.
   */
  function refresh(refusedToken: string | null = null): Promise<string | null> {
    if (refreshing) {
      return refreshing;
    }

    const run = async (): Promise<string | null> => {
      // Another tab may have refreshed, or signed out, while this one waited for the lock. What it wrote
      // is newer than what this page holds.
      const stored = readSession();
      if (stored !== undefined) {
        session = stored;
      }
      const fresh = freshToken(session);
      if (fresh !== null && fresh !== refusedToken) {
        return fresh;
      }
      const current = session;
      if (!current?.refresh_token) {
        return null;
      }

      try {
        const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: current.refresh_token });
        writeSession(sessionFrom(tokens, current));
        return session?.access_token ?? null;
      } catch (error) {
        // The IAM said no: the session is over (signed out elsewhere, account disabled, access taken away).
        // Anything else - no network, a 500 - leaves the session where it is to be tried again.
        const code = (error as { code?: unknown } | null)?.code;
        if (code === 'invalid_grant' || code === 'invalid_client') {
          writeSession(null);
          for (const listener of endedListeners) {
            try {
              listener(current);
            } catch (thrown) {
              console.error('[anotoki auth] a session-ended listener threw', thrown);
            }
          }
        }
        return null;
      }
    };

    refreshing = withLock(lockName, run).finally(() => {
      refreshing = null;
    });

    return refreshing;
  }

  // ── the callback ───────────────────────────────────────────────────────────

  function isCallback(): boolean {
    const target = new URL(redirectUri, location.href);
    const params = new URLSearchParams(location.search);
    return location.origin === target.origin && location.pathname === target.pathname && params.has('state') && (params.has('code') || params.has('error'));
  }

  function takePending(state: string): PendingSignIn | null {
    const key = pendingPrefix + state;
    let pending: PendingSignIn | null = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(key) ?? 'null') as PendingSignIn | null;
      sessionStorage.removeItem(key);
    } catch {
      pending = null;
    }
    return pending && typeof pending.createdAt === 'number' && pending.createdAt > Date.now() - PENDING_TTL_MS ? pending : null;
  }

  async function finishCallback(): Promise<AnotokiInitResult> {
    const params = new URLSearchParams(location.search);
    const pending = takePending(params.get('state') ?? '');

    if (!pending) {
      return { returnTo: '/', error: authError('state_mismatch', 'That sign-in did not start here, or took too long'), silent: false };
    }

    const returnTo = safeReturnTo(pending.returnTo);
    const silent = pending.silent === true;

    if (params.has('error')) {
      return { returnTo, silent, error: authError(params.get('error') ?? 'unknown', params.get('error_description') ?? 'The sign-in did not complete') };
    }

    // RFC 9207: the answer names who sent it, so one IAM's code cannot be passed off as another's.
    if (params.has('iss') && params.get('iss') !== issuer) {
      return { returnTo, silent, error: authError('invalid_issuer', 'The sign-in answer came from a different issuer') };
    }

    try {
      const tokens = await tokenRequest({
        grant_type: 'authorization_code',
        code: params.get('code') ?? '',
        redirect_uri: redirectUri,
        code_verifier: pending.verifier,
      });
      writeSession(sessionFrom(tokens, null, pending.nonce));
      return { returnTo, silent, error: null };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      return { returnTo, silent, error: typeof code === 'string' ? (error as AnotokiAuthError) : authError('network', 'The IAM could not be reached') };
    }
  }

  // ── the public surface ─────────────────────────────────────────────────────

  async function init(): Promise<AnotokiInitResult> {
    if (isCallback()) {
      const result = await finishCallback();
      // The code and state are spent; they should not sit in the address bar, the history or a bookmark.
      history.replaceState(null, '', result.returnTo);
      return result;
    }

    if (session && freshToken(session) === null) {
      await refresh();
    }

    return { returnTo: null, error: null, silent: false };
  }

  async function login(parameters: AnotokiLoginParameters = {}): Promise<void> {
    const state = randomString(16);
    const nonce = randomString(16);
    const verifier = randomString(32);
    const challenge = base64Url(await sha256(verifier));

    try {
      const pending: PendingSignIn = {
        verifier,
        nonce,
        returnTo: safeReturnTo(parameters.returnTo ?? location.pathname + location.search + location.hash),
        createdAt: Date.now(),
      };
      if (parameters.silent) {
        pending.silent = true;
      }
      sessionStorage.setItem(pendingPrefix + state, JSON.stringify(pending));
    } catch {
      throw authError('storage_unavailable', 'This browser will not let the site remember the sign-in in progress');
    }

    const url = new URL(endpoint(await endpoints(), 'authorization_endpoint'));
    const query: Record<string, string> = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    };
    if (parameters.prompt) query['prompt'] = parameters.prompt;
    if (parameters.loginHint) query['login_hint'] = parameters.loginHint;
    if (parameters.uiLocales) query['ui_locales'] = parameters.uiLocales;
    if (parameters.maxAge !== undefined) query['max_age'] = String(parameters.maxAge);

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    navigate(url.toString());
  }

  /**
   * Signs out. By default everywhere: the IAM ends its session, which spends every refresh token issued
   * under it on every site, and the browser lands on `postLogoutRedirectUri` (or the IAM's own page). The
   * landing address is always the configured one - the IAM accepts only a registered address, byte for byte.
   * `{ local: true }` signs out of this site only and does not navigate.
   */
  async function logout(parameters: { local?: boolean } = {}): Promise<void> {
    const previous = session;
    writeSession(null);

    if (parameters.local) {
      // This site only. The refresh token is spent so it cannot be used again; the IAM session - and so
      // every other site - stays signed in.
      if (previous?.refresh_token) {
        try {
          const revocation_endpoint = endpoint(await endpoints(), 'revocation_endpoint');
          await doFetch(revocation_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: clientId, token: previous.refresh_token, token_type_hint: 'refresh_token' }),
            keepalive: true,
          });
        } catch {
          // Best effort: the token dies with its IAM session regardless.
        }
      }
      return;
    }

    const url = new URL(endpoint(await endpoints(), 'end_session_endpoint'));
    url.searchParams.set('client_id', clientId);
    if (previous?.id_token) url.searchParams.set('id_token_hint', previous.id_token);
    if (postLogoutRedirectUri) url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);

    navigate(url.toString());
  }

  async function getAccessToken(): Promise<string | null> {
    const fresh = freshToken(session);
    if (fresh !== null) {
      return fresh;
    }
    return session?.refresh_token ? refresh() : null;
  }

  /**
   * Changes the account's preferences - for every anotoki site, not just this one. Resolves to the
   * account's preferences and locale as they now stand, and puts them in user() at once, in every tab.
   * Rejects with the IAM's error code: "login_required" when nobody is signed in, "insufficient_scope",
   * "invalid_request" for a value the IAM does not take, "access_denied" when the site no longer lets the
   * person in, "network" when the IAM cannot be reached.
   */
  async function savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> {
    const sub = session?.user?.sub;
    if (!sub) {
      throw authError('login_required', 'Nobody is signed in');
    }

    // Only ever with this person's own token. Another tab may sign somebody else in while this one waits
    // for a token, and a refresh takes up what that tab stored: a token that is no longer this person's is
    // not sent, or the change would land on the other account.
    const ownToken = async (refused: string | null): Promise<string | null> => {
      const token = await (refused ? refresh(refused) : getAccessToken());
      if (session?.user?.sub !== sub) {
        throw authError('login_required', session?.user ? 'Somebody else signed in meanwhile' : 'Nobody is signed in');
      }
      return token;
    };
    const send = async (token: string): Promise<Response> => {
      try {
        return await doFetch(`${issuer}/api/oidc/preferences`, {
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
    await withLock(lockName, async () => {
      const stored = readSession();
      const current = stored === undefined ? session : stored;
      if (current?.user?.sub === sub) {
        writeSession({ ...current, user: { ...current.user, ...saved } });
      }
    });
    return saved;
  }

  async function probe(timeoutMs: number): Promise<boolean> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      const response = await doFetch(`${issuer}/.well-known/openid-configuration`, { cache: 'no-store', signal: controller?.signal });
      if (!response.ok) {
        return false;
      }
      const document = (await response.json()) as Discovery;
      if (document?.['issuer'] !== issuer) {
        return false;
      }
      keepDiscovery(document);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    init,
    login,
    register: (parameters = {}) => login({ ...parameters, prompt: 'create' }),
    logout,
    getAccessToken,
    refresh: (refused?: string | null) => refresh(refused === undefined ? (session?.access_token ?? null) : refused),
    savePreferences,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onSessionEnded(listener) {
      endedListeners.add(listener);
      return () => endedListeners.delete(listener);
    },
    isAuthenticated: () => Boolean(session?.refresh_token || freshToken(session, 0)),
    user: () => session?.user ?? null,
    hint: () => (session === null ? null : session.hint),
    setHint(value) {
      const stored = readSession();
      const current = stored === undefined ? session : stored;
      if (current && current.hint !== value) {
        writeSession({ ...current, hint: value });
      }
    },
    discovery: endpoints,
    probe,
    accountUrl: () => `${issuer}/account`,
    issuer: () => issuer,
    clientId: () => clientId,
    dispose() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
      listeners.clear();
      endedListeners.clear();
    },
  };
}
