import { createAuthClient, decodeJwtPayload, preferencesFrom, safeReturnTo } from './oidc-client';
import { AnotokiAuthClient, StoredSession } from './types';

const ISSUER = 'https://iam.test';
const CLIENT = 'japanese-academy';
const REDIRECT = `${location.origin}/auth/callback`;

/** A JWT as the client reads it: claims in base64url, a signature nobody checks here (the server checks the access token's). */
function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown): string =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${part({ alg: 'RS256', typ: 'JWT', kid: 'k' })}.${part(claims)}.c2ln`;
}

function idToken(claims: Record<string, unknown> = {}): string {
  return jwt({ iss: ISSUER, aud: CLIENT, sub: '7', exp: Math.floor(Date.now() / 1000) + 3600, preferred_username: 'alice', roles: ['MEMBER', 'EDITOR'], locale: 'sk', ...claims });
}

interface Call {
  url: string;
  init?: RequestInit;
}

/** The IAM, answering through the client's fetch: discovery, the token endpoint, revoke, preferences. */
class FakeIam {
  readonly calls: Call[] = [];
  /** The nonce of the sign-in under way: the ID token names it. */
  nonce: string | null = null;
  token: (form: URLSearchParams) => { status: number; body: unknown } = () => ({
    status: 200,
    body: { access_token: 'access-1', expires_in: 600, refresh_token: 'refresh-1', id_token: idToken({ nonce: this.nonce }) },
  });
  discovery: () => { status: number; body: unknown } = () => ({
    status: 200,
    body: {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/api/oidc/authorize`,
      token_endpoint: `${ISSUER}/api/oidc/token`,
      end_session_endpoint: `${ISSUER}/api/oidc/logout`,
      revocation_endpoint: `${ISSUER}/api/oidc/revoke`,
      ui_locales_supported: ['en', 'sk'],
    },
  });
  preferences: (body: unknown) => { status: number; body: unknown } = (body) => ({
    status: 200,
    body: { locale: 'sk', preferences: { theme: (body as { theme?: string }).theme ?? 'auto', date_format: null, time_format: '24' } },
  });

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    this.calls.push({ url, init });
    const answer =
      url === `${ISSUER}/.well-known/openid-configuration`
        ? this.discovery()
        : url === `${ISSUER}/api/oidc/token`
          ? this.token(new URLSearchParams(String(init?.body)))
          : url === `${ISSUER}/api/oidc/preferences`
            ? this.preferences(JSON.parse(String(init?.body)))
            : { status: 200, body: {} };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
  };

  forms(path: string): URLSearchParams[] {
    return this.calls.filter((call) => call.url === ISSUER + path).map((call) => new URLSearchParams(String(call.init?.body)));
  }
}

