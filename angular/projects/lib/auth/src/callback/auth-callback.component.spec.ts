import { TestBed } from '@angular/core/testing';
import { Component, EnvironmentProviders, Provider, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AnotokiAuth } from '../auth.service';
import { authError } from '../client/oidc-client';
import { AnotokiAuthConfig } from '../config';
import { SpecSite, provideSpecAuth, settle, specSite } from '../testing';
import { AuthCallbackComponent } from './auth-callback.component';

@Component({ selector: 'anotoki-spec-home', template: 'home' })
class HomeComponent {}

describe('<anotoki-auth-callback>: the one page of signing in a visitor sees', () => {
  let site: SpecSite;

  async function render(options: { failure?: string; language?: string; boot?: boolean; config?: Partial<AnotokiAuthConfig>; providers?: (Provider | EnvironmentProviders)[] } = {}) {
    site = specSite({ login_required: false });
    if (options.boot === false) {
      site.boot = null;
    }
    if (options.failure) {
      site.prepare = (client) => (client.initResult = { returnTo: '/quiz/3', error: authError(options.failure ?? 'x', 'The IAM said <b>no</b>'), silent: false });
    }
    TestBed.configureTestingModule({
      providers: [
        ...provideSpecAuth(site, { language: () => options.language ?? 'en', ...options.config }, [
          { path: 'auth/callback', component: AuthCallbackComponent },
          { path: 'quiz/3', component: HomeComponent },
          { path: '', component: HomeComponent },
        ]),
        ...(options.providers ?? []),
      ],
    });
    await TestBed.inject(AnotokiAuth).init();
    await TestBed.inject(Router).navigateByUrl('/auth/callback');
    const fixture = TestBed.createComponent(AuthCallbackComponent);
    await fixture.whenStable();
    return fixture;
  }

  const robots = (): string | null => document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? null;

  it('opened by hand: "Signing you in…", and on to the home page - never indexed', async () => {
    const fixture = await render();
    expect(fixture.nativeElement.textContent.trim()).toBe('Signing you in…');
    expect(fixture.nativeElement.querySelector('[role="status"]')?.classList).toContain('anotoki-auth-callback__panel');
    expect(robots()).toBe('noindex');
    await settle();
    expect(TestBed.inject(Router).url).toBe('/');
    fixture.destroy();
    expect(robots()).toBeNull();
  });

  it("keeps a robots tag of the site's, and gives it back", async () => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'index, follow';
    document.head.appendChild(tag);
    const fixture = await render();
    expect(robots()).toBe('noindex');
    fixture.destroy();
    expect(robots()).toBe('index, follow');
    tag.remove();
  });

  it("a failure in the page's language, from its code alone - and Try again, Back, the kit's buttons", async () => {
    const fixture = await render({ failure: 'access_denied', language: 'sk' });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Prihlásenie sa nedokončilo.');
    expect(element.querySelector('[role="alert"]')?.classList).toContain('anotoki-auth-callback__message');
    expect(element.textContent).not.toContain('IAM said');
    expect(element.querySelector('section')?.getAttribute('lang')).toBe('sk');
    const [retry, back] = Array.from(element.querySelectorAll('button'));
    expect([retry.textContent?.trim(), back.textContent?.trim()]).toEqual(['Skúsiť znova', 'Späť']);
    expect(retry.classList).toContain('anotoki-button--primary');
    expect(back.classList).toContain('anotoki-button--secondary');
    expect([retry.type, back.type]).toEqual(['button', 'button']);

    retry.click();
    await settle();
    expect(site.client?.logins).toEqual([{ returnTo: '/quiz/3', uiLocales: 'sk' }]);

    back.click();
    await settle();
    expect(TestBed.inject(AnotokiAuth).signInFailure()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/quiz/3');
  });

  it('a sign-in that cannot be set up: said so, and Try again loads the page afresh', async () => {
    const fixture = await render({ boot: false });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Signing in is not available right now. Try again in a few minutes.');
    expect(element.querySelectorAll('button')).toHaveLength(1);
    element.querySelector('button')?.click();
    expect(site.browser.reloads).toBe(1);
  });

  it("an owner's rewording in the site's database, through the translations module - the library's words under it", async () => {
    const fixture = await render({
      failure: 'access_denied',
      providers: provideTestTranslations({ 'anotoki.signIn.notCompleted': 'Prihlásiť ťa nevyšlo.' }, { language: 'sk', english: {} }),
      config: { language: () => inject(TranslationService).language(), translate: (key) => inject(TranslationService).libraryWord(key) },
    });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Prihlásiť ťa nevyšlo.');
    expect(element.querySelector('[data-back]')?.textContent?.trim()).toBe('Späť');
    expect(element.querySelector('section')?.getAttribute('lang')).toBe('sk');
  });
});
