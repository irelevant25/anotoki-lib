import { TestBed } from '@angular/core/testing';
import { Component, EnvironmentProviders, Provider } from '@angular/core';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AnotokiAuth } from '../auth.service';
import { authError } from '../client/oidc-client';
import { AnotokiAuthConfig } from '../config';
import { personGuard } from '../guards';
import { SpecSite, provideSpecAuth, settle, specSite } from '../testing';
import { SignInFailureComponent } from './sign-in-failure.component';

@Component({ selector: 'anotoki-spec-page', template: 'page' })
class PageComponent {}

describe('<anotoki-sign-in-failure>: the screen of a sign-in that came back without one, on a route of the site', () => {
  let site: SpecSite;

  async function start(options: { failure?: string; returnTo?: string; boot?: boolean; language?: string; config?: Partial<AnotokiAuthConfig>; providers?: (Provider | EnvironmentProviders)[] } = {}) {
    site = specSite({ login_required: true });
    if (options.boot === false) {
      site.boot = null;
    }
    if (options.failure) {
      site.prepare = (client) => (client.initResult = { returnTo: options.returnTo ?? '/learn', error: authError(options.failure ?? 'x', 'The IAM said no'), silent: false });
    }
    TestBed.configureTestingModule({
      providers: [
        ...provideSpecAuth(site, { failureRoute: '/sign-in-failed', language: () => options.language ?? 'en', ...options.config }, [
          { path: 'sign-in-failed', component: SignInFailureComponent },
          { path: 'auth/callback', component: PageComponent },
          { path: 'learn', component: PageComponent, canActivate: [personGuard] },
          { path: '', component: PageComponent },
        ]),
        ...(options.providers ?? []),
      ],
    });
    await TestBed.inject(AnotokiAuth).init();
    return RouterTestingHarness.create();
  }

  async function go(harness: RouterTestingHarness, url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    await settle();
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  const robots = (): string | null => document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? null;
  const url = () => TestBed.inject(Router).url;

  afterEach(() => document.head.querySelector('meta[name="robots"]')?.remove());

  it("the guards send a failed sign-in to the site's own route: a heading, why - from the code alone - and the kit's buttons, in the visitor's language", async () => {
    const harness = await start({ failure: 'access_denied', language: 'sk' });
    const element = await go(harness, '/learn');
    expect(url()).toBe('/sign-in-failed');
    expect(element.classList).toContain('anotoki-sign-in-failure');

    const section = element.querySelector('section')!;
    const heading = element.querySelector('h1')!;
    expect(heading.textContent?.trim()).toBe('Prihlásenie sa nepodarilo');
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(section.getAttribute('lang')).toBe('sk');
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Prihlásenie sa nedokončilo.');
    expect(element.textContent).not.toContain('IAM said');
    const [retry, back] = Array.from(element.querySelectorAll('button'));
    expect([retry.textContent?.trim(), back.textContent?.trim()]).toEqual(['Skúsiť znova', 'Späť']);
    expect(retry.classList).toContain('anotoki-button--primary');
    expect(back.classList).toContain('anotoki-button--secondary');
    expect(robots()).toBe('noindex');
    expect(site.client?.logins).toEqual([]);

    retry.click();
    await settle();
    expect(site.client?.logins).toEqual([{ returnTo: '/learn', uiLocales: 'sk' }]);
  });

  it('Back: to where the sign-in started, without signing in - the failure put away', async () => {
    const harness = await start({ failure: 'access_denied', returnTo: '/?tab=2' });
    const element = await go(harness, '/sign-in-failed');
    element.querySelector<HTMLButtonElement>('[data-back]')!.click();
    await settle();
    expect(TestBed.inject(AnotokiAuth).signInFailure()).toBeNull();
    expect(url()).toBe('/?tab=2');
  });

  it('Back never lands on the callback or on this screen again: home instead', async () => {
    for (const returnTo of ['/sign-in-failed', '/auth/callback?code=x', '//elsewhere.test/']) {
      TestBed.resetTestingModule();
      const harness = await start({ failure: 'access_denied', returnTo });
      const element = await go(harness, '/sign-in-failed');
      element.querySelector<HTMLButtonElement>('[data-back]')!.click();
      await settle();
      expect(url(), returnTo).toBe('/');
    }
  });

  it('every code worded: storage refused, too late, anything else by its code - never a sentence of the IAM', async () => {
    const said: Record<string, string> = {
      storage_unavailable: "This browser does not let the site remember a sign-in. Allow the site's storage, then try again.",
      state_mismatch: 'The sign-in took too long or did not start on this page. Try again.',
      server_error: 'The sign-in failed (server_error).',
      'not a code!': 'The sign-in failed (unknown).',
    };
    for (const [code, words] of Object.entries(said)) {
      TestBed.resetTestingModule();
      const element = await go(await start({ failure: code }), '/sign-in-failed');
      expect(element.querySelector('h1')?.textContent?.trim(), code).toBe('Signing in did not work');
      expect(element.querySelector('[role="alert"]')?.textContent?.trim(), code).toBe(words);
    }
  });

  it('a sign-in that cannot be set up: said so, Try again alone, which loads the page afresh', async () => {
    const harness = await start({ boot: false });
    const element = await go(harness, '/learn');
    expect(url()).toBe('/sign-in-failed');
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Signing in is not available right now. Try again in a few minutes.');
    expect(element.querySelectorAll('button')).toHaveLength(1);
    element.querySelector('button')!.click();
    expect(site.browser.reloads).toBe(1);
  });

  it('nothing to say - opened by hand: on to the home page, and the robots tag as it was', async () => {
    const harness = await start();
    await go(harness, '/sign-in-failed');
    expect(url()).toBe('/');
    expect(robots()).toBeNull();
  });

  it("the site's own words, per language", async () => {
    const harness = await start({ failure: 'access_denied', config: { words: { en: { failedTitle: 'You are not signed in' } } } });
    const element = await go(harness, '/sign-in-failed');
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('You are not signed in');
    expect(element.querySelector('section')?.getAttribute('lang')).toBe('en');
  });
});
