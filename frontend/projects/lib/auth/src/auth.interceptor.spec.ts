import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { ErrorHandler } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AnotokiAuth } from './auth.service';
import { AnotokiAuthConfig, AuthBootConfig, VisitorKeyStore } from '@anotoki/lib/auth/core';
import { issuedAs } from '@anotoki/lib/auth/marker';
import { ANOTOKI_ERROR_REPORT, provideAnotokiErrorReport } from '@anotoki/lib/error-report';
import { apiPath } from './auth.interceptor';
import { CARRIES_VISITOR_KEY } from './issued-as';
import { SavesInFlight } from './saves-in-flight';
import { SpecSite, provideSpecAuth, settle, specSite, user } from './testing';

/** The site's visitor key store, in memory: compare-and-delete, the first key kept. */
class Keys implements VisitorKeyStore {
  key: string | null = null;
  forgotten: string[] = [];
  current(): string | null {
    return this.key;
  }
  remember(key: string): void {
    this.key ??= key;
  }
  forget(key: string): void {
    this.forgotten.push(key);
    if (this.key === key) {
      this.key = null;
    }
  }
}

/** The page's origin in the spellings below. */
const SITE = 'https://genshin.anotoki.eu';

/** Another origin, as an attacker would spell it to pass for the site's. */
const ELSEWHERE = [
  '//evil.test/api/progress',
  '/\\evil.test/api/progress',
  '\\\\evil.test/api/progress',
  'https://genshin.anotoki.eu.evil.test/api/progress',
  'https://user@evil.test/api/progress',
  'https://genshin.anotoki.eu@evil.test/api/progress',
  'https://genshin.anotoki.eu:443@evil.test/api/progress',
  'https://evil.test\\@genshin.anotoki.eu/api/progress',
  'https://evil.test#@genshin.anotoki.eu/api/progress',
  'http://genshin.anotoki.eu/api/progress',
  'https://genshin.anotoki.eu:8443/api/progress',
  'https://genshin.anotoki.eu./api/progress',
];