describe('the client: the IAM SDK 1.2.0, ported - its storage, its checks, its refresh', () => {
  let iam: FakeIam;
  let navigations: string[];
  let hint: string | null;
  let client: AnotokiAuthClient;

  function make(): AnotokiAuthClient {
    client = createAuthClient(
      { issuer: ISSUER + '/', clientId: CLIENT, redirectUri: REDIRECT, postLogoutRedirectUri: `${location.origin}/` },
      { fetch: iam.fetch, navigate: (url) => navigations.push(url), hintNow: () => hint },
    );
    return client;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/kanji/12?mode=review#top');
    iam = new FakeIam();
    navigations = [];
    hint = 'hhhhhhhhhhhhhhhhhhhhhh';
  });

  afterEach(() => client?.dispose());

  /** Starts a sign-in, then lands its callback with the IAM's answer: what a browser round trip does. */
  async function roundTrip(answer: Record<string, string> = {}, parameters: Parameters<AnotokiAuthClient['login']>[0] = {}) {
    await make().login(parameters);
    const authorize = new URL(navigations[navigations.length - 1]);
    const state = authorize.searchParams.get('state') ?? '';
    iam.nonce = authorize.searchParams.get('nonce');
    history.replaceState(null, '', `/auth/callback?${new URLSearchParams({ code: 'the-code', state, iss: ISSUER, ...answer })}`);
    return { authorize, state, result: await make().init() };
  }

  it("keeps the tokens under the SDK's key, the sign-in in progress under its key, discovery under its key", async () => {
    const { authorize, state, result } = await roundTrip();

    expect(Object.keys(sessionStorage)).toEqual([`anotoki-auth:discovery:${ISSUER}`]);
    expect(Object.keys(localStorage)).toEqual([`anotoki-auth:${CLIENT}`]);
    expect(authorize.searchParams.get('state')).toBe(state);
    expect(result).toEqual({ returnTo: '/kanji/12?mode=review#top', error: null, silent: false });
    expect(location.pathname + location.search + location.hash).toBe('/kanji/12?mode=review#top');

    const stored = JSON.parse(localStorage.getItem(`anotoki-auth:${CLIENT}`) ?? 'null') as StoredSession;
    expect(stored.access_token).toBe('access-1');
    expect(stored.refresh_token).toBe('refresh-1');
    expect(stored.hint).toBe('hhhhhhhhhhhhhhhhhhhhhh');
    expect(stored.user).toEqual({ sub: '7', preferred_username: 'alice', email: null, email_verified: false, locale: 'sk', roles: ['MEMBER', 'EDITOR'], preferences: null });
  });

  it('starts a sign-in with PKCE S256, a state and a nonce, and keeps them under {storageKey}:login:{state}', async () => {
    await make().login({ uiLocales: 'sk en', prompt: 'none', silent: true, maxAge: 0, loginHint: 'a@b.c' });

    const url = new URL(navigations[0]);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/api/oidc/authorize`);
    const query = Object.fromEntries(url.searchParams);
    expect(query).toMatchObject({
      response_type: 'code',
      client_id: CLIENT,
      redirect_uri: REDIRECT,
      scope: 'openid profile email',
      code_challenge_method: 'S256',
      prompt: 'none',
      ui_locales: 'sk en',
      max_age: '0',
      login_hint: 'a@b.c',
    });
    const pending = JSON.parse(sessionStorage.getItem(`anotoki-auth:${CLIENT}:login:${query['state']}`) ?? 'null');
    expect(pending).toMatchObject({ nonce: query['nonce'], returnTo: '/kanji/12?mode=review#top', silent: true });
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pending.verifier)));
    expect(
      btoa(String.fromCharCode(...digest))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''),
    ).toBe(query['code_challenge']);
  });

  it('reads a session the SDK 1.2.0 kept - nobody is signed out by the move - and one from before preferences', () => {
    localStorage.setItem(
      `anotoki-auth:${CLIENT}`,
      JSON.stringify({
        access_token: 'sdk-access',
        access_expires_at: Date.now() + 300_000,
        refresh_token: 'sdk-refresh',
        id_token: idToken(),
        user: { sub: '7', preferred_username: 'alice', email: null, email_verified: true, locale: 'en', roles: ['MEMBER'] },
        updated_at: Date.now(),
      }),
    );
    make();
    expect(client.isAuthenticated()).toBe(true);
    expect(client.user()?.sub).toBe('7');
    expect(client.user()?.preferences).toBeNull();
    expect(client.hint()).toBeUndefined();
  });

  it('a silent sign-in comes back saying it was silent, its error too', async () => {
    const { result } = await roundTrip({ error: 'login_required' }, { prompt: 'none', silent: true });
    expect(result.silent).toBe(true);
    expect(result.error?.code).toBe('login_required');
    expect(client.isAuthenticated()).toBe(false);
  });

  it.each([
    ['another issuer in the ID token', { iss: 'https://evil.test' }],
    ['another site in the ID token', { aud: 'genshin' }],
    ['two audiences, azp another', { aud: [CLIENT, 'genshin'], azp: 'genshin' }],
    ['expired past ten minutes', { exp: Math.floor(Date.now() / 1000) - 601 }],
    ["another sign-in's nonce", { nonce: 'not-ours' }],
  ])('refuses the answer: %s', async (_case, claims) => {
    await make().login();
    const state = new URL(navigations[0]).searchParams.get('state') ?? '';
    const nonce = new URL(navigations[0]).searchParams.get('nonce');
    iam.token = () => ({ status: 200, body: { access_token: 'a', expires_in: 600, refresh_token: 'r', id_token: idToken({ nonce, ...claims }) } });
    history.replaceState(null, '', `/auth/callback?code=c&state=${state}`);
    const result = await make().init();
    expect(result.error?.code).toBe('invalid_id_token');
    expect(localStorage.getItem(`anotoki-auth:${CLIENT}`)).toBeNull();
  });

  it("takes an ID token expired within ten minutes: a phone's clock", async () => {
    await make().login();
    const query = new URL(navigations[0]).searchParams;
    iam.token = () => ({ status: 200, body: { access_token: 'a', expires_in: 600, refresh_token: 'r', id_token: idToken({ nonce: query.get('nonce'), exp: Math.floor(Date.now() / 1000) - 500 }) } });
    history.replaceState(null, '', `/auth/callback?code=c&state=${query.get('state')}`);
    expect((await make().init()).error).toBeNull();
  });

  it('a callback from another IAM (RFC 9207), one that did not start here, one twice', async () => {
    const { result } = await roundTrip({ iss: 'https://evil.test' });
    expect(result.error?.code).toBe('invalid_issuer');

    history.replaceState(null, '', '/auth/callback?code=c&state=nobody-started-this');
    expect((await make().init()).error?.code).toBe('state_mismatch');
    expect(location.pathname).toBe('/');
  });

  it('refreshes one at a time, rotates, and a refusal ends the session - telling who listens, with its hint', async () => {
    await roundTrip();
    let n = 1;
    iam.token = (form) =>
      form.get('grant_type') === 'refresh_token' ? { status: 200, body: { access_token: `access-${++n}`, expires_in: 600, refresh_token: `refresh-${n}` } } : { status: 400, body: {} };
    const ended: StoredSession[] = [];
    client.onSessionEnded((session) => ended.push(session));

    const [one, two] = await Promise.all([client.refresh(), client.refresh()]);
    expect([one, two]).toEqual(['access-2', 'access-2']);
    expect(
      iam
        .forms('/api/oidc/token')
        .filter((form) => form.get('grant_type') === 'refresh_token')
        .map((form) => form.get('refresh_token')),
    ).toEqual(['refresh-1']);
    expect(client.user()?.sub).toBe('7');

    iam.token = () => ({ status: 503, body: { error: 'temporarily_unavailable' } });
    expect(await client.refresh()).toBeNull();
    expect(client.isAuthenticated()).toBe(true);
    expect(ended).toEqual([]);

    iam.token = () => ({ status: 400, body: { error: 'invalid_grant' } });
    expect(await client.refresh()).toBeNull();
    expect(client.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(`anotoki-auth:${CLIENT}`)).toBeNull();
    expect(ended.map((session) => [session.refresh_token, session.hint])).toEqual([['refresh-2', 'hhhhhhhhhhhhhhhhhhhhhh']]);
  });

  it('a refused token is refreshed though it looks fresh, unless another tab holds a different one', async () => {
    await roundTrip();
    iam.token = () => ({ status: 200, body: { access_token: 'access-2', expires_in: 600, refresh_token: 'refresh-2' } });
    expect(await client.refresh('an-older-token')).toBe('access-1');
    expect(await client.refresh('access-1')).toBe('access-2');
    expect(client.hint()).toBe('hhhhhhhhhhhhhhhhhhhhhh');
    client.setHint(null);
    expect(JSON.parse(localStorage.getItem(`anotoki-auth:${CLIENT}`) ?? '{}').hint).toBeNull();
  });

  it("saves preferences with the person's own token, and user() follows", async () => {
    await roundTrip();
    const changes: unknown[] = [];
    client.onChange(() => changes.push(client.user()?.preferences));

    expect(await client.savePreferences({ theme: 'dark' })).toEqual({ locale: 'sk', preferences: { theme: 'dark', date_format: null, time_format: '24' } });
    const call = iam.calls.find((each) => each.url === `${ISSUER}/api/oidc/preferences`);
    expect(new Headers(call?.init?.headers).get('Authorization')).toBe('Bearer access-1');
    expect(client.user()?.preferences?.theme).toBe('dark');
    expect(changes).toHaveLength(1);

    iam.preferences = () => ({ status: 400, body: { error: 'invalid_request' } });
    await expect(client.savePreferences({ language: 'xx' })).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it("signs out everywhere through the IAM's logout, or here only - spending the refresh token", async () => {
    await roundTrip();
    await client.logout({ local: true });
    expect(iam.forms('/api/oidc/revoke').map((form) => [form.get('token'), form.get('token_type_hint')])).toEqual([['refresh-1', 'refresh_token']]);
    expect(navigations).toHaveLength(1);

    await roundTrip();
    await client.logout();
    const url = new URL(navigations[navigations.length - 1]);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/api/oidc/logout`);
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(`${location.origin}/`);
    expect(url.searchParams.get('id_token_hint')).toBeTruthy();
  });

  it('probes the IAM afresh, and only its own discovery counts', async () => {
    make();
    expect(await client.probe(1500)).toBe(true);
    expect(iam.calls[0].init?.cache).toBe('no-store');
    iam.discovery = () => ({ status: 200, body: { issuer: 'https://elsewhere.test' } });
    expect(await client.probe(1500)).toBe(false);
    iam.discovery = () => ({ status: 503, body: {} });
    expect(await client.probe(1500)).toBe(false);
  });

  it('the issuer, the account page, and a client that cannot be made', () => {
    make();
    expect([client.issuer(), client.clientId(), client.accountUrl()]).toEqual([ISSUER, CLIENT, `${ISSUER}/account`]);
    expect(() => createAuthClient({ issuer: '', clientId: CLIENT, redirectUri: REDIRECT })).toThrow();
  });
});

