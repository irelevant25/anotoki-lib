import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideAnotokiUi } from '@anotoki/lib/ui/config';
import { firstValueFrom } from 'rxjs';
import { AnotokiMigrationsConfig } from './config';
import { SiteGateComponent } from './site-gate/site-gate.component';
import { SitePagesDirective } from './site-gate/site-pages.directive';
import { SiteStatus } from './site-status.service';
import { SiteStatusComponent } from './site-status/site-status.component';
import { STATUS_URL, TestSite, provideTestSite, settle, testSite, words } from './testing';

@Component({ selector: 'anotoki-test-page', template: '<p id="page">The site itself</p>' })
class TestPageComponent {}

@Component({
  selector: 'anotoki-test-site',
  imports: [SiteGateComponent, SitePagesDirective, TestPageComponent],
  template: '<anotoki-site-gate><ng-template anotokiSitePages><anotoki-test-page /></ng-template></anotoki-site-gate>',
})
class TestSiteComponent {}

const CLOSED = { status: 503, statusText: 'Service Unavailable' };

/** Settles until `ready()` holds (the closed sign is loaded with import(), a few turns after it is asked for). */
async function until(fixture: ComponentFixture<unknown>, ready: () => boolean): Promise<void> {
  for (let turn = 0; turn < 20 && !ready(); turn++) {
    await settle(fixture);
  }
}

