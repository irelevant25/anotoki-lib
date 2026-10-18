import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { SiteStatus } from './site-status.service';
import { STATUS_URL, provideTestSite, testSite } from './testing';

describe('SiteStatus: where the site stands, asked of the status path', () => {
  let status: SiteStatus;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestSite(testSite()) });
    status = TestBed.inject(SiteStatus);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('is unknown, not blocked and taken as installed until it is told otherwise', () => {
    expect(status.state()).toBe('unknown');
    expect(status.blocked()).toBe(false);
    expect(status.installed()).toBe(true);
  });

  it.each([
    ['ready', 'ready', false],
    ['update_pending', 'update-pending', true],
    ['not_set_up', 'not-set-up', true],
    ['unavailable', 'unavailable', true],
  ] as const)('maps the server state %s to %s', async (server, state, blocked) => {
    const asked = status.check();
    const request = http.expectOne(STATUS_URL);
    expect(request.request.method).toBe('GET');
    request.flush({ state: server, installed: false });

    expect(await asked).toBe(state);
    expect(status.state()).toBe(state);
    expect(status.blocked()).toBe(blocked);
    expect(status.installed()).toBe(false);
  });

  it('counts no answer at all as unavailable', async () => {
    const asked = status.check();
    http.expectOne(STATUS_URL).error(new ProgressEvent('error'));
    expect(await asked).toBe('unavailable');
    expect(status.blocked()).toBe(true);
  });

  it('counts a 5xx without the status in its body as unavailable', async () => {
    const asked = status.check();
    http.expectOne(STATUS_URL).flush('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' });
    expect(await asked).toBe('unavailable');
  });

  it('counts an answer that is no status (a page, a missing route) as unavailable', async () => {
    const asked = status.check();
    http.expectOne(STATUS_URL).flush({ hello: 'world' });
    expect(await asked).toBe('unavailable');

    const again = status.check();
    http.expectOne(STATUS_URL).flush({ code: 'not_found' }, { status: 404, statusText: 'Not Found' });
    expect(await again).toBe('unavailable');
  });

  it("reads a gate's 503 body when one answers instead of the status", async () => {
    const asked = status.check();
    http.expectOne(STATUS_URL).flush({ code: 'not_set_up', installed: false, setup: '/setup.php', message: 'This site is not set up yet.' }, { status: 503, statusText: 'Service Unavailable' });
    expect(await asked).toBe('not-set-up');
    expect(status.installed()).toBe(false);
  });

  it('shares one request between the calls made while it is under way', async () => {
    const first = status.check();
    const second = status.check();
    http.expectOne(STATUS_URL).flush({ state: 'ready', installed: true });
    expect(await first).toBe('ready');
    expect(await second).toBe('ready');

    const third = status.check();
    http.expectOne(STATUS_URL).flush({ state: 'update_pending', installed: true });
    expect(await third).toBe('update-pending');
  });

  it("report() takes the server's codes (and the pages' names), keeps installed unless told, ignores anything else", () => {
    status.report('update_pending');
    expect(status.state()).toBe('update-pending');
    expect(status.installed()).toBe(true);

    status.report('not_set_up', false);
    expect(status.state()).toBe('not-set-up');
    expect(status.installed()).toBe(false);

    status.report('unavailable');
    expect(status.installed()).toBe(false);

    status.report('busy');
    status.report('unknown');
    expect(status.state()).toBe('unavailable');

    status.report('ready');
    expect(status.state()).toBe('ready');
    expect(status.blocked()).toBe(false);
  });

  it('markReady() makes the site ready without asking', () => {
    status.report('update_pending');
    status.markReady();
    expect(status.state()).toBe('ready');
    expect(status.blocked()).toBe(false);
  });
});
