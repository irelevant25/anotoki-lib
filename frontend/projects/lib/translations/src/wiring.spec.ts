import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnotokiAuth } from '@anotoki/lib/auth';
import { SiteStatus, SiteStatusComponent, provideAnotokiMigrations } from '@anotoki/lib/migrations';
import { LanguageSwitcherComponent, provideAnotokiShell } from '@anotoki/lib/shell';
import { ANOTOKI_UI_CONFIG, AnotokiWords, provideAnotokiUi } from '@anotoki/lib/ui';
import { AnotokiTranslationsConfig } from './config';
import { siteStatusWords } from './site-status-words';
import { ENGLISH, OFFLINE, SK_BUNDLE, SLOVAK, TranslationsSite, later, settled, translationsProviders, translationsSite } from './testing';
import { TranslationService } from './translation.service';

/** The Slovak bundle of a site whose owner reworded the status page's heading. */
const REWORDED = {
  ...SK_BUNDLE,
  values: { ...SLOVAK, 'anotoki.siteStatus.updatingTitle': 'Aktualizujeme, chvíľu strpenia' },
  english: { ...ENGLISH, 'anotoki.siteStatus.updatingTitle': 'Updating - back soon' },
};

describe('the wiring: the kit’s words, the shell’s switcher and the status page, from the translations', () => {
  let site: TranslationsSite;
  let browser: ReturnType<typeof vi.spyOn>;

  function setUp(extra: Partial<AnotokiTranslationsConfig> = {}, more: (Provider | EnvironmentProviders)[] = []): TranslationService {
    TestBed.configureTestingModule({
      providers: [
        ...translationsProviders(site, { waits: { retry: 0 }, ...extra }),
        provideRouter([]),
        provideAnotokiUi(() => ({ ...inject(TranslationService).forKit(), words: { sk: { 'ui.copy': 'Skopíruj' } } })),
        provideAnotokiShell(() => ({ languages: inject(TranslationService).forShell() })),
        ...more,
      ],
    });
    return TestBed.inject(TranslationService);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    browser = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['sk']);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    site = translationsSite();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('forKit(): the kit reads the database first', () => {
    it('an owner’s rewording wins over the built-in words; the kit’s own fallbacks stay under it', async () => {
      const i18n = setUp({ libraryWords: { sk: { 'anotoki.ui.or': 'či' } } });
      await i18n.init();
      const words = TestBed.inject(AnotokiWords);

      expect(words.language()).toBe('sk');
      // The database's string (the owner reworded it on the Translations page) ...
      expect(words.t('topbar.account')).toBe('Tvoj účet anotoki (prepísané)');
      // ... the site's own words for a library key ...
      expect(words.t('ui.or')).toBe('či');
      // ... the site's kit words (provideAnotokiUi's), then the kit's built-in Slovak.
      expect(words.t('ui.copy')).toBe('Skopíruj');
      expect(words.t('ui.close')).toBe('Zavrieť');
      expect(words.t('topbar.menuButton', { name: 'Mira' })).toBe('Tvoja ponuka: Mira');
    });

    it('follows the language and the strings as they change - English in the English areas', async () => {
      const i18n = setUp();
      await i18n.init();
      const words = TestBed.inject(AnotokiWords);
      expect(words.t('topbar.account')).toBe('Tvoj účet anotoki (prepísané)');

      i18n.noteAddress('/admin/translations');
      expect(words.language()).toBe('en');
      expect(words.t('topbar.account')).toBe('Your anotoki account (reworded)');
      expect(words.t('ui.close')).toBe('Close');

      i18n.noteAddress('/');
      site.respond = () => Promise.resolve({ ...SK_BUNDLE, values: { ...SLOVAK, 'anotoki.topbar.account': 'Účet' } });
      await i18n.reload();
      expect(words.t('topbar.account')).toBe('Účet');
    });

    it("gives the kit its locale (0.11.0), which the kit's dates write in: the page's, en-GB in the English areas", async () => {
      const i18n = setUp();
      await i18n.init();
      const config = TestBed.inject(ANOTOKI_UI_CONFIG);
      expect(config.locale?.()).toBe('sk-SK');
      i18n.noteAddress('/admin/translations');
      expect(config.locale?.()).toBe('en-GB');
    });

    it("with no database at all, the kit says its own words - in the reader's language where it has them, else English", async () => {
      site.respond = () => Promise.reject(new Error('offline'));
      const i18n = setUp();
      await i18n.init();
      expect(i18n.ready()).toBe(false);
      expect(TestBed.inject(AnotokiWords).t('topbar.account')).toBe('Tvoj anotoki účet');

      TestBed.resetTestingModule();
      browser.mockReturnValue(['de-DE', 'de']);
      const english = setUp();
      await english.init();
      expect(english.ready()).toBe(false);
      expect(TestBed.inject(AnotokiWords).t('topbar.account')).toBe('Your anotoki account');
    });
  });

  describe('forShell(): the shell’s language switcher offers the site’s languages and chooses through the service', () => {
    let fixture: ComponentFixture<LanguageSwitcherComponent>;
    let host: HTMLElement;

    async function draw(): Promise<void> {
      fixture = TestBed.createComponent(LanguageSwitcherComponent);
      host = fixture.nativeElement;
      document.body.appendChild(host);
      await fixture.whenStable();
    }

    afterEach(() => host?.remove());

    const button = () => host.querySelector<HTMLButtonElement>('.anotoki-language-switcher__switcher')!;
    const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role=menuitemradio]'));
    const note = () => host.querySelector('.anotoki-language-switcher__note')?.textContent?.trim() ?? null;

    async function choose(index: number): Promise<void> {
      button().click();
      await fixture.whenStable();
      items()[index].click();
      await settled();
      await fixture.whenStable();
    }

    it('shows the language on the page, offers each under its own name, and switches the page through setLanguage()', async () => {
      const i18n = setUp();
      await i18n.init();
      await draw();

      expect(button().textContent?.trim()).toBe('SK');
      expect(button().getAttribute('aria-label')).toBe('Jazyk: Slovenčina (SK)');
      button().click();
      await fixture.whenStable();
      expect(items().map((item) => item.textContent?.trim())).toEqual(['English', 'Slovenčina']);
      expect(items().map((item) => item.getAttribute('lang'))).toEqual(['en', 'sk']);
      items()[0].click();
      await settled();
      await fixture.whenStable();

      expect(i18n.language()).toBe('en');
      expect(localStorage.getItem('test-site:language')).toBe('en');
      expect(button().textContent?.trim()).toBe('EN');
      // The kit's words follow: its own language button is named in English now.
      expect(button().getAttribute('aria-label')).toBe('Language: English (EN)');
    });

    it('says so under the button when the account refused the choice - and a click elsewhere puts the note away', async () => {
      site.account.set({ language: 'sk', keeps: true });
      site.save.mockRejectedValueOnce(new Error('The IAM could not be reached'));
      const i18n = setUp();
      await i18n.init();
      await draw();

      await choose(0);
      expect(i18n.language()).toBe('en');
      expect(i18n.languageNotSaved()).toBe(true);
      expect(note()).toBe('The language could not be saved to your anotoki account - it holds for this visit only.');

      document.body.click();
      await fixture.whenStable();
      expect(i18n.languageNotSaved()).toBe(false);
      expect(note()).toBeNull();
    });

    it('says so when the language chosen could not be had - and the page stays as it was', async () => {
      const i18n = setUp();
      await i18n.init();
      await draw();
      site.respond = () => Promise.reject(new Error('offline'));

      await choose(0);
      expect(i18n.language()).toBe('sk');
      expect(note()).toBe('Jazyk sa nepodarilo načítať. Skús to znova.');
    });

    it('draws nothing while fewer than two languages are offered (no bundle yet)', async () => {
      const server = later<unknown>();
      site.respond = () => server.promise;
      const i18n = setUp();
      void i18n.init();
      await draw();
      expect(button()).toBeNull();
      server.resolve(SK_BUNDLE);
      await settled();
      await fixture.whenStable();
      expect(button()?.textContent?.trim()).toBe('SK');
    });
  });

  describe('siteStatusWords(): the status page in the database’s words', () => {
    /**
     * The status page as the server's `state` (an update waiting by default; `installed`, its word on a site not set up)
     * shows it, the server answering the bundle as `respond` does.
     */
    async function statusPage(
      overrides?: Record<string, Record<string, string>>,
      { state = 'update_pending', installed, respond = () => Promise.resolve(REWORDED) }: { state?: string; installed?: boolean; respond?: () => Promise<unknown> } = {},
    ): Promise<HTMLElement> {
      site.respond = respond;
      const i18n = setUp({}, [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAnotokiMigrations(() => {
          const translations = inject(TranslationService);
          return {
            statusUrl: '/api/site-status',
            apiBase: '/api/admin/migrations',
            migrationsRoute: '/admin/migrations',
            isAdmin: () => false,
            isSignedIn: () => false,
            signIn: () => undefined,
            language: () => translations.effectiveLanguage(),
            get words() {
              return siteStatusWords(translations, overrides);
            },
          };
        }),
      ]);
      await i18n.init();
      TestBed.inject(SiteStatus).report(state, installed);
      const fixture = TestBed.createComponent(SiteStatusComponent);
      await fixture.whenStable();
      return fixture.nativeElement;
    }

    it('reads the owner’s rewording, and the built-in words for the rest', async () => {
      const host = await statusPage();
      expect(host.querySelector('h1')?.textContent?.trim()).toBe('Aktualizujeme, chvíľu strpenia');
      expect(host.querySelector('p')?.textContent?.trim()).toBe('O pár minút bude späť. Táto stránka sa obnoví sama.');
    });

    it('takes a site’s own words over them - its own page around the library’s', async () => {
      const host = await statusPage({ sk: { updatingTitle: 'Naša vlastná stránka' } });
      expect(host.querySelector('h1')?.textContent?.trim()).toBe('Naša vlastná stránka');
    });

    it('with the database out of reach - no bundle - speaks Slovak to a reader who chose Slovak before, whatever the browser says', async () => {
      localStorage.setItem('test-site:language', 'sk');
      browser.mockReturnValue(['de-DE', 'de']);
      const host = await statusPage(undefined, { state: 'unavailable', respond: () => Promise.reject(OFFLINE) });
      const i18n = TestBed.inject(TranslationService);
      expect(i18n.ready()).toBe(false);
      expect(i18n.effectiveLanguage()).toBe('sk');
      expect(document.documentElement.lang).toBe('sk');
      expect(host.querySelector('h1')?.textContent?.trim()).toBe('Stránka teraz nie je dostupná');
      expect(host.querySelector('p')?.textContent?.trim()).toBe('Skús to znova o pár minút. Táto stránka sa obnoví sama.');
      expect(host.querySelector('button')?.textContent?.trim()).toBe('Skúsiť znova');
    });

    it('with the database out of reach, no choice and a browser language the library has no words for: English', async () => {
      browser.mockReturnValue(['de-DE', 'de']);
      const host = await statusPage(undefined, { state: 'unavailable', respond: () => Promise.reject(OFFLINE) });
      expect(TestBed.inject(TranslationService).effectiveLanguage()).toBe('en');
      expect(host.querySelector('h1')?.textContent?.trim()).toBe('The site is not available right now');
      expect(host.querySelector('button')?.textContent?.trim()).toBe('Try again');
    });

    it('on a site not set up - nothing asked - in the browser’s language with no choice, where the library has words for it', async () => {
      site.canAsk.set(false);
      const host = await statusPage(undefined, { state: 'not_set_up', installed: false });
      expect(site.calls).toEqual([]);
      expect(host.querySelector('h1')?.textContent?.trim()).toBe('Táto stránka ešte nie je nastavená');
    });

    it('is keyed by the language on the page, and English in the English areas', async () => {
      site.respond = () => Promise.resolve(REWORDED);
      const i18n = setUp();
      await i18n.init();
      expect(siteStatusWords(i18n)).toEqual({ sk: { updatingTitle: 'Aktualizujeme, chvíľu strpenia' } });
      i18n.noteAddress('/admin');
      expect(siteStatusWords(i18n, { en: { signIn: 'Log in' } })).toEqual({ en: { updatingTitle: 'Updating - back soon', signIn: 'Log in' } });
    });
  });

  describe('a module’s words reach the translations module through its own registration', () => {
    const migrations = () =>
      provideAnotokiMigrations(() => ({
        statusUrl: '/api/site-status',
        apiBase: '/api/admin/migrations',
        migrationsRoute: '/admin/migrations',
        isAdmin: () => false,
        isSignedIn: () => false,
        signIn: () => undefined,
        language: () => 'sk',
      }));

    it('provideAnotokiMigrations brings the status page’s, provideAnotokiAuth the sign-in page’s - read when the database has no string', async () => {
      const i18n = setUp({}, [provideHttpClient(), provideHttpClientTesting(), migrations(), provideAnotokiAuth(() => ({ config: () => null }))]);
      await i18n.init();
      expect(i18n.language()).toBe('sk');
      expect(i18n.t('anotoki.siteStatus.tryAgain')).toBe('Skúsiť znova');
      expect(i18n.t('anotoki.signIn.back')).toBe('Späť');
      expect(i18n.t('anotoki.signIn.failed', { code: 'x' })).toBe('Prihlásenie zlyhalo (x).');
    });

    it('a module the site does not use brings nothing: the gate’s words without the sign-in page’s', async () => {
      const i18n = setUp({}, [provideHttpClient(), provideHttpClientTesting(), migrations()]);
      await i18n.init();
      expect(i18n.has('anotoki.siteStatus.tryAgain')).toBe(true);
      expect(i18n.has('anotoki.signIn.back')).toBe(false);
    });
  });
});
