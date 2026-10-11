import { HttpErrorResponse, HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorHandler, inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_ERROR_REPORT, AnotokiErrorReportConfig, ErrorReport, describeError, provideAnotokiErrorReport, scrubText, storedValues } from '@anotoki/lib/error-report';

const JWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
const ENDPOINT = '/api/client-errors';

/** Lets the timers of 0 the reporter sends on run out. */
const settle = () => new Promise((done) => setTimeout(done, 5));

describe("provideAnotokiErrorReport(): the browser's errors in the site's error log", () => {
  let http: HttpTestingController;
  let handler: ErrorHandler;
  let consoleError: ReturnType<typeof vi.spyOn>;

  function setUp(config: AnotokiErrorReportConfig = {}, interceptors: HttpInterceptorFn[] = []): void {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withInterceptors(interceptors)), provideHttpClientTesting(), provideAnotokiErrorReport(config)],
    });
    http = TestBed.inject(HttpTestingController);
    handler = TestBed.inject(ErrorHandler);
    consoleError = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
  }

  const reports = (): TestRequest[] => http.match((request) => request.method === 'POST' && request.url === ENDPOINT);

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
  });

  it("tells the console as Angular does, and reports the error scrubbed, through the app's HttpClient and its interceptors", async () => {
    const seen: string[] = [];
    setUp({}, [
      (request, next) => {
        seen.push(request.url);
        return next(request.clone({ setHeaders: { 'X-IAM-Request': '1' } }));
      },
    ]);
    history.replaceState(null, '', '/account/security?code=ABC123SECRET#top');
    localStorage.setItem('anotoki.session', 'kept-in-storage-value-42');
    const error = new TypeError(`Cannot read x of ana@example.com token ${JWT} and kept-in-storage-value-42`);
    error.stack = [`TypeError: ${error.message}`, '    at render (https://iam.example.sk/chunk-AB12.js?v=SECRET9:3:4)', '    at https://iam.example.sk/main.js?token=abc#frag:1:2345'].join('\n');

    handler.handleError(error);

    expect(consoleError).toHaveBeenCalledWith('ERROR', error);
    expect(reports()).toHaveLength(0);
    await settle();
    const [report] = reports();
    expect(report.request.headers.get('X-IAM-Request')).toBe('1');
    expect(report.request.context.get(ANOTOKI_ERROR_REPORT)).toBe(true);
    expect(seen).toEqual([ENDPOINT]);
    expect(report.request.body).toEqual({
      type: 'TypeError',
      message: 'Cannot read x of {email} token {token} and {stored}',
      page: '/account/security',
      stack: ['at render (https://iam.example.sk/chunk-AB12.js:3:4)', 'at https://iam.example.sk/main.js:1:2345'],
    } satisfies ErrorReport);
    expect(JSON.stringify(report.request.body)).not.toMatch(/SECRET|ABC123|kept-in-storage|ana@|eyJ/);
    report.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('reports each error once, and a few a page load at most', async () => {
    setUp({ perPage: 3 });
    const same = new Error('The same failure');
    for (let time = 0; time < 4; time++) {
      handler.handleError(same);
    }
    await settle();
    expect(reports()).toHaveLength(1);

    for (const word of ['two', 'three', 'four', 'five']) {
      handler.handleError(new Error(`Failure ${word}`));
    }
    await settle();
    const later = reports();
    expect(later.map((each) => (each.request.body as ErrorReport).message)).toEqual(['Failure two', 'Failure three']);
    expect(consoleError).toHaveBeenCalledTimes(8);
    http.match(() => true).forEach((request) => request.flush(null, { status: 204, statusText: 'No Content' }));
  });

  it('never reports an HTTP failure, what the site says not to, nor anything after the route said too many', async () => {
    setUp({ report: (error) => !(error instanceof Error && error.message.startsWith('Expected')) });
    handler.handleError(new HttpErrorResponse({ status: 500, url: '/api/x' }));
    handler.handleError(new Error('Expected by the site'));
    await settle();
    expect(reports()).toHaveLength(0);

    handler.handleError(new Error('First'));
    await settle();
    reports()[0].flush({ code: 'too_many', message: 'That is a lot of errors.', retry_after: 60 }, { status: 429, statusText: 'Too Many Requests' });
    handler.handleError(new Error('Second'));
    await settle();
    expect(reports()).toHaveLength(0);
  });

  it('never recurses: an interceptor that fails, or reports an error itself, leaves the console alone to hear of it', async () => {
    let calls = 0;
    setUp({}, [
      (request, next) => {
        calls++;
        inject(ErrorHandler).handleError(new Error('Raised while reporting'));
        if (calls === 1) {
          throw new Error('The interceptor failed');
        }
        return next(request);
      },
    ]);

    expect(() => handler.handleError(new Error('One'))).not.toThrow();
    await settle();
    handler.handleError(new Error('Two'));
    await settle();

    expect(calls).toBe(2);
    expect(reports().map((each) => (each.request.body as ErrorReport).message)).toEqual(['Two']);
    expect(consoleError.mock.calls.map((call: unknown[]) => (call[1] as Error).message)).toEqual(['One', 'Raised while reporting', 'Two', 'Raised while reporting']);
  });

  it("names a value that is no Error by its kind, never by what it holds, and keeps a report under the route's size", () => {
    expect(describeError({ password: 'hunter2' }).message).toBe('A value that is no Error was thrown (object)');
    expect(describeError(42).message).toBe('A value that is no Error was thrown (number)');
    expect(describeError('Failed for ana@example.com')).toEqual({ type: 'Error', message: 'Failed for {email}', page: '/', stack: [] });
    expect(describeError(new Error('')).message).toBe('(no message)');
    const named = new Error('x');
    named.name = 'not a name!';
    expect(describeError(named).type).toBe('Error');

    const huge = new Error('ž '.repeat(2500));
    huge.stack = Array.from({ length: 40 }, (_, index) => `    at f${index} (https://site.example/${'ľ'.repeat(300)}.js:1:${index})`).join('\n');
    const report = describeError(huge);
    expect(Array.from(report.message)).toHaveLength(1000);
    expect(describeError(new Error('ž'.repeat(5000))).message, 'one run the cut went through: none of it').toBe('(no message)');
    expect(report.stack.length).toBeLessThanOrEqual(12);
    expect(new TextEncoder().encode(JSON.stringify(report)).length).toBeLessThanOrEqual(7 * 1024);
  });

  it('reads a huge message, stack or path no further than a report keeps: never slow, never the tab frozen', () => {
    // Runs a rule could take time on that grows with the square of their length: dots between letters, no "://".
    const run = 'a.'.repeat(500_000);
    const huge = new Error(`Failed ${run}`);
    huge.stack = `Error: ${huge.message}\n    at f (https://site.example/main.js?${'b.'.repeat(500_000)}:1:2)\n    at g (https://site.example/main.js:3:4)`;

    const started = performance.now();
    const report = describeError(huge, ['stored-value-1'], `/${run}`);
    const scrubbed = scrubText(run);
    const took = performance.now() - started;

    expect(took).toBeLessThan(500);
    // Each cut went through a run, which goes whole with what is not read.
    expect(report.stack).toEqual(['at f', 'at g (https://site.example/main.js:3:4)']);
    expect(report.message).toBe('Failed ');
    expect(report.page).toBe('/');
    expect(scrubbed).toBe('');
    expect(scrubText('word '.repeat(2000))).toBe('word '.repeat(819));
  });

  it('never sends half of what a cut went through - the run goes whole, as on the server', () => {
    const before = 'a '.repeat(2040);
    for (const secret of [JWT, 'ana.novak@example.com', '9f86d081'.repeat(8), 'kept-in-storage-value-42']) {
      expect(scrubText(`${before}${secret} and more`, ['kept-in-storage-value-42'])).toBe(before);
    }
    // A quoted secret of several words the cut went into: its words before the cut go too.
    expect(scrubText(`${'a '.repeat(2030)}{"password":"correct horse battery staple", "name": "x"}`).endsWith('{"password":{…}')).toBe(true);
    expect(scrubText("sent {'pass': 'two words")).toBe("sent {'pass': {…}");
    expect(scrubText('ends with a word')).toBe('ends with a word');

    // The message, a frame and the page are each cut before they are scrubbed, and kept shorter after: what the scrub
    // shortens before the cut (tokens, a stored value) would bring the half the cut went through into the report.
    const stored = 'L'.repeat(380);
    const error = new Error(`${`${'9f86d081'.repeat(4)} `.repeat(60)}${JWT}`);
    error.stack = ['Error: x', `    at f ${stored} ${JWT}`].join('\n');
    const report = describeError(error, [stored], `/${'9f86d0819f86d081/'.repeat(46)}ddddddd/${JWT}`);

    expect(JSON.stringify(report)).not.toContain('eyJ');
    expect(report.message).toBe('{token} '.repeat(60));
    expect(report.stack).toEqual(['at f {stored}']);
    expect(report.page).toBe(`/${'{…}/'.repeat(46)}ddddddd/`);
  });

  it('scrubs as the server does: secrets by name, a Bearer credential, a long token, a query - the line and column kept', () => {
    expect(scrubText('password=hunter2&next=/ token: "s3cr3t" cookie=a1b2')).toBe('password={…}&next=/ token: {…} cookie={…}');
    expect(scrubText('sent Bearer abcdefghijklmnop')).toBe('sent Bearer {…}');
    expect(scrubText('reset 9f86d081884c7d659a2feaa0c55ad015 used')).toBe('reset {token} used');
    expect(scrubText('ExpressionChangedAfterItHasBeenCheckedError stays')).toBe('ExpressionChangedAfterItHasBeenCheckedError stays');
    expect(scrubText('GET /api/reset?token=abc123&x=1 failed')).toBe('GET /api/reset failed');
    expect(scrubText('f@https://site.example/main.js?v=1:10:20')).toBe('f@https://site.example/main.js:10:20');
    expect(describeError(new Error('x'), [], '/reset/9f86d081884c7d659a2feaa0/ana%40example.com').page).toBe('/reset/{…}/{…}');
  });

  it('knows the values the page keeps: storage, the texts inside a stored JSON value, the cookies - the longest first', () => {
    localStorage.setItem('anotoki.prefs', JSON.stringify({ theme: 'dark', account: { email: 'someone@example.com' } }));
    sessionStorage.setItem('anotoki.token', 'a-session-value-123456');
    document.cookie = 'anotoki_signed_in=hint-value-7890';

    const values = storedValues();

    expect(values).toEqual(expect.arrayContaining(['someone@example.com', 'a-session-value-123456', 'hint-value-7890']));
    expect(values).not.toContain('dark');
    expect([...values].sort((a, b) => b.length - a.length)).toEqual(values);
    document.cookie = 'anotoki_signed_in=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });
});
