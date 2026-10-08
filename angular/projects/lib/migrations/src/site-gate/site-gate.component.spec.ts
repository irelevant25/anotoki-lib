import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { SiteStatus } from '../site-status.service';
import { STATUS_URL, TestSite, provideTestSite, settle, testSite, words } from '../testing';
import { SiteGateComponent } from './site-gate.component';
import { SitePagesDirective } from './site-pages.directive';

@Component({
  selector: 'anotoki-test-site',
  imports: [SiteGateComponent],
  template: '<anotoki-site-gate><p id="page">The site itself</p></anotoki-site-gate>',
})
class TestSiteComponent {}

@Component({ selector: 'anotoki-test-page', template: '' })
class TestPageComponent {}

/** Counts how often a page is made: a page behind the status page must not be. */
let made = 0;

@Component({ selector: 'anotoki-counted-page', template: '<p id="counted">Counted</p>' })
class CountedPageComponent {
  constructor() {
    made += 1;
  }
}

@Component({
  selector: 'anotoki-test-templated-site',
  imports: [SiteGateComponent, SitePagesDirective, CountedPageComponent],
  template: '<anotoki-site-gate><ng-template anotokiSitePages><anotoki-counted-page /></ng-template></anotoki-site-gate>',
})
class TemplatedSiteComponent {}

/** The 0.1.0 form with a leading @if: its block is content, never "the pages" drawn for everybody. */
@Component({
  selector: 'anotoki-test-if-site',
  imports: [SiteGateComponent],
  template: `
    <anotoki-site-gate>
      @if (booted()) {
        <p id="booted">The app</p>
      } @else {
        <p id="booting">Loading</p>
      }
    </anotoki-site-gate>
  `,
})
class IfSiteComponent {
  readonly booted = signal(false);
}

/** The same with @switch. */
@Component({
  selector: 'anotoki-test-switch-site',
  imports: [SiteGateComponent],
  template: `
    <anotoki-site-gate>
      @switch (state()) {
        @case ('ready') {
          <p id="app">The app</p>
        }
        @case ('signed-out') {
          <p id="sign-in">Sign in</p>
        }
      }
    </anotoki-site-gate>
  `,
})
class SwitchSiteComponent {
  readonly state = signal<'ready' | 'signed-out'>('signed-out');
}

/** A marked template holding control flow of its own (Japanese Academy's form): made only while open, and its blocks follow their own conditions. */
@Component({
  selector: 'anotoki-test-marked-switch-site',
  imports: [SiteGateComponent, SitePagesDirective, CountedPageComponent],
  template: `
    <anotoki-site-gate>
      <ng-template anotokiSitePages>
        @switch (state()) {
          @case ('ready') {
            <anotoki-counted-page />
          }
          @case ('signed-out') {
            <p id="sign-in">Sign in</p>
          }
        }
      </ng-template>
    </anotoki-site-gate>
  `,
})
class MarkedSwitchSiteComponent {
  readonly state = signal<'ready' | 'signed-out'>('signed-out');
}

/** The 0.1.1 form: an unmarked template. Since 0.2.0 it is not the pages - nothing is drawn, and development says why. */
@Component({
  selector: 'anotoki-test-unmarked-site',
  imports: [SiteGateComponent, CountedPageComponent],
  template: '<anotoki-site-gate><ng-template><anotoki-counted-page /></ng-template></anotoki-site-gate>',
})
class UnmarkedSiteComponent {}