describe('safeReturnTo: only a path on this site', () => {
  it.each([
    ['/kanji/12?x=1#a', '/kanji/12?x=1#a'],
    ['//evil.test/x', '/'],
    ['/\\evil.test', '/'],
    ['/\t/evil.test', '/'],
    ['https://evil.test/', '/'],
    ['javascript:alert(1)', '/'],
    ['/.//evil.test', '/'],
    ['', '/'],
    [42, '/'],
  ])('%s -> %s', (given, expected) => {
    expect(safeReturnTo(given)).toBe(expected);
  });
});

describe('the claims', () => {
  it('reads a payload, and nothing that is none', () => {
    expect(decodeJwtPayload(jwt({ sub: 'ž' }))).toEqual({ sub: 'ž' });
    expect(decodeJwtPayload('no')).toBeNull();
    expect(decodeJwtPayload('a.!!!.c')).toBeNull();
  });

  it('reads the preferences, a value it does not know as the default', () => {
    expect(preferencesFrom({ theme: 'dark', date_format: 'ymd_dash', time_format: '12' })).toEqual({ theme: 'dark', date_format: 'ymd_dash', time_format: '12' });
    expect(preferencesFrom({ theme: 'sepia', date_format: 'x', time_format: 24 })).toEqual({ theme: 'auto', date_format: null, time_format: null });
    expect(preferencesFrom(null)).toBeNull();
  });
});
