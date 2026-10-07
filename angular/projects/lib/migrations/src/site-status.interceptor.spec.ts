import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SiteStatus } from './site-status.service';
import { STATUS_URL, provideTestSite, testSite } from './testing';

const UNAVAILABLE = { status: 503, statusText: 'Service Unavailable' };

describe('siteStatusInterceptor: the server saying the site is not ready', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let status: SiteStatus;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestSite(testSite()) });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    status = TestBed.inject(SiteStatus);
  });

  afterEach(() => http.verify());

  /** The request's error, once the answer came. */
  async function failure(request: Promise<unknown>): Promise<HttpErrorResponse> {
    try {
      await request;
    } catch (error) {
      return error as HttpErrorResponse;
    }
    throw new Error('The request did not fail.');
  }

  it('reports update_pending, and the request still fails as before', async () => {
    const request = firstValueFrom(client.get('/api/me'));
    http.expectOne('/api/me').flush({ code: 'update_pending', message: 'The site is being updated. Try again in a few minutes.' }, UNAVAILABLE);

    const error = await failure(request);
    expect(error.status).toBe(503);
    expect(status.state()).toBe('update-pending');
  });

  it('reports not_set_up with whether the site was installed', async () => {
    const request = firstValueFrom(client.post('/api/things', {}));
    http.expectOne('/api/things').flush({ code: 'not_set_up', installed: false, setup: '/setup.php', message: '...' }, UNAVAILABLE);

    await failure(request);
    expect(status.state()).toBe('not-set-up');
    expect(status.installed()).toBe(false);
  });

  it('reads a body that came as text', async () => {
    const request = firstValueFrom(client.get('/api/report', { responseType: 'text' }));
    http.expectOne('/api/report').flush('{"code":"update_pending","message":"..."}', UNAVAILABLE);

    await failure(request);
    expect(status.state()).toBe('update-pending');
  });

  it('leaves every other failure alone', async () => {
    const other503 = firstValueFrom(client.get('/api/a'));
    http.expectOne('/api/a').flush({ code: 'maintenance' }, UNAVAILABLE);
    await failure(other503);

    const plain503 = firstValueFrom(client.get('/api/b'));
    http.expectOne('/api/b').flush('Service Unavailable', UNAVAILABLE);
    await failure(plain503);

    const not503 = firstValueFrom(client.get('/api/c'));
    http.expectOne('/api/c').flush({ code: 'update_pending' }, { status: 500, statusText: 'Server Error' });
    await failure(not503);

    const fine = firstValueFrom(client.get('/api/d'));
    http.expectOne('/api/d').flush({ code: 'update_pending' });
    await fine;

    expect(status.state()).toBe('unknown');
  });

  it('lets the status path pass untouched', async () => {
    const request = firstValueFrom(client.get(STATUS_URL + '?again=1'));
    http.expectOne(STATUS_URL + '?again=1').flush({ code: 'update_pending' }, UNAVAILABLE);

    await failure(request);
    expect(status.state()).toBe('unknown');
  });
});
