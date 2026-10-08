import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LIBRARY_WORDS } from '@anotoki/lib/ui';
import { ANOTOKI_TRANSLATION_BUNDLE, DEFAULT_WAITS, provideAnotokiTranslations } from './config';
import { addressLanguage, bundleFrom, fillPlaceholders, isAdminArea, languageCandidates, pickLanguage } from './language';
import { TranslationBundle } from './models';
import {
  CACHE_KEY,
  COMPILED,
  EN_BUNDLE,
  ENGLISH,
  LANGUAGES,
  LANGUAGE_KEY,
  OFFLINE,
  SK_BUNDLE,
  TranslationsSite,
  UNAVAILABLE,
  fails,
  gives,
  later,
  reworded,
  settled,
  translationsProviders,
  translationsSite,
} from './testing';
import { TranslationService } from './translation.service';

describe('languageCandidates() and pickLanguage(): which language a reader gets', () => {
  it('orders the wishes: this tab, the choice, the account, the device under it, each browser tag and its first subtag, English', () => {
    const candidates = languageCandidates({ tab: 'de', chosen: 'sk', account: 'cs', device: 'pl', browser: ['hu-HU', 'en-US'] });
    // English closes the list - also after a browser's English: only a browser's wish takes an alias.
    expect(candidates.map((candidate) => candidate.code)).toEqual(['de', 'sk', 'cs', 'pl', 'hu-hu', 'hu', 'en-us', 'en', 'en']);
    expect(candidates.filter((candidate) => candidate.browser).map((candidate) => candidate.code)).toEqual(['hu-hu', 'hu', 'en-us', 'en']);
  });

  it('lower-cases, and ignores whatever does not look like a language code', () => {
    expect(languageCandidates({ tab: 'SK', chosen: 'english', account: '../x', browser: [null, undefined, 'SK-sk'] }).map((candidate) => candidate.code)).toEqual(['sk', 'sk-sk', 'sk', 'en']);
  });

  it('takes the first wish that is on offer, and English when none is', () => {
    expect(pickLanguage(languageCandidates({ chosen: 'de', browser: ['sk-SK'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ chosen: 'de' }), ['en', 'sk'])).toBe('en');
  });

  it('gives a Czech browser Slovak - while no Czech is on offer, and only at the browser step', () => {
    const aliases = { cs: 'sk' };
    expect(pickLanguage(languageCandidates({ browser: ['cs-CZ'] }), ['en', 'sk'], aliases)).toBe('sk');
    expect(pickLanguage(languageCandidates({ browser: ['cs-CZ'] }), ['en', 'sk', 'cs'], aliases)).toBe('cs');
    expect(pickLanguage(languageCandidates({ chosen: 'cs' }), ['en', 'sk'], aliases)).toBe('en');
    expect(pickLanguage(languageCandidates({ browser: ['cs'] }), ['en', 'sk'])).toBe('en');
  });
});

describe('the pure helpers', () => {
  it('isAdminArea(): the address itself or anything under it, query and hash aside - never one that only begins the same', () => {
    expect(['/admin', '/admin/translations', '/admin?x=1', '/admin#top'].every(isAdminArea)).toBe(true);
    expect(['/', '/administration', '/x/admin', '/adminx/y'].some(isAdminArea)).toBe(false);
  });

  it('addressLanguage(): the ?lang= of an address, its whole code or its first subtag, else nothing', () => {
    expect(addressLanguage('/login?next=%2F&lang=sk')).toBe('sk');
    expect(addressLanguage('/?lang=SK-sk#x')).toBe('sk-sk');
    expect(addressLanguage('/?lang=sk-SK-x')).toBe('sk');
    expect(addressLanguage('/?lang=english')).toBeNull();
    expect(addressLanguage('/?language=sk')).toBeNull();
    expect(addressLanguage('/#?lang=sk')).toBeNull();
    expect(addressLanguage('/?lang=%E0%A4%A')).toBeNull();
  });

  it('fillPlaceholders(): in one pass, from what the parameters hold themselves; a placeholder without a value stays', () => {
    expect(fillPlaceholders('{a} and {b}', { a: '{b}', b: 'B' })).toBe('{b} and B');
    expect(fillPlaceholders('x {constructor} {toString} {missing} y', {})).toBe('x {constructor} {toString} {missing} y');
    expect(fillPlaceholders('{n} of {total}', { n: 0, total: null })).toBe('0 of {total}');
  });

  it('bundleFrom(): a bundle only when it is one - and English beside every other language', () => {
    expect(bundleFrom(EN_BUNDLE)).toEqual(EN_BUNDLE);
    expect(bundleFrom(SK_BUNDLE)).toEqual(SK_BUNDLE);
    for (const broken of [
      null,
      [],
      { ...EN_BUNDLE, language: 'EN' },
      { ...EN_BUNDLE, values: {} },
      { ...EN_BUNDLE, values: { a: 1 } },
      { ...EN_BUNDLE, languages: [{ code: 'en', name: 'English' }] },
      { ...EN_BUNDLE, languages: [LANGUAGES[1]] },
      { ...SK_BUNDLE, english: undefined },
      { ...SK_BUNDLE, english: [] },
    ]) {
      expect(bundleFrom(broken)).toBeNull();
    }
  });
});

describe('TranslationService', () => {
  let site: TranslationsSite;
  let warn: ReturnType<typeof vi.spyOn>;
  let browser: ReturnType<typeof vi.spyOn>;

  /** The site's app - with no wait before a first visit's second try, but where a test says. */
  function configure(extra = {}): void {
    TestBed.configureTestingModule({ providers: translationsProviders(site, { waits: { retry: 0 }, ...extra }) });
  }

  function service(): TranslationService {
    return TestBed.inject(TranslationService);
  }

  function cache(): TranslationBundle | null {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
  }

  /** A fresh page of the same site: a new app, the storage as it is. */
  function reload(extra = {}): void {
    TestBed.resetTestingModule();
    configure(extra);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    site = translationsSite();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    browser = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-GB']);
    configure();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('asks nothing while it is being made - its configuration is not even read - and words a page all the same: the compiled English', () => {
    TestBed.resetTestingModule();
    const factory = vi.fn(() => ({ fallbackEnglish: COMPILED, fetchBundle: (code: string) => (site.calls.push(code), Promise.resolve(EN_BUNDLE)) }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAnotokiTranslations(factory)] });

    const i18n = TestBed.inject(TranslationService);
    // A site whose session reaches its Router, and the Router its title strategy (which reads this), closes no circle.
    expect(factory).not.toHaveBeenCalled();
    TestBed.tick();

    expect(site.calls).toEqual([]);
    expect(i18n.ready()).toBe(false);
    expect(i18n.t('theme.label')).toBe('Theme');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  describe('choosing the language as the site starts', () => {
    it('needs one request for a Slovak browser’s first visit: the server answers a regional code by its base language', async () => {
      browser.mockReturnValue(['sk-SK', 'sk', 'en']);
      site.respond = (code) => Promise.resolve(code.startsWith('sk') ? SK_BUNDLE : EN_BUNDLE);
      await service().init();
      expect(site.calls).toEqual(['sk-sk']);
      expect(service().language()).toBe('sk');
      expect(service().t('theme.label')).toBe('Vzhľad');
      expect(cache()).toEqual(SK_BUNDLE);
    });

    it('asks for the first wish and, answered in English (an older server), settles on the list that came: two requests at most', async () => {
      browser.mockReturnValue(['sk-SK']);
      await service().init();
      expect(site.calls).toEqual(['sk-sk', 'sk']);
      expect(service().language()).toBe('sk');
    });

    it('starts in the database’s English when the language it settled on cannot be had', async () => {
      browser.mockReturnValue(['sk-SK']);
      site.once = [gives(EN_BUNDLE), fails(OFFLINE)];
      await service().init();
      expect(site.calls).toEqual(['sk-sk', 'sk']);
      expect(service().language()).toBe('en');
      expect(service().t('theme.label')).toBe('Appearance');
    });

    it('needs one request when the first wish is on offer, or when nothing wished for is', async () => {
      await service().init();
      expect(site.calls).toEqual(['en-gb']);
      expect(service().language()).toBe('en');

      // A first visit again - no cache - of a browser that wants a language nobody offers.
      localStorage.clear();
      reload();
      site.calls = [];
      browser.mockReturnValue(['de-DE', 'de']);
      await service().init();
      expect(site.calls).toEqual(['de-de']);
      expect(service().language()).toBe('en');
    });

    it('gives a Czech browser Slovak', async () => {
      browser.mockReturnValue(['cs-CZ']);
      await service().init();
      expect(service().language()).toBe('sk');
    });

    it('keeps ?lang= for this tab only, and takes it out of the address - the other parameters as they came', async () => {
      history.replaceState(null, '', '/lesson?step=2&lang=sk&x=%2F#top');
      await service().init();
      expect(service().language()).toBe('sk');
      expect(location.pathname + location.search + location.hash).toBe('/lesson?step=2&x=%2F#top');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();

      // A new page of this tab: still Slovak; another tab (no sessionStorage) would not be.
      reload();
      await service().init();
      expect(service().language()).toBe('sk');
    });

    it('ignores a ?lang= that is not a language code: never stored, never sent - and still removed', async () => {
      history.replaceState(null, '', '/?lang=../../etc');
      await service().init();
      expect(site.calls).toEqual(['en-gb']);
      expect(location.search).toBe('');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
    });

    it('keeps ?lang= and a choice for as long as the page lives where storage refuses to be written', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      });
      history.replaceState(null, '', '/?lang=sk');
      await service().init();
      expect(service().language()).toBe('sk');

      expect(await service().setLanguage('en')).toBe(true);
      await service().reload();
      expect(service().language()).toBe('en');
    });

    it('puts this tab before the choice, the choice before the account, the account before the browser', async () => {
      browser.mockReturnValue(['sk']);
      site.account.set({ language: 'en', keeps: false });
      await service().init();
      // A visitor's ranking: no choice yet, so the account (only while nothing is stored) before the browser.
      expect(service().language()).toBe('en');

      localStorage.setItem(LANGUAGE_KEY, 'sk');
      reload();
      await service().init();
      expect(service().language()).toBe('sk');

      sessionStorage.setItem(LANGUAGE_KEY, 'en');
      reload();
      await service().init();
      expect(service().language()).toBe('en');
    });

    it('reads no account’s language while nobody is signed in', async () => {
      site.account.set(null);
      browser.mockReturnValue(['sk']);
      await service().init();
      expect(service().language()).toBe('sk');
    });
  });

  describe('the cache', () => {
    it('starts from it, asks the server all the same, and is replaced by the answer', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(reworded('Téma')));
      browser.mockReturnValue(['sk']);
      await service().init();
      expect(site.calls).toEqual(['sk']);
      expect(service().t('theme.label')).toBe('Vzhľad');
      expect(cache()?.values['theme.label']).toBe('Vzhľad');
    });

    it('is removed when it is not a bundle - and the page starts, asks and is worded all the same', async () => {
      for (const corrupt of ['{', '"x"', JSON.stringify({ ...EN_BUNDLE, values: {} }), JSON.stringify({ ...SK_BUNDLE, english: null })]) {
        reload();
        localStorage.setItem(CACHE_KEY, corrupt);
        await service().init();
        expect(service().t('theme.label')).toBe('Appearance');
        expect(cache()).toEqual(EN_BUNDLE);
      }
    });

    it('is not used - and is removed - when it is in another language than the one the wishes settle on now', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      const server = later<unknown>();
      site.respond = () => server.promise;
      const starting = service().init();
      expect(service().ready()).toBe(false);
      server.resolve(EN_BUNDLE);
      await starting;
      expect(service().language()).toBe('en');
      expect(cache()).toEqual(EN_BUNDLE);
    });

    it('follows a language offered again (or added) at once, not one visit late: it settles on the list that came, whatever answered', async () => {
      // Cached while only English was offered; Slovak is offered again now, and the browser wants it.
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, languages: [LANGUAGES[0]] }));
      browser.mockReturnValue(['sk']);
      await service().init();
      // The cache's language first - its answer names Slovak on offer again - then Slovak.
      expect(site.calls).toEqual(['en', 'sk']);
      expect(service().language()).toBe('sk');
    });

    it('follows a language hidden since the last visit: the cache is in force only until the answer', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      site.respond = () => Promise.resolve({ ...EN_BUNDLE, languages: [LANGUAGES[0]] });
      await service().init();
      expect(site.calls).toEqual(['sk']);
      expect(service().language()).toBe('en');
      expect(service().languages()).toEqual([LANGUAGES[0]]);
      expect(cache()?.language).toBe('en');
    });

    it('waits a second for the fresh bundle, then starts from the cache - and the answer replaces it when it comes', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify(reworded('Téma')));
      browser.mockReturnValue(['sk']);
      const server = later<unknown>();
      site.respond = () => server.promise;

      let started = false;
      const starting = service()
        .init()
        .then(() => (started = true));
      await vi.advanceTimersByTimeAsync(DEFAULT_WAITS.cache - 1);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await starting;
      expect(service().t('theme.label')).toBe('Téma');

      vi.useRealTimers();
      server.resolve(SK_BUNDLE);
      await vi.waitFor(() => expect(service().t('theme.label')).toBe('Vzhľad'));
      expect(cache()?.values['theme.label']).toBe('Vzhľad');
    });

    it('does not wait the second out when the server answers, or fails, sooner', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { 'theme.label': 'Look' } }));
      await service().init();
      expect(service().t('theme.label')).toBe('Appearance');

      reload();
      site.respond = fails(OFFLINE);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { 'theme.label': 'Look' } }));
      await service().init();
      expect(service().t('theme.label')).toBe('Look');
    });

    it('with no cache waits at most three seconds, then starts on the compiled English - and the bundle is put in force when it arrives', async () => {
      vi.useFakeTimers();
      browser.mockReturnValue(['sk']);
      const server = later<unknown>();
      site.respond = () => server.promise;

      let started = false;
      const starting = service()
        .init()
        .then(() => (started = true));
      await vi.advanceTimersByTimeAsync(DEFAULT_WAITS.first - 1);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await starting;

      expect(site.calls).toEqual(['sk']);
      expect(service().ready()).toBe(false);
      expect(service().language()).toBe('en');
      expect(service().t('theme.label')).toBe('Theme');
      expect(warn).not.toHaveBeenCalled();

      vi.useRealTimers();
      server.resolve(SK_BUNDLE);
      await vi.waitFor(() => expect(service().t('theme.label')).toBe('Vzhľad'));
      expect(cache()?.language).toBe('sk');
    });

    it('asks once more, half a second after a first visit’s answer was lost', async () => {
      reload({ waits: { retry: DEFAULT_WAITS.retry } });
      vi.useFakeTimers();
      site.once = [fails(OFFLINE)];
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(DEFAULT_WAITS.retry - 1);
      expect(site.calls).toEqual(['en-gb']);
      await vi.advanceTimersByTimeAsync(1);
      await starting;
      expect(site.calls).toEqual(['en-gb', 'en-gb']);
      expect(service().ready()).toBe(true);
    });

    it('reads the compiled English - no key, no warning - when there is no cache and the route answers 503 or not at all', async () => {
      for (const failure of [UNAVAILABLE, OFFLINE]) {
        reload();
        site.calls = [];
        site.respond = fails(failure);
        await service().init();
        expect(site.calls).toEqual(['en-gb', 'en-gb']);
        expect(service().ready()).toBe(false);
        expect(service().languages()).toEqual([]);
        expect(service().has('theme.label')).toBe(true);
        expect(service().t('theme.label')).toBe('Theme');
        expect(service().t('greeting.named', { name: 'Mira' })).toBe('Hello, Mira!');
        expect(service().plural('reviews.due', 2)).toBe('2 reviews due');
        // Nobody chose this English: a sign-in does not hand it to the IAM.
        expect(service().signInLanguage()).toBeUndefined();
      }
      expect(warn).not.toHaveBeenCalled();
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it('asks for nothing while the server cannot be asked: the cache, in whatever language it is in, left where it is', async () => {
      site.canAsk.set(false);
      await service().init();
      expect(site.calls).toEqual([]);
      expect(service().ready()).toBe(false);

      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      reload();
      await service().init();
      expect(site.calls).toEqual([]);
      expect(service().language()).toBe('sk');
      expect(cache()).toEqual(SK_BUNDLE);
    });

    it('takes nothing from the server that is not a bundle - one whose values are empty is none', async () => {
      site.respond = gives({ ...EN_BUNDLE, values: {} });
      await service().init();
      expect(service().ready()).toBe(false);
      expect(service().t('theme.label')).toBe('Theme');
    });
  });

  describe('asking again: a page that is behind gets its words at a later navigation', () => {
    async function startWithout(): Promise<void> {
      site.respond = fails(UNAVAILABLE);
      await service().init();
      site.calls = [];
      site.respond = (code) => Promise.resolve(code === 'sk' ? SK_BUNDLE : EN_BUNDLE);
    }

    it('does not ask at the first navigation of a visit, which ends a moment after the start asked', async () => {
      await startWithout();
      service().noteAddress('/');
      expect(site.calls).toEqual([]);
    });

    it('asks once at each later navigation while no bundle is in memory - and no more once one has come', async () => {
      await startWithout();
      service().noteAddress('/');
      site.respond = fails(OFFLINE);
      service().noteAddress('/lessons');
      await settled();
      expect(site.calls).toEqual(['en-gb']);
      site.respond = (code) => Promise.resolve(code === 'sk' ? SK_BUNDLE : EN_BUNDLE);
      service().noteAddress('/songs');
      await settled();
      expect(site.calls).toEqual(['en-gb', 'en-gb']);
      expect(service().ready()).toBe(true);
      service().noteAddress('/lessons');
      await settled();
      expect(site.calls).toEqual(['en-gb', 'en-gb']);
    });

    it('asks again while the cached bundle is in force because its refresh failed', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(EN_BUNDLE));
      site.respond = fails(OFFLINE);
      await service().init();
      expect(service().ready()).toBe(true);
      site.respond = gives(EN_BUNDLE);
      service().noteAddress('/');
      service().noteAddress('/songs');
      await settled();
      expect(site.calls).toEqual(['en', 'en']);
    });

    it('never has two loads in flight: a navigation asks for nothing while an answer is on its way', async () => {
      await startWithout();
      service().noteAddress('/');
      const server = later<unknown>();
      site.respond = () => server.promise;
      service().noteAddress('/a');
      service().noteAddress('/b');
      expect(site.calls).toEqual(['en-gb']);
      server.resolve(EN_BUNDLE);
      await settled();
      expect(service().ready()).toBe(true);
    });

    it('asks for nothing before the start has run, nor while the server cannot be asked', async () => {
      service().noteAddress('/a');
      expect(site.calls).toEqual([]);
      await startWithout();
      service().noteAddress('/');
      site.canAsk.set(false);
      service().noteAddress('/b');
      expect(site.calls).toEqual([]);
    });

    it('takes a ?lang= arriving with an address in the app for the tab - one nobody offers does not unseat the language', async () => {
      await service().init();
      site.calls = [];
      service().noteAddress('/sign-in?lang=de');
      await settled();
      expect(service().language()).toBe('en');
      expect(site.calls).toEqual([]);

      service().noteAddress('/sign-in?lang=sk');
      await vi.waitFor(() => expect(service().language()).toBe('sk'));
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
    });
  });

  describe('reload(): the strings again, after somebody changed them or the languages - or pressed Apply', () => {
    it('asks for the language on the page again, and puts the answer in force and in the cache', async () => {
      browser.mockReturnValue(['sk']);
      await service().init();
      site.calls = [];
      site.respond = () => Promise.resolve(reworded('Podoba'));
      await service().reload();
      expect(site.calls).toEqual(['sk']);
      expect(service().t('theme.label')).toBe('Podoba');
      expect(cache()?.values['theme.label']).toBe('Podoba');
    });

    it('brings the strings to a page that had none: after Apply the first wish is asked for', async () => {
      browser.mockReturnValue(['sk']);
      site.respond = fails(UNAVAILABLE);
      await service().init();
      site.calls = [];
      site.respond = (code) => Promise.resolve(code === 'sk' ? SK_BUNDLE : EN_BUNDLE);
      await service().reload();
      expect(site.calls).toEqual(['sk']);
      expect(service().language()).toBe('sk');
    });

    it('starts, before the site has: what it gets is fresh', async () => {
      await service().reload();
      expect(site.calls).toEqual(['en-gb']);
      expect(service().ready()).toBe(true);
    });

    it('follows a language hidden a moment ago: the page goes to what the list that came still offers', async () => {
      browser.mockReturnValue(['sk']);
      await service().init();
      site.respond = () => Promise.resolve({ ...EN_BUNDLE, languages: [LANGUAGES[0]] });
      await service().reload();
      expect(service().language()).toBe('en');
      expect(service().languages()).toEqual([LANGUAGES[0]]);
    });

    it('never rejects: the page stays as it is when the server cannot be had', async () => {
      browser.mockReturnValue(['sk']);
      await service().init();
      site.respond = fails(OFFLINE);
      await expect(service().reload()).resolves.toBeUndefined();
      expect(service().language()).toBe('sk');
    });

    it('is the load that counts: an answer still on its way from before is dropped', async () => {
      await service().init();
      const old = later<unknown>();
      site.once = [() => old.promise];
      const choosing = service().setLanguage('sk');
      // The language on the page is still English: reload() asks for it, and its answer is the one that counts.
      await service().reload();
      old.resolve(SK_BUNDLE);
      expect(await choosing).toBe(false);
      expect(service().language()).toBe('en');
    });
  });

  describe('setLanguage(): a choice', () => {
    it('loads the bundle, then switches and remembers - and the choice outlives the ?lang= of this tab', async () => {
      history.replaceState(null, '', '/?lang=sk');
      await service().init();
      expect(service().language()).toBe('sk');

      expect(await service().setLanguage('en')).toBe(true);
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();

      reload();
      await service().init();
      expect(service().language()).toBe('en');
    });

    it('lets the last choice win: going back to the language on the page drops the one still on its way', async () => {
      await service().init();
      const slow = later<unknown>();
      site.once = [() => slow.promise];
      const toSlovak = service().setLanguage('sk');
      expect(await service().setLanguage('en')).toBe(true);
      slow.resolve(SK_BUNDLE);
      expect(await toSlovak).toBe(false);
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
    });

    it('lets the last choice win with two loads in flight: the slower, earlier answer is dropped when it comes', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      browser.mockReturnValue(['sk']);
      await service().init();
      const first = later<unknown>();
      const second = later<unknown>();
      site.once = [() => first.promise, () => second.promise];
      const toEnglish = service().setLanguage('en');
      // A way back exists only for a language a choice took off the page - none yet: both are asked for.
      const toGerman = service().setLanguage('de');
      second.resolve(EN_BUNDLE);
      expect(await toGerman).toBe(false);
      first.resolve(EN_BUNDLE);
      expect(await toEnglish).toBe(false);
      expect(service().language()).toBe('sk');
    });

    it('is not undone by a start’s answer that comes late', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(EN_BUNDLE));
      vi.useFakeTimers();
      const slow = later<unknown>();
      site.once = [() => slow.promise];
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(DEFAULT_WAITS.cache);
      await starting;
      vi.useRealTimers();
      expect(await service().setLanguage('sk')).toBe(true);
      slow.resolve(EN_BUNDLE);
      await settled();
      expect(service().language()).toBe('sk');
    });

    it('never rejects: false, and the page stays as it is, when the words cannot be had', async () => {
      await service().init();
      site.respond = fails(OFFLINE);
      expect(await service().setLanguage('sk')).toBe(false);
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
    });

    it('does not switch to a language the server no longer offers - and asks for nothing that is not a code', async () => {
      await service().init();
      site.respond = () => Promise.resolve({ ...EN_BUNDLE, languages: [LANGUAGES[0]] });
      expect(await service().setLanguage('sk')).toBe(false);
      expect(service().language()).toBe('en');
      expect(service().languages()).toEqual([LANGUAGES[0]]);

      site.calls = [];
      expect(await service().setLanguage('../sk')).toBe(false);
      expect(site.calls).toEqual([]);
    });

    it('goes back to the language the last choice took off the page from memory - with no request', async () => {
      await service().init();
      expect(await service().setLanguage('sk')).toBe(true);
      site.calls = [];
      site.respond = fails(OFFLINE);
      expect(await service().setLanguage('en')).toBe(true);
      expect(site.calls).toEqual([]);
      expect(service().language()).toBe('en');
      // Only that one: Slovak, taken off the page now, is the way back - and English is not.
      expect(await service().setLanguage('sk')).toBe(true);
      expect(site.calls).toEqual([]);

      // reload() closes it: words from before a change are no way back.
      site.respond = gives(SK_BUNDLE);
      await service().reload();
      site.respond = fails(OFFLINE);
      expect(await service().setLanguage('en')).toBe(false);
    });
  });

  describe("the account's language: signed in, with an IAM that keeps the person's choices", () => {
    it('comes before what this device remembered - only this tab and a language this site lacks give way', async () => {
      browser.mockReturnValue(['en']);
      localStorage.setItem(LANGUAGE_KEY, 'en');
      site.account.set({ language: 'sk', keeps: true });
      await service().init();
      expect(service().language()).toBe('sk');
      // Used, not stored: the device keeps what was chosen on it.
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');

      sessionStorage.setItem(LANGUAGE_KEY, 'en');
      reload();
      await service().init();
      expect(service().language()).toBe('en');
      sessionStorage.clear();

      // A language this site does not offer: the device's choice, then the browser.
      site.account.set({ language: 'de', keeps: true });
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      reload();
      await service().init();
      expect(service().language()).toBe('sk');

      // An account that does not decide (an IAM before it kept choices): the device first, as it always was.
      site.account.set({ language: 'en', keeps: false });
      reload();
      await service().init();
      expect(service().language()).toBe('sk');
    });

    it('is followed when it changes on another anotoki site, though this device remembered another', async () => {
      browser.mockReturnValue(['en']);
      localStorage.setItem(LANGUAGE_KEY, 'en');
      site.account.set({ language: 'en', keeps: true });
      await service().init();
      expect(service().language()).toBe('en');

      site.account.set({ language: 'sk', keeps: true });
      TestBed.tick();
      await vi.waitFor(() => expect(service().language()).toBe('sk'));
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
      expect(site.save).not.toHaveBeenCalled();
    });

    it('is adopted by a visitor only while nothing is stored here', async () => {
      await service().init();
      site.account.set({ language: 'sk', keeps: false });
      TestBed.tick();
      await vi.waitFor(() => expect(service().language()).toBe('sk'));

      localStorage.setItem(LANGUAGE_KEY, 'en');
      site.account.set(null);
      reload();
      await service().init();
      site.account.set({ language: 'sk', keeps: false });
      TestBed.tick();
      await settled();
      expect(service().language()).toBe('en');
    });

    it('does not follow it before the start has run', async () => {
      site.account.set({ language: 'sk', keeps: true });
      TestBed.tick();
      await settled();
      expect(site.calls).toEqual([]);
    });

    it('saves a choice to the account - which then decides again, as it did before', async () => {
      site.account.set({ language: 'en', keeps: true });
      await service().init();

      expect(await service().setLanguage('sk')).toBe(true);
      expect(site.save.mock.calls).toEqual([['sk']]);
      await settled();
      TestBed.tick();
      expect(site.account()?.language).toBe('sk');
      expect(service().language()).toBe('sk');
      // Remembered on this device too, for when nobody is signed in.
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');

      // Changed back on another anotoki site: followed here, though this device chose Slovak.
      site.account.set({ language: 'en', keeps: true });
      TestBed.tick();
      await vi.waitFor(() => expect(service().language()).toBe('en'));
      expect(site.save).toHaveBeenCalledTimes(1);
    });

    it('saves nothing for a visitor, nor to an account that does not decide - and nothing the account has', async () => {
      await service().init();
      expect(await service().setLanguage('sk')).toBe(true);
      site.account.set({ language: 'sk', keeps: false });
      expect(await service().setLanguage('en')).toBe(true);
      site.account.set({ language: 'en', keeps: true });
      expect(await service().setLanguage('en')).toBe(true);
      expect(site.save).not.toHaveBeenCalled();
    });

    it('saves one at a time, the latest choice last - and nothing the account has by then', async () => {
      site.account.set({ language: 'en', keeps: true });
      await service().init();
      const first = later<unknown>();
      site.save.mockImplementationOnce(() => first.promise);

      await service().setLanguage('sk');
      await service().setLanguage('en');
      await service().setLanguage('sk');
      expect(site.save.mock.calls).toEqual([['sk']]);

      // The first save lands: the account says Slovak - also the last choice, so nothing more is sent.
      site.account.set({ language: 'sk', keeps: true });
      first.resolve(undefined);
      await settled();
      expect(site.save.mock.calls).toEqual([['sk']]);

      const second = later<unknown>();
      site.save.mockImplementationOnce(() => second.promise);
      await service().setLanguage('en');
      await service().setLanguage('sk');
      await service().setLanguage('en');
      site.account.set({ language: 'en', keeps: true });
      second.resolve(undefined);
      await settled();
      expect(site.save.mock.calls).toEqual([['sk'], ['en']]);
      expect(service().language()).toBe('en');
    });

    it('keeps a language the IAM does not offer as this site’s own for the visit - silently', async () => {
      site.account.set({ language: 'en', keeps: true });
      await service().init();
      site.save.mockRejectedValueOnce(Object.assign(new Error('not on offer'), { code: 'invalid_request' }));

      expect(await service().setLanguage('sk')).toBe(true);
      await settled();
      expect(service().language()).toBe('sk');
      expect(service().languageNotSaved()).toBe(false);

      // The account changing its mind does not take the visit's choice away.
      site.account.set({ language: 'de', keeps: true });
      TestBed.tick();
      site.account.set({ language: 'en', keeps: true });
      TestBed.tick();
      await settled();
      expect(service().language()).toBe('sk');

      // The next visit is the account's again: the device's choice comes after it.
      reload();
      await service().init();
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
    });

    it('says so when the account could not take the choice - the page keeps it for the visit, and the next choice takes the note away', async () => {
      site.account.set({ language: 'en', keeps: true });
      await service().init();
      site.save.mockRejectedValueOnce(Object.assign(new Error('The IAM could not be reached'), { code: 'network' }));

      expect(await service().setLanguage('sk')).toBe(true);
      await settled();
      expect(service().language()).toBe('sk');
      expect(service().languageNotSaved()).toBe(true);

      service().clearLanguageNotSaved();
      expect(service().languageNotSaved()).toBe(false);

      // Back to the language the account has: nothing is sent, so nothing is refused.
      site.save.mockRejectedValueOnce(new Error('again'));
      await service().setLanguage('en');
      await settled();
      expect(site.save).toHaveBeenCalledTimes(1);
      expect(service().languageNotSaved()).toBe(false);

      await service().setLanguage('sk');
      await settled();
      expect(service().languageNotSaved()).toBe(true);
      // The next choice takes the note away as it is made.
      const choosing = service().setLanguage('en');
      expect(service().languageNotSaved()).toBe(false);
      await choosing;
    });

    it('asks the site which refusals are quiet, when it says', async () => {
      reload({
        account: {
          language: () => 'en',
          decides: () => true,
          save: () => Promise.reject({ code: 'invalid_language' }),
          quiet: (error: unknown) => (error as { code: string }).code === 'invalid_language',
        },
      });
      await service().init();
      await service().setLanguage('sk');
      await settled();
      expect(service().languageNotSaved()).toBe(false);
    });

    it('says nothing of a refused save that a later choice has overtaken', async () => {
      site.account.set({ language: 'en', keeps: true });
      await service().init();
      const first = later<unknown>();
      site.save.mockImplementationOnce(() => first.promise);

      await service().setLanguage('sk');
      await service().setLanguage('en');
      await service().setLanguage('sk');
      first.reject(new Error('The IAM could not be reached'));
      await settled();

      expect(site.save.mock.calls).toEqual([['sk'], ['sk']]);
      expect(service().languageNotSaved()).toBe(false);
      expect(site.account()?.language).toBe('sk');
    });

    it('revertible: answers once the account has - and when it refuses, goes back to the language the page was in, with no request', async () => {
      site.account.set({ language: 'en', keeps: true });
      await service().init();
      site.save.mockRejectedValueOnce(new Error('The IAM could not be reached'));

      const choosing = service().setLanguage('sk', { revertible: true });
      expect(await choosing).toBe(false);
      expect(service().language()).toBe('en');
      expect(site.calls).toEqual(['en', 'sk']);
      // The page says what happened itself: no note under the switcher.
      expect(service().languageNotSaved()).toBe(false);

      expect(await service().setLanguage('sk', { revertible: true })).toBe(true);
      expect(service().language()).toBe('sk');
      expect(site.account()?.language).toBe('sk');
    });

    it('keeps a choice made before signing in for the visit, before the account’s language (a sign-in inside the app)', async () => {
      await service().init();
      expect(await service().setLanguage('sk')).toBe(true);
      site.account.set({ language: 'en', keeps: true });
      TestBed.tick();
      await settled();
      expect(service().language()).toBe('sk');
      await service().reload();
      expect(service().language()).toBe('sk');
      expect(site.save).not.toHaveBeenCalled();
    });

    it('preferred(): a new account’s language - the wishes against what the server offers, also with no words on the page', async () => {
      browser.mockReturnValue(['sk-SK']);
      site.respond = fails(UNAVAILABLE);
      await service().init();
      expect(service().language()).toBe('en');
      expect(service().preferred(['en', 'sk'])).toBe('sk');
      expect(service().preferred(['en'])).toBe('en');
      expect(service().preferred([])).toBe('en');
    });

    it('settled(): at once while nothing loads; otherwise once the language just wanted is on the page - followed before its effect ran', async () => {
      await service().init();
      await expect(service().settled()).resolves.toBeUndefined();

      const server = later<unknown>();
      site.respond = () => server.promise;
      // Signed in a moment ago: no change detection has run since, so nothing has followed it yet.
      site.account.set({ language: 'sk', keeps: true });
      let done = false;
      const settling = service()
        .settled()
        .then(() => (done = true));
      await settled();
      expect(done).toBe(false);
      expect(site.calls).toEqual(['en-gb', 'sk']);
      server.resolve(SK_BUNDLE);
      await settling;
      expect(service().language()).toBe('sk');
    });

    it('settled(): never later than its wait', async () => {
      await service().init();
      vi.useFakeTimers();
      site.respond = () => new Promise(() => undefined);
      site.account.set({ language: 'sk', keeps: true });
      let done = false;
      const settling = service()
        .settled()
        .then(() => (done = true));
      await vi.advanceTimersByTimeAsync(DEFAULT_WAITS.settle - 1);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await settling;
      expect(service().language()).toBe('en');
    });
  });

  describe('refusals and storage', () => {
    it('tells the site of a bundle the server refused with an answer - the status, the body, and when', async () => {
      const refused = vi.fn();
      reload({ onBundleRefused: refused });
      site.respond = fails(new HttpErrorResponse({ status: 503, error: { code: 'update_pending' } }));
      await service().init();
      expect(refused).toHaveBeenCalledWith(expect.objectContaining({ status: 503, body: { code: 'update_pending' }, starting: true, hasWords: false }));

      refused.mockClear();
      site.respond = fails(OFFLINE);
      await service().reload();
      expect(refused).not.toHaveBeenCalled();
      site.respond = fails({ status: 404, body: 'gone' });
      await service().setLanguage('sk');
      expect(refused).toHaveBeenCalledWith(expect.objectContaining({ status: 404, body: 'gone', starting: false }));
    });

    it('keeps the choice, the tab and the cache under the site’s own names - an upgrade keeps a visitor’s language', async () => {
      localStorage.setItem('academy-language', 'sk');
      reload({ storageKeys: { language: 'academy-language', cache: 'academy-language-cache' } });
      await service().init();
      expect(service().language()).toBe('sk');
      expect(JSON.parse(localStorage.getItem('academy-language-cache') ?? 'null')?.language).toBe('sk');
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it('asks through the site’s HttpClient by default, at the bundle’s path, the request marked for its interceptors', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideAnotokiTranslations(() => ({ bundleUrl: '/api/words/' }))],
      });
      const http = TestBed.inject(HttpTestingController);
      const starting = service().init();
      const request = http.expectOne('/api/words/en-gb');
      expect(request.request.context.get(ANOTOKI_TRANSLATION_BUNDLE)).toBe(true);
      request.flush(EN_BUNDLE);
      await starting;
      expect(service().t('theme.label')).toBe('Appearance');
      http.verify();
    });
  });
});

