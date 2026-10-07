import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { AnotokiMigrationsConfig } from '../config';
import { SiteStatus } from '../site-status.service';
import { STATUS_URL, TestSite, provideTestSite, settle, testSite, words } from '../testing';
import { SiteStatusComponent } from './site-status.component';

describe('<anotoki-site-status>: what people see while the site is not ready', () => {
  let site: TestSite;
  let status: SiteStatus;
  let http: HttpTestingController;
  let fixture: ComponentFixture<SiteStatusComponent>;
  let host: HTMLElement;

  function setUp(extra: Partial<AnotokiMigrationsConfig> = {}): void {
    site = testSite();
    TestBed.configureTestingModule({ providers: provideTestSite(site, extra) });
    status = TestBed.inject(SiteStatus);
    http = TestBed.inject(HttpTestingController);
  }

  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(SiteStatusComponent);
    host = fixture.nativeElement;
    await settle(fixture);
  }

  const section = () => host.querySelector('section');
  const title = () => words(host.querySelector('h1'));
  const text = () => words(host.querySelector('p'));
  /** Every button and link, by its words. */
  const actions = () => Array.from(host.querySelectorAll('button, a')).map(words);
  const button = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((b) => words(b) === label)!;

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  describe('an update waits', () => {
    it('a visitor reads that the site is being updated - no error, no code, nothing but a quiet Sign in', async () => {
      setUp();
      status.report('update_pending');
      await draw();

      expect(title()).toBe('The site is being updated');
      expect(text()).toBe('It will be back in a few minutes. This page reloads by itself.');
      expect(actions()).toEqual(['Sign in']);
      expect(host.querySelector('button')?.classList).toContain('quiet');
      expect(host.textContent).not.toMatch(/update_pending|503|setup|migration|database|error/i);
      expect(section()?.getAttribute('role')).toBe('status');

      button('Sign in').click();
      expect(site.signIn).toHaveBeenCalledTimes(1);
    });

    it('a signed-in member gets no button at all', async () => {
      setUp();
      site.signedIn.set(true);
      status.report('update_pending');
      await draw();

      expect(title()).toBe('The site is being updated');
      expect(actions()).toEqual([]);
    });

    it('the ADMIN reads that an update is waiting, in English whatever the page language, with Open Migrations', async () => {
      setUp();
      site.admin.set(true);
      site.signedIn.set(true);
      site.language.set('sk');
      status.report('update_pending');
      await draw();

      expect(section()?.getAttribute('lang')).toBe('en');
      expect(title()).toBe('A database update is waiting');
      expect(text()).toBe('This site is closed to everybody else until the update is applied. Back the database up first.');
      expect(actions()).toEqual(['Open Migrations']);
      expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/migrations');
    });
  });

  describe('not set up', () => {
    it('never installed: the setup page, and Try again', async () => {
      setUp();
      status.report('not_set_up', false);
      await draw();

      expect(title()).toBe('This site is not set up yet');
      expect(text()).toBe('Its setup page connects it to its database and to the anotoki sign-in.');
      expect(actions()).toEqual(['Open the setup page', 'Try again']);
      expect(host.querySelector('a')?.getAttribute('href')).toBe('/setup.php');
    });

    it("the site's own setup address", async () => {
      setUp({ setupUrl: '/install/setup.php' });
      status.report('not_set_up', false);
      await draw();
      expect(host.querySelector('a')?.getAttribute('href')).toBe('/install/setup.php');
    });

    it('installed once: "not available right now" - never the setup page, for the ADMIN neither', async () => {
      setUp();
      site.admin.set(true);
      status.report('not_set_up', true);
      await draw();

      expect(title()).toBe('The site is not available right now');
      expect(text()).toBe('Please try again in a few minutes. This page reloads by itself.');
      expect(actions()).toEqual(['Try again']);
      expect(host.innerHTML).not.toContain('setup');
    });
  });

  it('unavailable: "not available right now", with Try again', async () => {
    setUp();
    status.report('unavailable');
    await draw();

    expect(title()).toBe('The site is not available right now');
    expect(actions()).toEqual(['Try again']);
  });

  it('ready, or not known: nothing', async () => {
    setUp();
    await draw();
    expect(host.children.length).toBe(0);
    status.markReady();
    await settle(fixture);
    expect(host.children.length).toBe(0);
  });

  describe('words', () => {
    it('Slovak is built in', async () => {
      setUp();
      site.language.set('sk');
      status.report('update_pending');
      await draw();

      expect(section()?.getAttribute('lang')).toBe('sk');
      expect(title()).toBe('Stránku práve aktualizujeme');
      expect(text()).toBe('O pár minút bude späť. Táto stránka sa obnoví sama.');
      expect(actions()).toEqual(['Prihlásiť sa']);

      status.report('not_set_up', false);
      await settle(fixture);
      expect(title()).toBe('Táto stránka ešte nie je nastavená');
      expect(text()).toBe('Stránka nastavenia ju prepojí s databázou a s prihlasovaním anotoki.');
      expect(actions()).toEqual(['Otvoriť stránku nastavenia', 'Skúsiť znova']);

      status.report('unavailable');
      await settle(fixture);
      expect(title()).toBe('Stránka teraz nie je dostupná');
      expect(text()).toBe('Skús to znova o pár minút. Táto stránka sa obnoví sama.');
    });

    it("the site's own words come first, for their language only", async () => {
      setUp({ words: { sk: { updatingTitle: 'Aktualizujeme' }, en: { signIn: 'Log in' } } });
      site.language.set('sk');
      status.report('update_pending');
      await draw();
      expect(title()).toBe('Aktualizujeme');
      expect(text()).toBe('O pár minút bude späť. Táto stránka sa obnoví sama.');
      expect(actions()).toEqual(['Prihlásiť sa']);

      site.language.set('en');
      await settle(fixture);
      expect(title()).toBe('The site is being updated');
      expect(actions()).toEqual(['Log in']);
    });

    it('a language with no words reads English, marked as English', async () => {
      setUp();
      site.language.set('de');
      status.report('update_pending');
      await draw();
      expect(section()?.getAttribute('lang')).toBe('en');
      expect(title()).toBe('The site is being updated');
    });

    it('a language the site has words for is marked as that language; what it lacks reads English', async () => {
      setUp({ words: { de: { updatingTitle: 'Die Seite wird aktualisiert' } } });
      site.language.set('de');
      status.report('update_pending');
      await draw();
      expect(section()?.getAttribute('lang')).toBe('de');
      expect(title()).toBe('Die Seite wird aktualisiert');
      expect(text()).toBe('It will be back in a few minutes. This page reloads by itself.');
    });
  });

  describe('asking again', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    });

    it('while an update waits: every retrySeconds, and the page reloads once the site is ready', async () => {
      setUp({ retrySeconds: 5 });
      status.report('update_pending');
      await draw();
      http.expectNone(STATUS_URL);

      vi.advanceTimersByTime(5000);
      http.expectOne(STATUS_URL).flush({ state: 'update_pending', installed: true });
      await settle(fixture);
      expect(site.reload).not.toHaveBeenCalled();
      expect(title()).toBe('The site is being updated');

      vi.advanceTimersByTime(5000);
      http.expectOne(STATUS_URL).flush({ state: 'ready', installed: true });
      await settle(fixture);
      expect(site.reload).toHaveBeenCalledTimes(1);
    });

    it('every 30 seconds unless the site says otherwise; while unavailable, and while set up once but not answering', async () => {
      setUp();
      status.report('unavailable');
      await draw();

      vi.advanceTimersByTime(29_000);
      http.expectNone(STATUS_URL);
      vi.advanceTimersByTime(1000);
      http.expectOne(STATUS_URL).flush({ code: 'not_set_up', installed: true }, { status: 503, statusText: 'Service Unavailable' });
      await settle(fixture);
      expect(title()).toBe('The site is not available right now');

      vi.advanceTimersByTime(30_000);
      http.expectOne(STATUS_URL).flush({ state: 'ready', installed: true });
      await settle(fixture);
      expect(site.reload).toHaveBeenCalledTimes(1);
    });

    it("on the ADMIN's page too: another administrator may apply the update meanwhile", async () => {
      setUp();
      site.admin.set(true);
      status.report('update_pending');
      await draw();
      expect(title()).toBe('A database update is waiting');

      vi.advanceTimersByTime(30_000);
      http.expectOne(STATUS_URL).flush({ state: 'ready', installed: true });
      await settle(fixture);
      expect(site.reload).toHaveBeenCalledTimes(1);
    });

    it('not on a site that was never set up', async () => {
      setUp();
      status.report('not_set_up', false);
      await draw();
      vi.advanceTimersByTime(120_000);
      http.expectNone(STATUS_URL);
    });

    it('stops when the page goes', async () => {
      setUp();
      status.report('update_pending');
      await draw();
      fixture.destroy();
      vi.advanceTimersByTime(120_000);
      http.expectNone(STATUS_URL);
    });

    it('Try again asks now, and the page reloads once the site is back', async () => {
      setUp();
      status.report('unavailable');
      await draw();

      button('Try again').click();
      http.expectOne(STATUS_URL).flush({ state: 'unavailable', installed: true });
      await settle(fixture);
      expect(site.reload).not.toHaveBeenCalled();

      button('Try again').click();
      http.expectOne(STATUS_URL).flush({ state: 'ready', installed: true });
      await settle(fixture);
      expect(site.reload).toHaveBeenCalledTimes(1);
    });
  });
});