describe('anotokiAuthInterceptor: who a request is, decided when it is issued', () => {
  let site: SpecSite;
  let keys: Keys;
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AnotokiAuth;

  async function start(signedIn: boolean, config: Partial<AnotokiAuthConfig> = {}, reporter = false, boot: Partial<AuthBootConfig> = {}): Promise<void> {
    site = specSite(boot);
    keys = new Keys();
    if (signedIn) {
      site.prepare = (client) => client.hold(user('7'), null);
    }
    TestBed.configureTestingModule({ providers: [...provideSpecAuth(site, { visitors: () => keys, ...config }), ...(reporter ? [provideAnotokiErrorReport()] : [])] });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AnotokiAuth);
    await auth.init();
  }

  afterEach(() => {
    backend?.verify();
    vi.restoreAllMocks();
  });

  describe('what it handles', () => {
    it("the site's API of this origin only, but what is anybody's", () => {
      const config = { config: '/api/boot' };
      const origin = location.origin;
      expect(apiPath('/api/progress', origin, config)).toBe('/api/progress');
      expect(apiPath(`${origin}/api/progress?x=1`, origin, config)).toBe('/api/progress');
      expect(apiPath('https://elsewhere.test/api/progress', origin, config)).toBeNull();
      expect(apiPath('/assets/x.json', origin, config)).toBeNull();
      for (const skipped of ['/api/site-status', '/api/auth/config', '/api/translations/sk', '/api/boot']) {
        expect(apiPath(skipped, origin, config)).toBeNull();
      }
      expect(apiPath('/api/site-statusx', origin, config)).toBe('/api/site-statusx');
      expect(apiPath('/report/3', origin, { config: '/c', api: { prefixes: ['/api/', '/report/'], skip: ['/api/images/'] } })).toBe('/report/3');
      expect(apiPath('/api/images/1.png', origin, { config: '/c', api: { skip: ['/api/images/'] } })).toBeNull();
    });

    it("leaves another host's request as it is - never a token there", async () => {
      await start(true);
      const sent = firstValueFrom(http.get('https://elsewhere.test/api/x'));
      const request = backend.expectOne('https://elsewhere.test/api/x');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
      await sent;
    });

    it('another origin is another origin however it is spelled; a dot-dot leaves the API', () => {
      const config = { config: '/api/boot' };
      for (const url of [...ELSEWHERE, '/api/%2e%2e/progress', '/api/%2E%2E/progress', '/api/../progress']) {
        expect(apiPath(url, SITE, config), url).toBeNull();
      }
      // The site's own address, spelled otherwise, is still its own.
      expect(apiPath('HTTPS://GENSHIN.ANOTOKI.EU:443/api/progress', SITE, config)).toBe('/api/progress');
      expect(apiPath('https://genshin.anotoki.eu/api/./progress?x=1', SITE, config)).toBe('/api/progress');
    });

    it('sends a person no token and a visitor no key to any of them', async () => {
      const own = `${SITE}/api/progress`;
      for (const signedIn of [true, false]) {
        TestBed.resetTestingModule();
        await start(signedIn);
        site.browser.origin = () => SITE;
        keys.key = 'vk-1';
        for (const url of [...ELSEWHERE, '/api/%2e%2e/progress']) {
          const sent = firstValueFrom(http.get(url));
          const request = backend.expectOne(url);
          expect(request.request.headers.has('Authorization'), url).toBe(false);
          expect(request.request.headers.has('X-Visitor-Key'), url).toBe(false);
          request.flush({});
          await sent;
        }
        // The control: the site's API itself gets them.
        const sent = firstValueFrom(http.get(own));
        await settle();
        const request = backend.expectOne(own);
        expect(signedIn ? request.request.headers.get('Authorization') : request.request.headers.get('X-Visitor-Key')).toBe(signedIn ? 'Bearer token-1' : 'vk-1');
        request.flush({});
        await sent;
        backend.verify();
      }
    });

    it("AnotokiAuth.fetch(): this origin's addresses alone get the token - never another, however it is spelled", async () => {
      await start(true);
      site.browser.origin = () => SITE;
      const sent: { url: string; headers: Headers }[] = [];
      const fetched = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        sent.push({ url: String(input), headers: new Headers(init?.headers) });
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
      try {
        for (const url of ELSEWHERE) {
          await auth.fetch(url, { headers: { Accept: 'application/json' } });
          expect(sent.at(-1)?.url, url).toBe(url);
          expect(sent.at(-1)?.headers.has('Authorization'), url).toBe(false);
          expect(sent.at(-1)?.headers.has('X-Visitor-Key'), url).toBe(false);
        }
        for (const url of [`${SITE}/api/report/3`, '/api/report/3', 'HTTPS://GENSHIN.ANOTOKI.EU/files/report.pdf']) {
          await auth.fetch(url);
          expect(sent.at(-1)?.headers.get('Authorization'), url).toBe('Bearer token-1');
        }
      } finally {
        fetched.mockRestore();
      }
    });
  });

  describe("a person's request", () => {
    it('carries the token, and never a visitor key', async () => {
      await start(true, { headers: () => ({ 'X-Time-Zone': 'Europe/Bratislava' }) });
      keys.key = 'k1';
      const sent = firstValueFrom(http.get('/api/progress', { headers: { 'X-Visitor-Key': 'k1' } }));
      await settle();
      const request = backend.expectOne('/api/progress');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      expect(request.request.headers.get('X-Time-Zone')).toBe('Europe/Bratislava');
      request.flush({ ok: true });
      expect(await sent).toEqual({ ok: true });
    });

    it('is never sent without a token: a 401 sign_in_required of its own', async () => {
      await start(true);
      site.client!.session = null;
      const sent = firstValueFrom(http.get('/api/progress'));
      await expect(sent).rejects.toMatchObject({ status: 401, error: { code: 'sign_in_required' } });
      backend.expectNone('/api/progress');
    });

    it('a 401 to a token that looked good: one fresh token, one retry', async () => {
      await start(true);
      const sent = firstValueFrom(http.get('/api/progress'));
      await settle();
      backend.expectOne('/api/progress').flush({ code: 'invalid_token' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      const again = backend.expectOne('/api/progress');
      expect(again.request.headers.get('Authorization')).toBe('Bearer token-2');
      again.flush({ ok: true });
      expect(await sent).toEqual({ ok: true });
    });

    it('a 401 the refresh cannot help: no second retry, and the page follows', async () => {
      await start(true);
      site.client!.refreshAnswer = 'refused';
      const sent = firstValueFrom(http.get('/api/progress'));
      await settle();
      backend.expectOne('/api/progress').flush({ code: 'invalid_token' }, { status: 401, statusText: 'Unauthorized' });
      await expect(sent).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(auth.state()).toBe('signed-out');
    });

    it("an answer that made a visitor is not this person's save: a 502, the key not kept", async () => {
      await start(true);
      const sent = firstValueFrom(http.post('/api/kanji/learn', {}));
      await settle();
      backend.expectOne('/api/kanji/learn').flush({}, { headers: { 'X-Visitor-Key': 'made' } });
      await expect(sent).rejects.toMatchObject({ status: 502 });
      expect(keys.key).toBeNull();
    });

    it('the move carries both: the token, and the key it set itself', async () => {
      await start(true);
      const sent = firstValueFrom(http.post('/api/visitor/move', {}, { headers: { 'X-Visitor-Key': 'k1' }, context: new HttpContext().set(CARRIES_VISITOR_KEY, true) }));
      await settle();
      const request = backend.expectOne('/api/visitor/move');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      expect(request.request.headers.get('X-Visitor-Key')).toBe('k1');
      request.flush({}, { headers: { 'X-Visitor-Key': 'k1' } });
      await sent;
    });
  });

  describe("a visitor's request", () => {
    it('carries the key held as it leaves, never a token; a key an answer brings is kept', async () => {
      await start(false);
      const first = firstValueFrom(http.post('/api/answers', {}));
      const made = backend.expectOne('/api/answers');
      expect(made.request.headers.has('X-Visitor-Key')).toBe(false);
      expect(made.request.headers.has('Authorization')).toBe(false);
      made.flush({}, { headers: { 'X-Visitor-Key': 'k1' } });
      await first;
      expect(keys.key).toBe('k1');

      const second = firstValueFrom(http.get('/api/answers'));
      const request = backend.expectOne('/api/answers');
      expect(request.request.headers.get('X-Visitor-Key')).toBe('k1');
      request.flush([]);
      await second;
    });

    it('a key the server no longer knows is forgotten - only while it is still the one held - and tried once more', async () => {
      await start(false);
      keys.key = 'old';
      const sent = firstValueFrom(http.get('/api/answers'));
      backend.expectOne((request) => request.headers.get('X-Visitor-Key') === 'old').flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      const again = backend.expectOne('/api/answers');
      expect(again.request.headers.has('X-Visitor-Key')).toBe(false);
      again.flush([]);
      await sent;
      expect(keys.forgotten).toEqual(['old']);
    });

    it('sign_in_required: the site requires signing in now; the key stays, and nothing more goes with it', async () => {
      await start(false);
      keys.key = 'k1';
      const sent = firstValueFrom(http.get('/api/answers'));
      backend.expectOne('/api/answers').flush({ code: 'sign_in_required' }, { status: 401, statusText: 'Unauthorized' });
      await expect(sent).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(auth.loginRequired()).toBe(true);
      expect(keys.key).toBe('k1');
      expect(auth.caller()).toBe('person');
    });

    it('only under the visitor prefixes, when the site names them', async () => {
      await start(false, { api: { visitorPrefixes: ['/api/surveys'] } });
      keys.key = 'k1';
      const surveys = firstValueFrom(http.get('/api/surveys/3'));
      const toSurveys = backend.expectOne('/api/surveys/3');
      expect(toSurveys.request.headers.get('X-Visitor-Key')).toBe('k1');
      const other = firstValueFrom(http.get('/api/surveysx'));
      const toOther = backend.expectOne('/api/surveysx');
      expect(toOther.request.headers.has('X-Visitor-Key')).toBe(false);
      toSurveys.flush({});
      toOther.flush({});
      await Promise.all([surveys, other]);
    });

    it('the first save that makes a visitor goes alone; the others wait for the key it brings', async () => {
      let saving: Promise<void> | null = null;
      let end: () => void = () => undefined;
      const store: VisitorKeyStore = {
        current: () => keys.key,
        remember: (key) => keys.remember(key),
        forget: (key) => keys.forget(key),
        firstSave: () => saving,
        beginFirstSave: () => {
          saving = new Promise(
            (done) =>
              (end = () => {
                saving = null;
                done();
              }),
          );
          return () => end();
        },
      };
      await start(false, { visitors: () => store, makesVisitor: (request) => request.method === 'POST' });
      const first = firstValueFrom(http.post('/api/kanji/learn', {}));
      const second = firstValueFrom(http.get('/api/kanji/state'));
      await settle();
      backend.expectNone('/api/kanji/state');
      backend.expectOne('/api/kanji/learn').flush({}, { headers: { 'X-Visitor-Key': 'k9' } });
      await first;
      await settle();
      const waited = backend.expectOne('/api/kanji/state');
      expect(waited.request.headers.get('X-Visitor-Key')).toBe('k9');
      waited.flush({});
      await second;
    });
  });

  describe("a report of the page's own error (ANOTOKI_ERROR_REPORT): sent as any request, its failure left alone", () => {
    /** A report as the error reporter sends it. */
    const report = () => firstValueFrom(http.post('/api/client-errors', { type: 'Error', message: 'x', page: '/', stack: [] }, { context: new HttpContext().set(ANOTOKI_ERROR_REPORT, true) }));

    it("a person's carries the token; its 401 is handed back - no fresh token, no retry, the page neither followed nor sent to sign in", async () => {
      await start(true, {}, true);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      // Through the reporter itself, as a site has it (provideAnotokiErrorReport() beside the interceptor).
      TestBed.inject(ErrorHandler).handleError(new Error('The kanji card could not be drawn'));
      await settle();
      const sent = backend.expectOne('/api/client-errors');
      expect(sent.request.context.get(ANOTOKI_ERROR_REPORT)).toBe(true);
      expect(sent.request.headers.get('Authorization')).toBe('Bearer token-1');
      sent.flush({ code: 'invalid_token' }, { status: 401, statusText: 'Unauthorized' });
      await settle();

      backend.expectNone('/api/client-errors');
      expect(site.client!.refreshes).toBe(0);
      expect(site.client!.logins).toEqual([]);
      expect(site.browser.navigations).toEqual([]);
      expect(site.browser.reloads).toBe(0);
      expect(auth.state()).toBe('signed-in');

      // The error itself, as it came, for whoever sent it: here too, nothing more.
      const direct = report();
      await settle();
      backend.expectOne('/api/client-errors').flush({ code: 'invalid_token' }, { status: 401, statusText: 'Unauthorized' });
      await expect(direct).rejects.toMatchObject({ status: 401, error: { code: 'invalid_token' } });
      backend.expectNone('/api/client-errors');
      expect(site.client!.refreshes).toBe(0);
      expect(auth.state()).toBe('signed-in');

      // The control: any other request of the person's gets its fresh token and its one retry.
      const save = firstValueFrom(http.post('/api/progress', {}));
      await settle();
      backend.expectOne('/api/progress').flush({ code: 'invalid_token' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      backend.expectOne('/api/progress').flush({});
      await save;
      expect(site.client!.refreshes).toBe(1);
    });

    it('with no token to send it is not sent, as any request - and the page is not told to follow the session', async () => {
      await start(true);
      site.client!.session = null;

      await expect(report()).rejects.toMatchObject({ status: 401, error: { code: 'sign_in_required' } });
      backend.expectNone('/api/client-errors');
      expect(auth.state()).toBe('signed-in');
      expect(site.browser.reloads).toBe(0);

      // The control: another request of the person's makes the page follow.
      await expect(firstValueFrom(http.get('/api/progress'))).rejects.toMatchObject({ status: 401 });
      expect(auth.state()).toBe('signed-out');
    });

    it("a visitor's carries the key; a 401 forgets no key, tries nothing again and notes no sign-in as required", async () => {
      await start(false);
      keys.key = 'k1';

      let sent = report();
      let request = backend.expectOne('/api/client-errors');
      expect(request.request.headers.get('X-Visitor-Key')).toBe('k1');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      await expect(sent).rejects.toMatchObject({ status: 401, error: { code: 'visitor_unknown' } });
      backend.expectNone('/api/client-errors');
      expect([keys.key, keys.forgotten]).toEqual(['k1', []]);

      sent = report();
      request = backend.expectOne('/api/client-errors');
      request.flush({ code: 'sign_in_required' }, { status: 401, statusText: 'Unauthorized' });
      await expect(sent).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(auth.loginRequired()).toBe(false);
      expect(auth.state()).toBe('visitor');
    });
  });

  describe("anybody's request (issuedAs('anybody'): the feedback form's message): whoever the page is shown to - never refused here, the page never following", () => {
    /** A message as the feedback form sends it. */
    const message = () => firstValueFrom(http.post('/api/feedback', { kind: 'idea', message: 'A dark map, please.' }, { context: issuedAs('anybody') }));

    /** Nothing sent the page anywhere: no sign-in started, no navigation, no reload. */
    function stayed(): void {
      expect(site.client!.logins).toEqual([]);
      expect(site.browser.navigations).toEqual([]);
      expect(site.browser.reloads).toBe(0);
    }

    it("signed in: the person's token, never a key - a 401 handed back as it came, no fresh token, no retry, the page not following", async () => {
      await start(true);
      keys.key = 'k1';

      let sent = message();
      await settle();
      const request = backend.expectOne('/api/feedback');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      request.flush({ ok: true }, { status: 201, statusText: 'Created' });
      expect(await sent).toEqual({ ok: true });

      sent = message();
      await settle();
      backend.expectOne('/api/feedback').flush({ code: 'invalid_token' }, { status: 401, statusText: 'Unauthorized' });
      await expect(sent).rejects.toMatchObject({ status: 401, error: { code: 'invalid_token' } });
      backend.expectNone('/api/feedback');
      expect(site.client!.refreshes).toBe(0);
      expect(auth.state()).toBe('signed-in');
      stayed();
    });

    it("signed in with no token to send: it goes as nobody's - never refused here, and the page does not follow", async () => {
      await start(true);
      keys.key = 'k1';
      site.client!.session = null;

      const sent = message();
      await settle();
      const request = backend.expectOne('/api/feedback');
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      request.flush({ ok: true }, { status: 201, statusText: 'Created' });
      expect(await sent).toEqual({ ok: true });
      expect(auth.state()).toBe('signed-in');
      stayed();

      // The control: the person's own request is never sent, and the page follows the session that ended.
      await expect(firstValueFrom(http.get('/api/progress'))).rejects.toMatchObject({ status: 401, error: { code: 'sign_in_required' } });
      backend.expectNone('/api/progress');
      expect(auth.state()).toBe('signed-out');
    });

    it("a visitor's: the key, never a token - a 401 sign_in_required handed back, the site not noted as requiring signing in", async () => {
      await start(false);
      keys.key = 'k1';

      const sent = message();
      const request = backend.expectOne('/api/feedback');
      expect(request.request.headers.get('X-Visitor-Key')).toBe('k1');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ code: 'sign_in_required', message: 'Sign in to send feedback.' }, { status: 401, statusText: 'Unauthorized' });
      await expect(sent).rejects.toMatchObject({ status: 401, error: { code: 'sign_in_required' } });
      backend.expectNone('/api/feedback');
      expect(auth.loginRequired()).toBe(false);
      expect(auth.state()).toBe('visitor');
      expect([keys.key, keys.forgotten]).toEqual(['k1', []]);
      stayed();
    });

    it("a visitor's key the server no longer knows: forgotten and tried once more, as on any visitor's request", async () => {
      await start(false);
      keys.key = 'old';

      const sent = message();
      backend.expectOne((request) => request.headers.get('X-Visitor-Key') === 'old').flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      const again = backend.expectOne('/api/feedback');
      expect(again.request.headers.has('X-Visitor-Key')).toBe(false);
      again.flush({ ok: true }, { status: 201, statusText: 'Created' });
      expect(await sent).toEqual({ ok: true });
      expect(keys.forgotten).toEqual(['old']);
      expect(auth.state()).toBe('visitor');
    });

    it("nobody's - nobody signed in where the site requires signing in: sent bare, never refused here; the server's refusal handed back, nobody sent to sign in", async () => {
      await start(false, {}, false, { login_required: true });
      keys.key = 'k1';
      expect(auth.state()).toBe('signed-out');

      const sent = message();
      await settle();
      const request = backend.expectOne('/api/feedback');
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      request.flush({ code: 'sign_in_required', message: 'Sign in to send feedback.' }, { status: 401, statusText: 'Unauthorized' });
      await expect(sent).rejects.toMatchObject({ status: 401, error: { code: 'sign_in_required' } });
      backend.expectNone('/api/feedback');
      expect(auth.state()).toBe('signed-out');
      stayed();

      // The control: the same message saying nothing of whom it is for is the person's the page is on the way to -
      // refused here, never sent (the sites' own feedbackSenderInterceptor marked it, until 0.7.2).
      expect(auth.caller()).toBe('person');
      await expect(firstValueFrom(http.post('/api/feedback', {}))).rejects.toMatchObject({ status: 401, error: { code: 'sign_in_required' } });
      backend.expectNone('/api/feedback');
    });

    it("nobody's on a site with no sign-in set up: bare", async () => {
      await start(false, {}, false, { issuer: '' });
      expect(auth.state()).toBe('unavailable');
      keys.key = 'k1';

      const sent = message();
      const request = backend.expectOne('/api/feedback');
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      request.flush({ ok: true }, { status: 201, statusText: 'Created' });
      expect(await sent).toEqual({ ok: true });
    });
  });

  describe('decided when issued', () => {
    it("a person's request issued as such on a visitor's page fails unsent; nobody's goes bare", async () => {
      await start(false);
      keys.key = 'k1';
      const person = firstValueFrom(http.get('/api/me', { context: issuedAs('person') }));
      await expect(person).rejects.toMatchObject({ status: 401 });
      backend.expectNone('/api/me');

      const nobody = firstValueFrom(http.get('/api/open', { context: issuedAs('nobody') }));
      const request = backend.expectOne('/api/open');
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      request.flush({});
      await nobody;
    });
  });

  it('counts the writes on their way: a sign-in waits for them', async () => {
    await start(false);
    const saves = TestBed.inject(SavesInFlight);
    const write = firstValueFrom(http.put('/api/settings', {}));
    const read = firstValueFrom(http.get('/api/settings'));
    expect(saves.count()).toBe(1);
    let settledSignIn = false;
    void saves.settled().then(() => (settledSignIn = true));
    await settle();
    expect(settledSignIn).toBe(false);
    backend.match(() => true).forEach((request) => request.flush({}));
    await Promise.all([write, read]);
    await settle();
    expect(saves.count()).toBe(0);
    expect(settledSignIn).toBe(true);
  });
});
