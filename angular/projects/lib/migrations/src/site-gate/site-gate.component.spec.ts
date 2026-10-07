import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { SiteStatus } from '../site-status.service';
import { STATUS_URL, TestSite, provideTestSite, settle, testSite, words } from '../testing';
import { SiteGateComponent } from './site-gate.component';

@Component({
  selector: 'anotoki-test-site',
  imports: [SiteGateComponent],
  template: '<anotoki-site-gate><p id="page">The site itself</p></anotoki-site-gate>',
})
class TestSiteComponent {}

@Component({ selector: 'anotoki-test-page', template: '' })
class TestPageComponent {}

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