/** Closed for maintenance (0.11.0): the site settings' "Getting in", in the family's status, gate and closed sign. */
describe('Closed for maintenance', () => {
  let site: TestSite;
  let status: SiteStatus;
  let http: HttpTestingController;

  function setUp(extra: Partial<AnotokiMigrationsConfig> = {}): void {
    site = testSite();
    TestBed.configureTestingModule({
      providers: [...provideTestSite(site, extra, [{ path: '**', component: TestPageComponent }]), provideAnotokiUi(() => ({ language: site.language }))],
    });
    status = TestBed.inject(SiteStatus);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  describe('SiteStatus', () => {
    it('hears it from the status path, with the message, and is blocked for everybody but the ADMIN', async () => {
      setUp();
      const asked = status.check();
      http.expectOne(STATUS_URL).flush({ state: 'maintenance', installed: true, maintenance_message: { en: 'Back at six', sk: 'Späť o šiestej', de: 5, fr: ['x'] } });

      expect(await asked).toBe('maintenance');
      expect(status.state()).toBe('maintenance');
      expect(status.maintenanceMessage()).toEqual({ en: 'Back at six', sk: 'Späť o šiestej' });
      expect(status.blocked()).toBe(true);
      site.admin.set(true);
      expect(status.blocked()).toBe(false);
    });

    it('forgets the message once the site is anything else', () => {
      setUp();
      status.report('maintenance', true, { en: 'Back at six' });
      status.report('ready');
      expect(status.maintenanceMessage()).toEqual({});
      status.report('maintenance', true, 'nonsense');
      expect(status.maintenanceMessage()).toEqual({});
    });

    it("hears it from any API answer's 503, the request failing as before", async () => {
      setUp();
      const client = TestBed.inject(HttpClient);
      const request = firstValueFrom(client.get('/api/quiz'));
      http.expectOne('/api/quiz').flush({ code: 'maintenance', message: 'The site is closed for maintenance. Try again later.', maintenance_message: { sk: 'Späť o šiestej' } }, CLOSED);

      const error = await request.then(
        () => null,
        (failure: HttpErrorResponse) => failure,
      );
      expect(error?.status).toBe(503);
      expect(status.state()).toBe('maintenance');
      expect(status.maintenanceMessage()).toEqual({ sk: 'Späť o šiestej' });
    });
  });

  describe('<anotoki-site-gate>', () => {
    let fixture: ComponentFixture<TestSiteComponent>;
    const page = () => fixture.nativeElement.querySelector('#page');
    const closedSign = () => words(fixture.nativeElement.querySelector('anotoki-maintenance-page h1'));

    async function draw(): Promise<void> {
      fixture = TestBed.createComponent(TestSiteComponent);
      await until(fixture, () => closedSign() !== null || page() !== null);
    }

    async function go(url: string): Promise<void> {
      await TestBed.inject(Router).navigateByUrl(url);
      await settle(fixture);
    }

    it('a visitor and a signed-in member get the closed sign on every page; the ADMIN sees the site as it is', async () => {
      setUp();
      status.report('maintenance', true, {});
      await draw();
      expect(page()).toBeNull();
      expect(closedSign()).toBe('Back shortly');

      site.signedIn.set(true);
      await go('/quizzes');
      expect(page()).toBeNull();

      site.admin.set(true);
      await settle(fixture);
      expect(page()).not.toBeNull();
      expect(fixture.nativeElement.querySelector('anotoki-site-status')).toBeNull();
    });

    it("the sign-in's way back, the legal pages, About and Support stay open to anybody - nothing that merely begins the same", async () => {
      setUp();
      status.report('maintenance', true, {});
      await draw();
      for (const url of ['/auth/callback?code=x&state=y', '/terms', '/privacy', '/contact', '/about', '/support', '/support/x']) {
        await go(url);
        expect(page(), url).not.toBeNull();
      }
      for (const url of ['/termsx', '/authors', '/', '/staff']) {
        await go(url);
        expect(page(), url).toBeNull();
      }
    });

    it("a site's own open routes, in place of the family's", async () => {
      setUp({ openWhileClosed: ['/rules'] });
      status.report('maintenance', true, {});
      await draw();
      await go('/rules');
      expect(page()).not.toBeNull();
      await go('/terms');
      expect(page()).toBeNull();
    });
  });

  describe('<anotoki-site-status> and the closed sign it loads', () => {
    let fixture: ComponentFixture<SiteStatusComponent>;
    let host: HTMLElement;

    const sign = () => host.querySelector('anotoki-maintenance-page');
    const paragraphs = () => Array.from(host.querySelectorAll('p')).map(words);
    const staffButton = () => host.querySelector<HTMLButtonElement>('[data-staff-sign-in]');

    async function draw(): Promise<void> {
      fixture = TestBed.createComponent(SiteStatusComponent);
      host = fixture.nativeElement;
      await until(fixture, () => sign() !== null);
    }

    it("says the administrators' message in the reader's language, keeping its lines - never a door on the page the public lands on", async () => {
      setUp();
      site.language.set('sk');
      status.report('maintenance', true, { en: 'Back at six', sk: 'Späť o šiestej.\nVydrž.' });
      await draw();

      expect(words(host.querySelector('h1'))).toBe('Hneď sme späť');
      const message = host.querySelector('[data-maintenance-message]')!;
      expect(message.textContent).toBe('Späť o šiestej.\nVydrž.');
      expect(message.getAttribute('lang')).toBeNull();
      expect(host.querySelector('section')?.getAttribute('role')).toBe('status');
      expect(host.querySelectorAll('button, a').length).toBe(0);
      expect(host.textContent).not.toMatch(/maintenance_mode|503|setup/i);
    });

    it("English where the reader's language has none, marked so; the built-in sentence where nothing is written - never blank", async () => {
      setUp();
      site.language.set('sk-SK');
      status.report('maintenance', true, { en: 'Back at six' });
      await draw();
      expect(host.querySelector('[data-maintenance-message]')?.getAttribute('lang')).toBe('en');
      expect(words(host.querySelector('[data-maintenance-message]'))).toBe('Back at six');

      status.report('maintenance', true, { sk: '   ' });
      await settle(fixture);
      expect(host.querySelector('[data-maintenance-message]')).toBeNull();
      expect(paragraphs()).toEqual(['Stránka je na chvíľu zatvorená, kým niečo opravujeme. Táto stránka sa obnoví sama, keď bude späť.']);
    });

    it('at the staff route, Sign in - back to the home page afterwards; not for somebody signed in already', async () => {
      setUp();
      status.report('maintenance', true, {});
      await TestBed.inject(Router).navigateByUrl('/staff');
      await draw();

      expect(paragraphs()).toEqual([
        'The site is closed for a moment while something is being fixed. This page reloads by itself once it is back.',
        'An administrator can sign in here and use the site while it is closed.',
      ]);
      staffButton()!.click();
      expect(site.signIn).toHaveBeenCalledWith('/');

      site.signedIn.set(true);
      await settle(fixture);
      expect(staffButton()).toBeNull();
    });

    it("a site's own staff route", async () => {
      setUp({ staffRoute: '/team' });
      status.report('maintenance', true, {});
      await TestBed.inject(Router).navigateByUrl('/staff');
      await draw();
      expect(staffButton()).toBeNull();
      await TestBed.inject(Router).navigateByUrl('/team');
      await settle(fixture);
      expect(staffButton()).not.toBeNull();
    });

    it('asks again by itself and reloads once the site is open', async () => {
      setUp({ retrySeconds: 5 });
      status.report('maintenance', true, {});
      await draw();
      vi.useFakeTimers();
      // A new page under fake timers: its timer is theirs.
      fixture.destroy();
      fixture = TestBed.createComponent(SiteStatusComponent);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(5000);
      http.expectOne(STATUS_URL).flush({ state: 'maintenance', installed: true, maintenance_message: { en: 'Nearly' } });
      await vi.advanceTimersByTimeAsync(0);
      expect(site.reload).not.toHaveBeenCalled();
      expect(status.maintenanceMessage()).toEqual({ en: 'Nearly' });

      await vi.advanceTimersByTimeAsync(5000);
      http.expectOne(STATUS_URL).flush({ state: 'ready', installed: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(site.reload).toHaveBeenCalledTimes(1);
      fixture.destroy();
    });
  });
});