describe('TranslationService: wording', () => {
  let site: TranslationsSite;
  let warn: ReturnType<typeof vi.spyOn>;

  async function start(bundle: TranslationBundle | null, extra = {}): Promise<TranslationService> {
    site = translationsSite();
    site.respond = bundle ? gives(bundle) : fails(UNAVAILABLE);
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: translationsProviders(site, { waits: { retry: 0 }, ...extra }) });
    if (bundle) {
      localStorage.setItem('test-site:language', bundle.language);
    }
    const i18n = TestBed.inject(TranslationService);
    await i18n.init();
    return i18n;
  }

  beforeEach(() => {
    history.replaceState(null, '', '/');
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en']);
  });

  afterEach(() => vi.restoreAllMocks());

  it('fills placeholders in one pass: what a parameter holds is never filled again; nothing an object inherits fills one', async () => {
    const i18n = await start(EN_BUNDLE);
    expect(i18n.t('greeting.named', { name: '{name}' })).toBe('Hello, {name}!');
    expect(i18n.t('error.odd', {})).toBe('x {constructor} {toString} y');
    expect(i18n.t('greeting.named')).toBe('Hello, {name}!');
  });

  it('with a bundle in memory gives a key it lacks back as the key, and warns once - the compiled English never fills the hole', async () => {
    const i18n = await start({ ...EN_BUNDLE, values: { 'theme.label': 'Appearance' } });
    expect(i18n.t('greeting.named', { name: 'Mira' })).toBe('greeting.named');
    expect(i18n.t('greeting.named')).toBe('greeting.named');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[i18n] no string for 'greeting.named'");
  });

  it('has only the keys of the bundle - nothing an object inherits', async () => {
    const i18n = await start(EN_BUNDLE);
    expect(i18n.has('theme.label')).toBe(true);
    expect(i18n.has('constructor')).toBe(false);
    expect(i18n.has('toString')).toBe(false);
    expect(i18n.t('constructor')).toBe('constructor');
  });

  it('with no bundle reads the compiled English - then the key, warned once', async () => {
    const i18n = await start(null);
    expect(i18n.t('theme.label')).toBe('Theme');
    expect(i18n.t('constructor')).toBe('constructor');
    expect(i18n.t('nowhere.at.all')).toBe('nowhere.at.all');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  describe('a library key (anotoki.*) is never a key', () => {
    it('the database’s string first - an owner’s rewording', async () => {
      const i18n = await start(SK_BUNDLE, { libraryWords: { sk: { 'anotoki.topbar.account': 'Váš anotoki účet' } } });
      expect(i18n.t('anotoki.topbar.account')).toBe('Tvoj účet anotoki (prepísané)');
    });

    it('then the site’s own words for it, in the language or its base', async () => {
      const i18n = await start(SK_BUNDLE, { libraryWords: { sk: { 'anotoki.ui.close': 'Zatvoriť', 'anotoki.ui.or': '' } } });
      expect(i18n.t('anotoki.ui.close')).toBe('Zatvoriť');
      // An empty one is none.
      expect(i18n.t('anotoki.ui.or')).toBe('alebo');
    });

    it('then the library’s built-in words of the language on the page', async () => {
      const i18n = await start(SK_BUNDLE);
      expect(i18n.t('anotoki.ui.close')).toBe(LIBRARY_WORDS.sk['anotoki.ui.close']);
      expect(i18n.t('anotoki.topbar.menuButton', { name: 'Mira' })).toBe('Tvoja ponuka: Mira');
      expect(i18n.has('anotoki.siteStatus.tryAgain')).toBe(true);
    });

    it('then their English - in a language the library has no words for, and with no database at all', async () => {
      const german: TranslationBundle = { language: 'de', languages: [...LANGUAGES, { code: 'de', name: 'German', native_name: 'Deutsch' }], values: { 'theme.label': 'Aussehen' }, english: ENGLISH };
      const i18n = await start(german);
      expect(i18n.language()).toBe('de');
      expect(i18n.t('anotoki.ui.close')).toBe('Close');

      const none = await start(null);
      expect(none.t('anotoki.siteStatus.tryAgain')).toBe('Try again');
      expect(none.has('anotoki.siteStatus.tryAgain')).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });

    it('an unknown library key with no string is shown as itself, as any other', async () => {
      const i18n = await start(EN_BUNDLE);
      expect(i18n.t('anotoki.no.such')).toBe('anotoki.no.such');
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('libraryWord(): the database’s or the site’s, else null - the built-in words are the kit’s own fallbacks', async () => {
      const i18n = await start(SK_BUNDLE, { libraryWords: { sk: { 'anotoki.ui.or': 'či' } } });
      expect(i18n.libraryWord('anotoki.topbar.account')).toBe('Tvoj účet anotoki (prepísané)');
      expect(i18n.libraryWord('anotoki.ui.or')).toBe('či');
      expect(i18n.libraryWord('anotoki.ui.close')).toBeNull();
      expect(i18n.libraryWord('theme.label')).toBe('Vzhľad');
    });
  });

  it('cuts a sentence around a placeholder before filling the halves', async () => {
    const i18n = await start(EN_BUNDLE);
    expect(i18n.around('greeting.named', 'name', { name: '{x}' })).toEqual(['Hello, ', '!', true]);
    expect(i18n.aroundPlural('reviews.due', 3, 'count')).toEqual(['', ' reviews due', true]);
  });

  it('says when the cut was not made, so the page does not glue the value onto a sentence that left it out - or onto a key', async () => {
    const i18n = await start({ ...EN_BUNDLE, values: { ...ENGLISH, 'greeting.named': 'Hello!' } });
    expect(i18n.around('greeting.named', 'name')).toEqual(['Hello!', '', false]);
    expect(i18n.around('no.such', 'name')).toEqual(['no.such', '', false]);
  });

  it('picks the plural form the language asks for - Slovak: 1, 2 to 4, and 0 with 5 and more - and `.other` for a form the family lacks', async () => {
    const english = await start(EN_BUNDLE);
    expect([1, 2, 5].map((count) => english.plural('reviews.due', count))).toEqual(['1 review due', '2 reviews due', '5 reviews due']);

    const slovak = await start(SK_BUNDLE);
    expect([1, 2, 4, 0, 5, 12].map((count) => slovak.plural('reviews.due', count))).toEqual(['1 opakovanie', '2 opakovania', '4 opakovania', '0 opakovaní', '5 opakovaní', '12 opakovaní']);

    const short = await start({ ...SK_BUNDLE, values: { 'reviews.due.other': '{count}×' } });
    expect(short.plural('reviews.due', 1)).toBe('1×');
  });

  it('writes a count the way the language on the page writes numbers', async () => {
    const english = await start(EN_BUNDLE);
    expect(english.plural('reviews.due', 11523)).toBe('11,523 reviews due');
    expect(english.number(0.5, { style: 'percent' })).toBe('50%');
    const slovak = await start(SK_BUNDLE);
    expect(slovak.plural('reviews.due', 11523).replace(/\s/g, ' ')).toBe('11 523 opakovaní');
    expect(slovak.locale()).toBe('sk-SK');
  });

  it('is English in the English areas, whatever the person reads - and says so on <html lang>', async () => {
    const i18n = await start(SK_BUNDLE);
    TestBed.tick();
    expect(document.documentElement.lang).toBe('sk');
    expect(i18n.storedEnglishLang()).toBe('en');

    i18n.noteAddress('/admin/translations');
    TestBed.tick();
    expect(i18n.englishOnly()).toBe(true);
    expect(i18n.language()).toBe('sk');
    expect(i18n.effectiveLanguage()).toBe('en');
    expect(i18n.locale()).toBe('en-GB');
    expect(i18n.t('theme.label')).toBe('Appearance');
    expect(i18n.t('anotoki.ui.close')).toBe('Close');
    expect(i18n.storedEnglishLang()).toBeNull();
    expect(document.documentElement.lang).toBe('en');
    // The person's language still goes to the IAM.
    expect(i18n.signInLanguage()).toBe('sk');

    i18n.noteAddress('/lessons');
    TestBed.tick();
    expect(document.documentElement.lang).toBe('sk');
  });

  it('takes the site’s English areas', async () => {
    const i18n = await start(SK_BUNDLE, { englishOnly: (url: string) => url.startsWith('/owner') });
    i18n.noteAddress('/admin');
    expect(i18n.effectiveLanguage()).toBe('sk');
    i18n.noteAddress('/owner/words');
    expect(i18n.effectiveLanguage()).toBe('en');
  });

  it('reads the compiled English in an English area whose bundle came without English', async () => {
    const i18n = await start({ ...SK_BUNDLE, english: {} });
    i18n.noteAddress('/admin');
    expect(i18n.t('theme.label')).toBe('Theme');
  });
});
