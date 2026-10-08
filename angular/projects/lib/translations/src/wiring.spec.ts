import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SiteStatus, SiteStatusComponent, provideAnotokiMigrations } from '@anotoki/lib/migrations';
import { LanguageSwitcherComponent, provideAnotokiShell } from '@anotoki/lib/shell';
import { AnotokiWords, provideAnotokiUi } from '@anotoki/lib/ui';
import { AnotokiTranslationsConfig } from './config';
import { siteStatusWords } from './site-status-words';
import { ENGLISH, SK_BUNDLE, SLOVAK, TranslationsSite, later, settled, translationsProviders, translationsSite } from './testing';
import { TranslationService } from './translation.service';

/** The Slovak bundle of a site whose owner reworded the status page's heading. */
const REWORDED = {
  ...SK_BUNDLE,
  values: { ...SLOVAK, 'anotoki.siteStatus.updatingTitle': 'Aktualizujeme, chvíľu strpenia' },
  english: { ...ENGLISH, 'anotoki.siteStatus.updatingTitle': 'Updating - back soon' },
};

describe('the wiring: the kit’s words, the shell’s switcher and the status page, from the translations', () => {
  let site: TranslationsSite;

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
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['sk']);
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

    it('with no database at all, the kit says its own words', async () => {
      site.respond = () => Promise.reject(new Error('offline'));
      const i18n = setUp();
      await i18n.init();
      expect(i18n.ready()).toBe(false);
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

    const button = () => host.querySelector<HTMLButtonElement>('.switcher')!;
    const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role=menuitemradio]'));
    const note = () => host.querySelector('.note')?.textContent?.trim() ?? null;

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
    async function statusPage(overrides?: Record<string, Record<string, string>>): Promise<HTMLElement> {
      site.respond = () => Promise.resolve(REWORDED);
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
      TestBed.inject(SiteStatus).report('update_pending');
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

    it('is keyed by the language on the page, and English in the English areas', async () => {
      site.respond = () => Promise.resolve(REWORDED);
      const i18n = setUp();
      await i18n.init();
      expect(siteStatusWords(i18n)).toEqual({ sk: { updatingTitle: 'Aktualizujeme, chvíľu strpenia' } });
      i18n.noteAddress('/admin');
      expect(siteStatusWords(i18n, { en: { signIn: 'Log in' } })).toEqual({ en: { updatingTitle: 'Updating - back soon', signIn: 'Log in' } });
    });
  });
});
