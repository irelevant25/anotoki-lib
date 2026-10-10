import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideAnotokiMigrations, SiteStatus } from '@anotoki/lib/migrations';
import { AnotokiAuth } from './auth.service';
import { authError } from './client/oidc-client';
import { AnotokiAuthConfig } from './config';
import { HINT_BREAKER_MS, HINT_FAILED_WAIT_MS, markerKey, readMarker } from './hint';
import { CLIENT_ID, HINT_A, HINT_B, SpecSite, provideSpecAuth, settled, specSite, user } from './testing';

describe('AnotokiAuth: the boot, the session, and the sign-in hint', () => {
  let site: SpecSite;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/quiz/7?round=2');
    site = specSite();
  });

  function start(config: Partial<AnotokiAuthConfig> = {}): AnotokiAuth {
    TestBed.configureTestingModule({ providers: provideSpecAuth(site, config) });
    return TestBed.inject(AnotokiAuth);
  }

  const hops = (): unknown[] => site.client?.logins.filter((login) => login.prompt === 'none') ?? [];
  const marker = () => readMarker(localStorage, CLIENT_ID);

  describe('the boot', () => {
    it('reads the boot configuration, and fails closed on login_required', async () => {
      for (const [given, required] of [
        [true, true],
        [false, false],
        [undefined, true],
        ['false', true],
      ] as const) {
        TestBed.resetTestingModule();
        site = specSite({ login_required: given as boolean | undefined });
        const auth = start();
        await auth.init();
        expect(auth.loginRequired()).toBe(required);
        expect(auth.state()).toBe(required ? 'signed-out' : 'visitor');
      }
    });

    it("reads a site's camelCase answer from before the library too", async () => {
      site.boot = { issuer: 'https://iam.test', clientId: 'survey', loginRequired: false } as never;
      const auth = start();
      await auth.init();
      expect(site.client?.options).toEqual({
        issuer: 'https://iam.test',
        clientId: 'survey',
        redirectUri: location.origin + '/auth/callback',
        postLogoutRedirectUri: location.origin + '/',
      });
      expect(auth.loginRequired()).toBe(false);
      expect(auth.signInAvailable()).toBe(true);
    });

    it('is unavailable without a boot configuration, or one that names no IAM', async () => {
      site.boot = null;
      const auth = start();
      await auth.init();
      expect(auth.state()).toBe('unavailable');
      expect(auth.caller()).toBe('nobody');
      expect(await auth.signIn()).toBe(false);
    });

    it('reads the boot configuration from its URL, with no token', async () => {
      TestBed.configureTestingModule({ providers: provideSpecAuth(site, { config: '/api/auth/config' }) });
      const auth = TestBed.inject(AnotokiAuth);
      const http = TestBed.inject(HttpTestingController);
      const done = auth.init();
      const request = http.expectOne('/api/auth/config');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ issuer: 'https://iam.test', client_id: 'test-site', login_required: true, sign_in_available: false });
      await done;
      expect(auth.state()).toBe('signed-out');
      expect(auth.signInAvailable()).toBe(false);
      http.verify();
    });

    it('a failed sign-in is said by its code, never the sentence, and only once a page load', async () => {
      site.prepare = (client) => (client.initResult = { returnTo: '/quiz/7', error: authError('access_denied', 'The IAM says <b>no</b>'), silent: false });
      const auth = start();
      await auth.init();
      expect(auth.signInFailure()).toEqual({ code: 'access_denied', returnTo: '/quiz/7' });
      auth.dismissFailure();
      expect(auth.signInFailure()).toBeNull();
    });
  });

  describe('the hint: one silent hop for a person signed in at the IAM', () => {
    it('hops once, top-level, for a visitor with the cookie - the marker written first', async () => {
      site.browser.cookies = `other=1; anotoki_signed_in=${HINT_A}; theme=dark`;
      const auth = start({ language: () => 'sk' });

      expect(await settled(auth.init())).toBe(false);
      expect(hops()).toEqual([{ prompt: 'none', returnTo: '/quiz/7?round=2', silent: true, uiLocales: 'sk' }]);
      expect(marker()).toEqual({ value: HINT_A, at: site.browser.clock });
      expect(site.client?.probes).toBe(1);
    });

    it('never hops without the cookie: a visitor without an account, a crawler, are sent nowhere', async () => {
      const auth = start();
      await auth.init();
      expect(auth.state()).toBe('visitor');
      expect(hops()).toEqual([]);
      expect(site.client?.probes).toBe(0);
      expect(localStorage.getItem(markerKey(CLIENT_ID))).toBeNull();
    });

    it.each([
      ["a cookie not in the hint's shape", (s: SpecSite) => (s.browser.cookies = 'anotoki_signed_in=short')],
      ['a cookie of another name', (s: SpecSite) => (s.browser.cookies = `anotoki_signed_inx=${HINT_A}`)],
      ['in a frame', (s: SpecSite) => (s.browser.framed = true)],
      ['while prerendering', (s: SpecSite) => (s.browser.prerender = true)],
      ['on the callback route', () => history.replaceState(null, '', '/auth/callback')],
      ['a site the IAM does not know', (s: SpecSite) => (s.boot = { ...s.boot!, sign_in_available: false })],
      ['a site that requires signing in', (s: SpecSite) => (s.boot = { ...s.boot!, login_required: true })],
      ['somebody signed in here already', (s: SpecSite) => (s.prepare = (client) => client.hold(user('7'), HINT_A))],
    ])('never hops %s', async (_case, arrange) => {
      site.browser.cookies = site.browser.cookies || `anotoki_signed_in=${HINT_A}`;
      arrange(site);
      if (!site.browser.cookies.includes('anotoki_signed_in')) {
        site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      }
      const auth = start();
      expect(await settled(auth.init())).toBe(true);
      expect(hops()).toEqual([]);
    });

    it('never hops with the hint switched off, or under another name only when the site says so', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      const off = start({ hint: false });
      expect(await settled(off.init())).toBe(true);
      expect(hops()).toEqual([]);

      TestBed.resetTestingModule();
      site = specSite();
      site.browser.cookies = `iam_hint=${HINT_A}`;
      const renamed = start({ hint: { cookieName: 'iam_hint' } });
      expect(await settled(renamed.init())).toBe(false);
      expect(hops()).toHaveLength(1);
    });

    it('never hops while the site is blocked (an update waiting): its status page stands', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      TestBed.configureTestingModule({
        providers: [
          ...provideSpecAuth(site),
          provideAnotokiMigrations(() => ({
            statusUrl: '/api/site-status',
            apiBase: '/api/admin/migrations',
            migrationsRoute: '/admin/migrations',
            isAdmin: () => false,
            isSignedIn: () => false,
            signIn: () => undefined,
            language: () => 'en',
          })),
        ],
      });
      TestBed.inject(SiteStatus).report('update_pending');
      expect(await settled(TestBed.inject(AnotokiAuth).init())).toBe(true);
      expect(hops()).toEqual([]);
    });

    it('tries each hint value once: the same value again never hops', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      localStorage.setItem(markerKey(CLIENT_ID), JSON.stringify({ value: HINT_A, at: site.browser.clock - 3_600_000 }));
      const auth = start();
      expect(await settled(auth.init())).toBe(true);
      expect(hops()).toEqual([]);
      expect(auth.state()).toBe('visitor');
    });

    it('at most one try a minute, whatever the value (the breaker)', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_B}`;
      localStorage.setItem(markerKey(CLIENT_ID), JSON.stringify({ value: HINT_A, at: site.browser.clock - HINT_BREAKER_MS + 1000 }));
      expect(await settled(start().init())).toBe(true);
      expect(hops()).toEqual([]);

      TestBed.resetTestingModule();
      const before = site.browser;
      site = specSite();
      site.browser.cookies = before.cookies;
      site.browser.clock = before.clock + 1000;
      expect(await settled(start().init())).toBe(false);
      expect(hops()).toHaveLength(1);
    });

    it('makes no hop when the IAM does not answer, and waits ten minutes after that', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      site.prepare = (client) => (client.probeAnswer = false);
      expect(await settled(start().init())).toBe(true);
      expect(hops()).toEqual([]);
      expect(marker()).toEqual({ value: HINT_A, at: site.browser.clock, failed: true });

      for (const [later, hop] of [
        [HINT_FAILED_WAIT_MS - 1000, false],
        [HINT_FAILED_WAIT_MS, true],
      ] as const) {
        TestBed.resetTestingModule();
        const clock = site.browser.clock;
        site = specSite();
        site.browser.cookies = `anotoki_signed_in=${HINT_B}`;
        site.browser.clock = clock + later;
        localStorage.setItem(markerKey(CLIENT_ID), JSON.stringify({ value: HINT_A, at: clock, failed: true }));
        expect(await settled(start().init())).toBe(!hop);
        expect(hops()).toHaveLength(hop ? 1 : 0);
      }
    });

    it('makes no hop when storage cannot keep the marker - ever', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });
      try {
        expect(await settled(start().init())).toBe(true);
        expect(hops()).toEqual([]);
        expect(site.client?.probes).toBe(0);
      } finally {
        setItem.mockRestore();
      }
    });

    it('a silent try that came back without a sign-in says nothing, and does not try again', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      localStorage.setItem(markerKey(CLIENT_ID), JSON.stringify({ value: HINT_A, at: site.browser.clock - 5000 }));
      for (const code of ['login_required', 'interaction_required', 'consent_required', 'account_selection_required', 'access_denied', 'server_error']) {
        TestBed.resetTestingModule();
        const cookies = site.browser.cookies;
        site = specSite();
        site.browser.cookies = cookies;
        site.prepare = (client) => (client.initResult = { returnTo: '/quiz/7', error: authError(code, 'no'), silent: true });
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const auth = start();
        expect(await settled(auth.init())).toBe(true);
        expect(auth.signInFailure()).toBeNull();
        expect(auth.state()).toBe('visitor');
        expect(hops()).toEqual([]);
        expect(info).toHaveBeenCalled();
        info.mockRestore();
      }
    });

    it('an explicit sign-in refused just now: its failure is said, and the hint is not tried with it', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      site.prepare = (client) => (client.initResult = { returnTo: '/quiz/7', error: authError('access_denied', 'no'), silent: false });
      const auth = start();
      expect(await settled(auth.init())).toBe(true);
      expect(auth.signInFailure()?.code).toBe('access_denied');
      expect(hops()).toEqual([]);
      expect(marker()?.value).toBe(HINT_A);
    });

    it('signing out marks the hint tried - everywhere and here only', async () => {
      for (const local of [false, true]) {
        TestBed.resetTestingModule();
        localStorage.clear();
        site = specSite();
        site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
        site.prepare = (client) => client.hold(user('7'), HINT_A);
        const auth = start();
        await auth.init();
        expect(auth.state()).toBe('signed-in');

        expect(await auth.signOut({ local })).toBe(true);
        expect(site.client?.logouts).toEqual([{ local }]);
        expect(marker()).toEqual({ value: HINT_A, at: site.browser.clock });
        expect(auth.signedIn()).toBe(false);
      }
    });

    it('a refresh refused under the hint the session was made with marks that value tried', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      site.prepare = (client) => {
        client.hold(user('7'), HINT_A);
        client.refreshAnswer = 'refused';
      };
      const auth = start();
      await auth.init();
      expect(await auth.refresh()).toBeNull();
      expect(marker()?.value).toBe(HINT_A);
    });
  });

  describe('following the IAM', () => {
    it('the same hint: nothing asked', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_A}`;
      site.prepare = (client) => client.hold(user('7'), HINT_A);
      const auth = start();
      await auth.init();
      expect(site.client?.refreshes).toBe(0);
      expect(auth.state()).toBe('signed-in');
    });

    it('signed out at the IAM (the hint gone): signed out here at this page load', async () => {
      site.boot = { ...site.boot!, login_required: true };
      site.prepare = (client) => {
        client.hold(user('7'), HINT_A);
        client.refreshAnswer = 'refused';
      };
      const auth = start();
      await auth.init();
      expect(site.client?.refreshes).toBe(1);
      expect(auth.state()).toBe('signed-out');
      expect(site.browser.reloads).toBe(0);
    });

    it('somebody else signed in at the IAM (another hint): signed out here, then the hop signs the new one in', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_B}`;
      site.prepare = (client) => {
        client.hold(user('7'), HINT_A);
        client.refreshAnswer = 'refused';
      };
      const auth = start();
      expect(await settled(auth.init())).toBe(false);
      expect(hops()).toHaveLength(1);
      expect(marker()?.value).toBe(HINT_B);
    });

    it('a session that still holds keeps the page, and takes the new hint as its own', async () => {
      site.browser.cookies = `anotoki_signed_in=${HINT_B}`;
      site.prepare = (client) => client.hold(user('7'), HINT_A);
      const auth = start();
      await auth.init();
      expect(auth.state()).toBe('signed-in');
      expect(site.client?.hint()).toBe(HINT_B);
      expect(hops()).toEqual([]);
    });

    it('a session from before the library (no hint of its own) is asked once', async () => {
      site.prepare = (client) => client.hold(user('7'));
      const auth = start();
      await auth.init();
      expect(site.client?.refreshes).toBe(1);
      expect(site.client?.hint()).toBeNull();
      expect(auth.state()).toBe('signed-in');
    });

    it('an IAM that does not answer keeps the session, and the page is not held up for ever', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        site.prepare = (client) => {
          client.hold(user('7'), HINT_A);
          client.refreshAnswer = 'never';
        };
        const auth = start();
        const done = auth.init();
        await vi.advanceTimersByTimeAsync(5_000);
        await done;
        expect(auth.state()).toBe('signed-in');
        expect(site.client?.hint()).toBe(HINT_A);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("a page is one person's", () => {
    it("somebody else signing in in another tab loads the page afresh; tokens are only the page's person's", async () => {
      site.prepare = (client) => client.hold(user('7'), null);
      const auth = start();
      await auth.init();
      expect(await auth.token()).toBe('token-1');

      site.client!.change(user('8'));
      expect(site.browser.reloads).toBe(1);
      expect(await auth.token()).toBeNull();
    });

    it('a page shown to a visitor loads afresh when anybody signs in, in another tab', async () => {
      const auth = start();
      await auth.init();
      expect(auth.state()).toBe('visitor');
      site.client!.change(user('7'));
      expect(site.browser.reloads).toBe(1);
    });

    it("signed out in another tab: the page of a person never turns into a visitor's", async () => {
      site.prepare = (client) => client.hold(user('7'), null);
      const auth = start();
      await auth.init();
      site.client!.change(null);
      expect(auth.state()).toBe('signed-out');
      expect(auth.caller()).toBe('person');
    });

    it('roles from the ID token, in capitals; MEMBER is nobody special', async () => {
      site.prepare = (client) => client.hold(user('7', ['member', 'editor'], { preferred_username: null }), null);
      const auth = start();
      await auth.init();
      expect(auth.roles()).toEqual(['MEMBER', 'EDITOR']);
      expect(auth.isStaff()).toBe(true);
      expect(auth.isAdmin()).toBe(false);
      expect(auth.displayName()).toBe('user7@example.test');
      expect(auth.sub()).toBe('7');
    });

    it("a visitor's request refused with sign_in_required: nobody visits from now on", async () => {
      const auth = start();
      await auth.init();
      auth.noteSignInRequired();
      expect(auth.loginRequired()).toBe(true);
      expect(auth.state()).toBe('signed-out');
    });
  });

  describe('signing in', () => {
    it('waits for the site, and goes with the language and where it started', async () => {
      let allow = false;
      const auth = start({ beforeSignIn: () => allow, language: () => ' sk ' });
      await auth.init();

      expect(await auth.signIn()).toBe(false);
      expect(site.client?.logins).toEqual([]);
      allow = true;
      expect(await auth.signIn({ prompt: 'login', maxAge: 600 })).toBe(true);
      expect(await auth.register({ returnTo: '/x' })).toBe(true);
      expect(site.client?.logins).toEqual([
        { returnTo: '/quiz/7?round=2', prompt: 'login', maxAge: 600, uiLocales: 'sk' },
        { returnTo: '/x', prompt: 'create', uiLocales: 'sk' },
      ]);
    });

    it('a sign-in that cannot start says why', async () => {
      const auth = start();
      await auth.init();
      vi.spyOn(site.client!, 'login').mockRejectedValue(authError('storage_unavailable', 'no'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(await auth.signIn({ returnTo: '/a' })).toBe(false);
      expect(auth.signInFailure()).toEqual({ code: 'storage_unavailable', returnTo: '/a' });
      vi.restoreAllMocks();
    });

    it("saves preferences one at a time, and only for the page's person", async () => {
      site.prepare = (client) => client.hold(user('7', ['MEMBER'], { preferences: { theme: 'auto', date_format: null, time_format: null } }), null);
      const auth = start();
      await auth.init();
      const order: string[] = [];
      const first = auth.savePreferences({ theme: 'dark' }).then(() => order.push('first'));
      const second = auth.savePreferences({ theme: 'light' }).then(() => order.push('second'));
      await Promise.all([first, second]);
      expect(order).toEqual(['first', 'second']);
      expect(auth.preferences()?.theme).toBe('light');

      site.client!.session!.user = user('8');
      await expect(auth.savePreferences({ theme: 'dark' })).rejects.toMatchObject({ code: 'login_required' });
    });
  });
});
