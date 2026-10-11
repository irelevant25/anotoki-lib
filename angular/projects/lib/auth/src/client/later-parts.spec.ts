import { AnotokiAuthClient, StoredSession } from '@anotoki/lib/auth/core';
import { createAuthClient, laterParts } from './oidc-client';

const ISSUER = 'https://iam.test';

/**
 * What the client does when its later part - a callback's code exchange, a refresh, a preferences save - cannot be
 * loaded: never more than it would with the IAM out of reach. The session stays to be tried again, a save is
 * refused as "network", a callback says it could not finish.
 */
describe('createAuthClient: a later part that does not load', () => {
  let client: AnotokiAuthClient | null = null;

  function stale(): StoredSession {
    return {
      access_token: 'old',
      access_expires_at: Date.now() - 1000,
      refresh_token: 'rt',
      id_token: 'id',
      user: { sub: '7', preferred_username: 'mira', email: null, email_verified: false, locale: null, roles: [], preferences: null },
      updated_at: Date.now(),
      hint: null,
    };
  }

  const load = laterParts.load;

  beforeEach(() => {
    // The client's later part (@anotoki/lib/auth/session) does not load: the network went between the first load
    // and the moment it was needed.
    laterParts.load = () => Promise.reject(new Error('offline'));
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    laterParts.load = load;
    client?.dispose();
    client = null;
    vi.restoreAllMocks();
    history.replaceState(null, '', '/');
  });

  it('a refresh: no token, and the session stays for the next try', async () => {
    localStorage.setItem('anotoki-auth:site', JSON.stringify(stale()));
    client = createAuthClient({ issuer: ISSUER, clientId: 'site', redirectUri: `${location.origin}/auth/callback` }, { fetch: vi.fn() });

    expect(await client.getAccessToken()).toBeNull();
    expect(client.isAuthenticated()).toBe(true);
    expect(JSON.parse(localStorage.getItem('anotoki-auth:site') ?? 'null')?.refresh_token).toBe('rt');
  });

  it('a preferences save: refused as "network"', async () => {
    localStorage.setItem('anotoki-auth:site', JSON.stringify({ ...stale(), access_token: 'fresh', access_expires_at: Date.now() + 600_000 }));
    client = createAuthClient({ issuer: ISSUER, clientId: 'site', redirectUri: `${location.origin}/auth/callback` }, { fetch: vi.fn() });

    await expect(client.savePreferences({ theme: 'dark' })).rejects.toMatchObject({ code: 'network' });
  });

  it('a callback: it says it could not finish, and leaves the address clean', async () => {
    history.replaceState(null, '', '/auth/callback?code=c&state=s');
    client = createAuthClient({ issuer: ISSUER, clientId: 'site', redirectUri: `${location.origin}/auth/callback` }, { fetch: vi.fn() });

    const result = await client.init();

    expect(result.error?.code).toBe('network');
    expect(location.pathname + location.search).toBe('/');
  });
});
