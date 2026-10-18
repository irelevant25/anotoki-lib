import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { SiteStatus } from '../site-status.service';
import { STATUS_URL, TestSite, provideTestSite, settle, testSite, words } from '../testing';
import { UpdateBannerComponent } from './update-banner.component';

describe('<anotoki-update-banner>: one line for the ADMIN of a site that does not block', () => {
  let site: TestSite;
  let status: SiteStatus;
  let http: HttpTestingController;
  let fixture: ComponentFixture<UpdateBannerComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    site = testSite();
    TestBed.configureTestingModule({ providers: provideTestSite(site) });
    status = TestBed.inject(SiteStatus);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(UpdateBannerComponent);
    host = fixture.nativeElement;
    await settle(fixture);
  }

  it('tells the ADMIN an update is waiting, in English, with a link to Migrations', async () => {
    site.admin.set(true);
    site.language.set('sk');
    status.report('update_pending');
    await draw();

    const line = host.querySelector('p');
    expect(words(line)).toBe('A database update is waiting. Migrations');
    expect(line?.getAttribute('lang')).toBe('en');
    expect(line?.getAttribute('role')).toBe('status');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/migrations');
    expect(words(host.querySelector('a'))).toBe('Migrations');
  });

  it('shows nobody else anything', async () => {
    site.signedIn.set(true);
    status.report('update_pending');
    await draw();
    expect(host.children.length).toBe(0);
  });

  it('shows nothing while the site is ready, and goes once the update is applied', async () => {
    site.admin.set(true);
    status.markReady();
    await draw();
    expect(host.children.length).toBe(0);

    status.report('update_pending');
    await settle(fixture);
    expect(host.querySelector('p')).not.toBeNull();

    status.markReady();
    await settle(fixture);
    expect(host.children.length).toBe(0);
  });

  it('asks the server once an ADMIN is there and nothing has asked yet - never for anybody else', async () => {
    await draw();
    http.expectNone(STATUS_URL);

    site.admin.set(true);
    await settle(fixture);
    http.expectOne(STATUS_URL).flush({ state: 'update_pending', installed: true });
    await settle(fixture);
    expect(words(host.querySelector('p'))).toBe('A database update is waiting. Migrations');

    site.admin.set(false);
    await settle(fixture);
    site.admin.set(true);
    await settle(fixture);
    http.expectNone(STATUS_URL);
  });
});