describe('<anotoki-site-gate>: the site, or the status page', () => {
  let site: TestSite;
  let status: SiteStatus;
  let http: HttpTestingController;
  let fixture: ComponentFixture<TestSiteComponent>;
  let host: HTMLElement;

  const page = () => host.querySelector('#page');
  const statusPage = () => host.querySelector('anotoki-site-status');

  beforeEach(() => {
    site = testSite();
    TestBed.configureTestingModule({ providers: provideTestSite(site, {}, [{ path: '**', component: TestPageComponent }]) });
    status = TestBed.inject(SiteStatus);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(TestSiteComponent);
    host = fixture.nativeElement;
    await settle(fixture);
  }

  async function go(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await settle(fixture);
  }

  it('shows the site while nothing is known yet, and asks the server once', async () => {
    await draw();
    expect(page()).not.toBeNull();
    expect(statusPage()).toBeNull();

    http.expectOne(STATUS_URL).flush({ state: 'ready', installed: true });
    await settle(fixture);
    expect(page()).not.toBeNull();
  });

  it('does not ask again what the boot asked already', async () => {
    status.markReady();
    await draw();
    http.expectNone(STATUS_URL);
    expect(page()).not.toBeNull();
  });

  it('an update waits: a visitor and a signed-in member get the status page, on every route', async () => {
    status.report('update_pending');
    await draw();
    expect(page()).toBeNull();
    expect(words(statusPage())).toContain('The site is being updated');

    site.signedIn.set(true);
    await go('/admin/migrations');
    expect(page()).toBeNull();
    expect(words(statusPage())).toContain('The site is being updated');
  });

  it('an update waits: the ADMIN reaches the Migrations page and nothing else - following the router', async () => {
    site.admin.set(true);
    site.signedIn.set(true);
    status.report('update_pending');
    await draw();
    expect(page()).toBeNull();
    expect(words(statusPage())).toContain('A database update is waiting');

    await go('/admin/migrations');
    expect(page()).not.toBeNull();
    expect(statusPage()).toBeNull();

    await go('/admin/migrations/history?page=2');
    expect(page()).not.toBeNull();

    await go('/admin/migrationsx');
    expect(page()).toBeNull();

    await go('/admin');
    expect(page()).toBeNull();
    expect(words(statusPage())).toContain('A database update is waiting');
  });

  it('not set up, or unavailable: the status page for everybody, the ADMIN on the Migrations route too', async () => {
    site.admin.set(true);
    status.report('not_set_up', false);
    await draw();
    await go('/admin/migrations');
    expect(page()).toBeNull();
    expect(words(statusPage())).toContain('This site is not set up yet');

    status.report('unavailable');
    await settle(fixture);
    expect(page()).toBeNull();
    expect(words(statusPage())).toContain('The site is not available right now');
  });

  it('pages given as a template are made only while the site is open - never behind the status page', async () => {
    made = 0;
    status.report('update_pending');
    const templated = TestBed.createComponent(TemplatedSiteComponent);
    await settle(templated);
    expect(made).toBe(0);
    expect(templated.nativeElement.querySelector('#counted')).toBeNull();
    expect(words(templated.nativeElement.querySelector('anotoki-site-status'))).toContain('The site is being updated');

    status.markReady();
    await settle(templated);
    expect(made).toBe(1);
    expect(templated.nativeElement.querySelector('#counted')).not.toBeNull();
    expect(templated.nativeElement.querySelector('anotoki-site-status')).toBeNull();
  });

  it('pages given as they are (no template) still show as before', async () => {
    status.markReady();
    await draw();
    expect(page()).not.toBeNull();
  });

  describe('the content is control flow (a site still on the 0.1.0 form): its blocks follow their own conditions', () => {
    it('@if: only the branch its condition picks - never its first block drawn for everybody', async () => {
      status.markReady();
      const site = TestBed.createComponent(IfSiteComponent);
      await settle(site);
      const at = (selector: string) => site.nativeElement.querySelector(selector);
      expect(at('#booting')).not.toBeNull();
      expect(at('#booted')).toBeNull();

      site.componentInstance.booted.set(true);
      await settle(site);
      expect(at('#booted')).not.toBeNull();
      expect(at('#booting')).toBeNull();

      status.report('update_pending');
      await settle(site);
      expect(at('#booted')).toBeNull();
      expect(at('anotoki-site-status')).not.toBeNull();
    });

    it('@switch: only the case its value picks', async () => {
      status.markReady();
      const site = TestBed.createComponent(SwitchSiteComponent);
      await settle(site);
      const at = (selector: string) => site.nativeElement.querySelector(selector);
      expect(at('#sign-in')).not.toBeNull();
      expect(at('#app')).toBeNull();

      site.componentInstance.state.set('ready');
      await settle(site);
      expect(at('#app')).not.toBeNull();
      expect(at('#sign-in')).toBeNull();
    });

    it('a marked template with control flow inside: made only while open, its blocks following their conditions', async () => {
      made = 0;
      status.report('update_pending');
      const site = TestBed.createComponent(MarkedSwitchSiteComponent);
      await settle(site);
      const at = (selector: string) => site.nativeElement.querySelector(selector);
      expect(at('#sign-in')).toBeNull();
      expect(at('anotoki-site-status')).not.toBeNull();

      status.markReady();
      await settle(site);
      expect(at('#sign-in')).not.toBeNull();
      expect(made).toBe(0);

      site.componentInstance.state.set('ready');
      await settle(site);
      expect(made).toBe(1);
      expect(at('#counted')).not.toBeNull();
    });
  });

  it('an unmarked <ng-template> (the 0.1.1 form) is not the pages: nothing is drawn, and development says how to mark it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    made = 0;
    status.markReady();
    const site = TestBed.createComponent(UnmarkedSiteComponent);
    await settle(site);
    expect(made).toBe(0);
    expect(site.nativeElement.querySelector('#counted')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('anotokiSitePages');
    warn.mockRestore();
  });

  it('shows the site again the moment it is ready', async () => {
    status.report('update_pending');
    await draw();
    expect(page()).toBeNull();

    status.markReady();
    await settle(fixture);
    expect(page()).not.toBeNull();
    expect(statusPage()).toBeNull();
  });
});
