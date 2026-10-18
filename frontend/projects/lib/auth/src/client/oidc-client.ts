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
 * This is its first part, what every page needs: the session read from storage, a fresh token, the way to the
 * IAM (PKCE) and back out, the probe of the sign-in hint. What runs only at a moment - a callback's code
 * exchanged for tokens, a refresh, a save of the account's preferences - is @anotoki/lib/auth/session, loaded
 * the first time it is needed, so a site's first load does not carry it.
 *
 * Refresh tokens rotate: each one is good once, and two tabs refreshing at the same moment would spend the same
 * token twice - so refreshes are serialised across tabs with the Web Lock anotoki-auth-refresh:{storageKey}
 * (the session part), and to one at a time in this page here.
 */

import {
  AnotokiAuthClient,
  AnotokiAuthEnvironment,
  AnotokiAuthOptions,
  AnotokiInitResult,
  AnotokiLoginParameters,
  AnotokiUser,
  ClientParts,
  StoredSession,
  authError,
  safeReturnTo,
} from '@anotoki/lib/auth/core';

const DEFAULT_SCOPE = 'openid profile email';

/** Refresh when less than this is left on the access token. */
const REFRESH_MARGIN_MS = 30_000;

/** How long a discovery document is reused before being asked for again. */
const DISCOVERY_TTL_MS = 3_600_000;

interface PendingSignIn {
  verifier: string;
  nonce: string;
  returnTo: string;
  createdAt: number;
  silent?: boolean;
}

type Discovery = Record<string, unknown>;

type SessionParts = typeof import('@anotoki/lib/auth/session');

/** How the later part is loaded: import(). Internal - the specs make it fail, as a network gone would. */
export const laterParts = { load: (): Promise<SessionParts> => import('@anotoki/lib/auth/session') };

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
  let later: Promise<SessionParts> | null = null;

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

  // ── the parts loaded later ─────────────────────────────────────────────────

  /** The session part, loaded once - again after a load that failed (the network came back). */
  function sessionParts(): Promise<SessionParts> {
    later ??= laterParts.load().catch((error: unknown) => {
      later = null;
      throw error;
    });
    return later;
  }

  /** The fresh access token of a session, or null: none, or under $margin left. */
  function freshToken(current: StoredSession | null, margin = REFRESH_MARGIN_MS): string | null {
    return current?.access_token && current.access_expires_at - margin > Date.now() ? current.access_token : null;
  }

  /** One refresh at a time in this page; the session part takes it to one at a time across every tab. */
  function refresh(refusedToken: string | null = null): Promise<string | null> {
    refreshing ??= sessionParts()
      .then((later) => later.refresh(parts, refusedToken))
      .catch((error: unknown) => {
        // Its part did not load (the network went): the session stays where it is, to be tried again.
        console.error('[anotoki auth] the refresh could not run', error);
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function getAccessToken(): Promise<string | null> {
    const fresh = freshToken(session);
    if (fresh !== null) {
      return fresh;
    }
    return session?.refresh_token ? refresh() : null;
  }

  /** What the session part is given of this client. */
  const parts: ClientParts = {
    issuer,
    clientId,
    redirectUri,
    lockName,
    pendingPrefix,
    fetch: doFetch,
    hintNow,
    endpoints,
    endpoint,
    readSession,
    writeSession,
    session: () => session,
    adoptSession: (next) => {
      session = next;
    },
    sessionEnded: (ended) => {
      for (const listener of endedListeners) {
        try {
          listener(ended);
        } catch (thrown) {
          console.error('[anotoki auth] a session-ended listener threw', thrown);
        }
      }
    },
    freshToken: (current) => freshToken(current),
    getAccessToken,
    refresh: (refused) => refresh(refused),
  };

  // ── the callback ───────────────────────────────────────────────────────────

  function isCallback(): boolean {
    const target = new URL(redirectUri, location.href);
    const params = new URLSearchParams(location.search);
    return location.origin === target.origin && location.pathname === target.pathname && params.has('state') && (params.has('code') || params.has('error'));
  }

  /**
   * The sign-in this callback finishes, read and left in place (its own part takes it): whether it was the hint's
   * silent hop, and where it was to go back to. Null where there is none to read.
   */
  function pendingOf(state: string): PendingSignIn | null {
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingPrefix + state) ?? 'null') as PendingSignIn | null;
      return pending && typeof pending === 'object' ? pending : null;
    } catch {
      return null;
    }
  }

  // ── the public surface ─────────────────────────────────────────────────────

  async function init(): Promise<AnotokiInitResult> {
    if (isCallback()) {
      let result: AnotokiInitResult;
      try {
        result = await (await sessionParts()).finishCallback(parts);
      } catch {
        // The part that finishes it did not load. The hint's silent hop stays silent - a visitor is never shown
        // a failure of a sign-in they did not ask for - and either goes back where it came from.
        const pending = pendingOf(new URLSearchParams(location.search).get('state') ?? '');
        result = {
          returnTo: safeReturnTo(pending?.returnTo),
          error: authError('network', 'The sign-in could not be finished: a part of the page did not load'),
          silent: pending?.silent === true,
        };
      }
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
          const revocationEndpoint = endpoint(await endpoints(), 'revocation_endpoint');
          await doFetch(revocationEndpoint, {
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
    async savePreferences(changes) {
      let later: SessionParts;
      try {
        later = await sessionParts();
      } catch {
        throw authError('network', 'The IAM could not be reached');
      }
      return later.savePreferences(parts, changes);
    },
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
