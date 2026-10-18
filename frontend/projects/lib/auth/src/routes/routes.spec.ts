import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AnotokiAuth, AuthCallbackComponent, SignInFailureComponent, personGuard } from '@anotoki/lib/auth';
import { authError } from '@anotoki/lib/auth/core';
import * as screens from '@anotoki/lib/auth/screens';
import { provideSpecAuth, settle, specSite } from '../testing';

@Component({ selector: 'anotoki-spec-page', template: 'page' })
class PageComponent {}

/**
 * The routes of before - `component: AuthCallbackComponent` and `SignInFailureComponent` from @anotoki/lib/auth -
 * keep working: each is a route of its own that loads its screen from @anotoki/lib/auth/screens as it is shown,
 * so neither screen's code is in a site's first load (0.5.0).
 */
describe('the screens as a route of before names them: loaded as the route is shown', () => {
  async function start(failure: string | null) {
    const site = specSite({ login_required: true });
    if (failure) {
      site.prepare = (client) => (client.initResult = { returnTo: '/learn', error: authError(failure, 'The IAM said no'), silent: false });
    }
    TestBed.configureTestingModule({
      providers: provideSpecAuth(site, { failureRoute: '/sign-in-failed' }, [
        { path: 'auth/callback', component: AuthCallbackComponent },
        { path: 'sign-in-failed', component: SignInFailureComponent },
        { path: 'learn', component: PageComponent, canActivate: [personGuard] },
        { path: '', component: PageComponent },
      ]),
    });
    await TestBed.inject(AnotokiAuth).init();
    return RouterTestingHarness.create();
  }

  async function go(harness: RouterTestingHarness, url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    for (let turn = 0; turn < 3; turn++) {
      await settle();
      harness.detectChanges();
    }
    return harness.routeNativeElement as HTMLElement;
  }

  afterEach(() => document.head.querySelector('meta[name="robots"]')?.remove());

  it('are not the screens themselves - each is a route that holds its screen', () => {
    expect(AuthCallbackComponent).not.toBe(screens.AuthCallbackComponent);
    expect(SignInFailureComponent).not.toBe(screens.SignInFailureComponent);
  });

  it('the failure route: the failure screen, loaded into it, as the guards send a failed sign-in there', async () => {
    const harness = await start('access_denied');
    const route = await go(harness, '/learn');

    expect(TestBed.inject(Router).url).toBe('/sign-in-failed');
    expect(route.localName).toBe('anotoki-sign-in-failure-route');
    const screen = route.querySelector('anotoki-sign-in-failure');
    expect(screen?.classList).toContain('anotoki-sign-in-failure');
    expect(screen?.querySelector('h1')?.textContent?.trim()).toBe('Signing in did not work');
    expect(screen?.querySelectorAll('button')).toHaveLength(2);
  });

  it('the callback route: the callback page, loaded into it - with the failure in its place', async () => {
    const harness = await start('server_error');
    const route = await go(harness, '/auth/callback');

    expect(route.localName).toBe('anotoki-auth-callback-route');
    const page = route.querySelector('anotoki-auth-callback');
    expect(page?.classList).toContain('anotoki-auth-callback--failed');
    expect(page?.querySelector('anotoki-sign-in-failure h1')?.textContent?.trim()).toBe('Signing in did not work');
  });

  it('a route left before its screen came puts nothing anywhere', async () => {
    const harness = await start('access_denied');
    await harness.navigateByUrl('/sign-in-failed');
    await harness.navigateByUrl('/');
    await settle();
    harness.detectChanges();
    expect(document.querySelector('anotoki-sign-in-failure')).toBeNull();
  });
});
