import { HttpClient, HttpContext } from '@angular/common/http';
import { DOCUMENT, Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { AnotokiUiConfig, LIBRARY_WORDS } from '@anotoki/lib/ui';
import { firstValueFrom, isObservable } from 'rxjs';
import { ANOTOKI_TRANSLATIONS_CONFIG, ANOTOKI_TRANSLATION_BUNDLE, TranslationSettings, translationSettings } from './config';
import { FALLBACK_LANGUAGE, LanguageCandidate, TranslationParams, addressLanguage, bundleFrom, fillPlaceholders, languageCandidates, languageCode, pickLanguage } from './language';
import { SiteLanguage, TranslationBundle } from './models';
import { readDevice, readTab, writeDevice, writeTab } from './storage';

/** How a language is chosen (setLanguage()). */
export interface LanguageChoice {
  /**
   * Remembered as this device's choice and as this visit's - true for a
   * person's choice (a switcher, a select); false for a language that was
   * not chosen here (the account's, arriving): used, not stored.
   */
  remember?: boolean;
  /** Saved to the account while it decides; by default a remembered choice is. */
  save?: boolean;
  /**
   * The account page's way: the promise answers once the account has answered,
   * and when it refuses the page goes back to the language it was in (from
   * memory - no request: the server may be why it refused). Then nothing is
   * said under the switcher; the page says what happened.
   */
  revertible?: boolean;
}

/** What a site's shell gives its language switcher (provideAnotokiShell's `languages`), made by forShell(). */
export interface ShellLanguages {
  current: () => string;
  offered: () => readonly { code: string; name: string }[];
  choose: (code: string) => Promise<boolean>;
  notSaved: () => boolean;
  clearNotSaved: () => void;
}

/** The library's words, by language, as plain tables. */
const BUILT_IN: Readonly<Record<string, Readonly<Record<string, string>>>> = LIBRARY_WORDS;

/** What every library key starts with: the library's namespace. */
const LIBRARY_PREFIX = 'anotoki.';

/** A save of a revertible choice waits for the account's answer. */
interface SaveWaiter {
  /** The account has it. */
  saved(): void;
  /** The account refused it - or a later choice overtook it. */
  refused(): void;
}

/**
 * The site's words: which language the pages are read in, and the strings for
 * it. They live in the site's database (the admin Translations page rewords
 * them) and arrive as one bundle - GET {bundleUrl}/{code}, with the offered
 * languages and English beside them.
 *
 * Which language, strongest first (the family's ranking, 2026-10-06): this
 * tab's `?lang=` (taken out of the address, kept for the tab), a choice made on
 * the page, the account's language, the browser's languages (a Czech browser
 * reads Slovak while no Czech is offered), English. While the account's
 * language decides (account.decides(): signed in, with an IAM that keeps the
 * person's choices), it comes before what this device remembered - only the
 * tab's `?lang=` and a choice of this visit come first - a change of it is
 * followed when it comes, and a choice made on the page is saved to it: one
 * save at a time, the latest last. A refusal the site calls quiet (a language
 * the IAM does not offer) leaves the choice this site's own for the visit; any
 * other says so (`languageNotSaved`, the note under the switcher). A visitor,
 * and anybody whose account does not decide, keeps this device's choice first.
 *
 * `language` changes only once the bundle of that language is in memory: the
 * page is never in a language it has no words for. A key the bundle has no
 * string for comes back as itself, on the page, and warns once - the owner
 * wants to see which key is missing; while no bundle is in memory at all (an
 * upload not applied yet, the server out of reach) the site's compiled
 * English is read (`fallbackEnglish`), and then the key. A library key
 * (`anotoki.*`) is never shown as a key: the database's string, else the
 * site's own words for it (`libraryWords`), else the library's built-in words
 * of the language, else its English.
 *
 * The English areas (an admin panel: `englishOnly`) are English whatever the
 * person reads - `effectiveLanguage` says so, `<html lang>` too, and every
 * word goes through it.
 *
 * Every load - the start, a choice, reload(), asking again - takes the next
 * turn, and an answer is used only while its turn is still the last one: the
 * load begun last wins, however late an earlier answer comes.
 *
 * It never injects the Router and asks nothing while it is being made: the
 * Router makes the site's title strategy, the strategy reads this service, and
 * a request goes through interceptors that may want the Router - the circle
 * would close (NG0200). The title strategy says where the page is instead
 * (noteAddress()); the configuration and HttpClient are read when first needed.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private settingsMemo: TranslationSettings | null = null;

  private readonly _language = signal(FALLBACK_LANGUAGE);
  private readonly _languages = signal<readonly SiteLanguage[]>([]);
  /** The language's strings, English merged under them. Null: no bundle in memory. */
  private readonly _values = signal<ReadonlyMap<string, string> | null>(null);
  /** English itself, as the bundle has it - what the English areas read. Null: none came. */
  private readonly _english = signal<ReadonlyMap<string, string> | null>(null);
  private readonly _englishOnly = signal(false);
  private readonly _notSaved = signal(false);

  /** The person's language - what the switcher shows. `en` while there is no bundle. */
  readonly language = this._language.asReadonly();
  /** The languages on offer, in the order the owner set. Empty while no bundle has arrived. */
  readonly languages = this._languages.asReadonly();
  /** A bundle is in memory, from the cache or from the server. False: the pages read the compiled English. */
  readonly ready = computed(() => this._values() !== null);
  /** The address is one of the English areas. */
  readonly englishOnly = this._englishOnly.asReadonly();
  /** The language on the page: English in the English areas, the person's everywhere else. */
  readonly effectiveLanguage = computed(() => (this._englishOnly() ? FALLBACK_LANGUAGE : this._language()));
  /** What `Intl` is given for dates and numbers in the language on the page. */
  readonly locale = computed(() => {
    const code = this.effectiveLanguage();
    const locales = this.settings().locales;
    return Object.hasOwn(locales, code) ? locales[code] : code;
  });
  /**
   * The `lang` of an element whose whole content is stored English (a
   * changelog entry, a note kept from before the strings existed): `en` while
   * the page is in another language, null (no attribute) while it is English.
   */
  readonly storedEnglishLang = computed<'en' | null>(() => (this.effectiveLanguage() === FALLBACK_LANGUAGE ? null : FALLBACK_LANGUAGE));
  /**
   * What a sign-in hands the IAM as `uiLocales`: the person's language - only
   * while a bundle is in memory. With none, `language` is an `en` nobody chose,
   * and saying it would override the IAM's own choice.
   */
  readonly signInLanguage = computed<string | undefined>(() => (this.ready() ? this._language() : undefined));
  /** The account refused the language chosen last: the switcher's note says so while this is true. */
  readonly languageNotSaved = this._notSaved.asReadonly();

  /** The strings of the language on the page; null while no bundle is in memory. Maps, so `has('constructor')` is false. */
  private readonly strings = computed<ReadonlyMap<string, string> | null>(() => (this._englishOnly() ? (this._english() ?? (this._values() ? this.compiledEnglish() : null)) : this._values()));

  /** Keys already complained about, so one missing string is one warning. */
  private readonly warned = new Set<string>();
  /** Counts the loads begun: an answer that arrives after a later load began is dropped. */
  private turn = 0;
  /** The loads still out. While there is one, nothing asks again: never two in flight for the same thing. */
  private out = 0;
  /** Who waits for the loads out to be over (settled()). */
  private idle: (() => void)[] = [];
  /** init() has decided the language at least once: only then is there anything to follow or ask again for. */
  private started = false;
  /** What is in force came from the server since the page was loaded. False with the cache's, or nothing: the next navigation asks again. */
  private fresh = false;
  /** The first navigation of a visit ends a moment after init() asked: it does not ask a second time. */
  private firstNavigation = false;
  /** This tab's `?lang=`, and the device's choice - held in memory too, for a browser whose storage refuses writes. */
  private tab: string | null = null;
  private chosen: string | null = null;
  /**
   * A choice made on this page that the account has not taken: its save is on
   * its way, it was refused, or it was made before signing in. It holds for
   * the visit, before the account's language; once the account has it, the
   * account decides again.
   */
  private visit: string | null = null;
  /** The account's language as last seen: only a change is followed. */
  private seenAccount: string | null = null;
  /** The bundle on the page, as it came - and the way back: the one the last choice took off it. */
  private shown: TranslationBundle | null = null;
  private replaced: TranslationBundle | null = null;
  /** A save to the account is on its way; the latest choice made meanwhile waits for it. */
  private saving = false;
  private nextSave: { code: string; waiter: SaveWaiter | null } | null = null;

  constructor() {
    // Honest for a screen reader, the browser's hyphenation and its spelling: the English areas say `en`.
    effect(() => {
      this.document.documentElement.lang = this.effectiveLanguage();
    });
    // The account's language changed - somebody signed in, or chose another language on another anotoki
    // site and a token brought it. It reads only the account: what it does then is untracked.
    effect(() => {
      const account = this.accountLanguage();
      untracked(() => this.followAccount(account));
    });
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  /** The string for a key in the language on the page, its {placeholders} filled in one pass. */
  t(key: string, params?: TranslationParams): string {
    const value = this.find(key);
    return value === undefined ? this.missing(key) : fillPlaceholders(value, params);
  }

  /**
   * One of a plural family - `key.one`, `key.few`, `key.other` - by the rules
   * of the language on the page (Slovak: 1 -> one, 2-4 -> few, 0 and 5+ ->
   * other; a form the family lacks reads `.other`). Inside a family the number
   * is always `{count}`, written the way the language writes numbers.
   */
  plural(key: string, count: number, params?: TranslationParams): string {
    return this.t(this.pluralForm(key, count), { ...params, count: this.number(count) });
  }

  /**
   * A sentence cut at one placeholder, for markup inside it:
   * `{{ before }}<strong>{{ name }}</strong>{{ after }}`. The stored string is
   * cut first and each half filled after, so nothing a parameter holds can
   * move the cut. The third answer says whether the cut was made - not when the
   * key has no string, nor when the string leaves the placeholder out (another
   * language may): then the page must not draw the marked-up value at all.
   */
  around(key: string, placeholder: string, params?: TranslationParams): [before: string, after: string, found: boolean] {
    const value = this.find(key);
    if (value === undefined) {
      return [this.missing(key), '', false];
    }
    const mark = `{${placeholder}}`;
    const at = value.indexOf(mark);
    return at < 0 ? [fillPlaceholders(value, params), '', false] : [fillPlaceholders(value.slice(0, at), params), fillPlaceholders(value.slice(at + mark.length), params), true];
  }

  /** around() for a plural family's form, `{count}` written as plural() writes it. */
  aroundPlural(key: string, count: number, placeholder: string, params?: TranslationParams): [before: string, after: string, found: boolean] {
    return this.around(this.pluralForm(key, count), placeholder, { ...params, count: this.number(count) });
  }

  /** Whether a key has words to show now: the bundle's (or, with none, the compiled English); a library key always has. */
  has(key: string): boolean {
    return this.find(key) !== undefined;
  }

  /**
   * A library key's own words, or null for the built-in ones: the database's
   * string (the owner's rewording), else the site's (`libraryWords`). What the
   * kit's `lookup` and siteStatusWords() read, so the database wins over the
   * built-in words and the kit's own fallbacks still apply under it.
   */
  libraryWord(key: string): string | null {
    const value = this.strings()?.get(key);
    if (value !== undefined) {
      return value;
    }
    return this.siteLibraryWord(key);
  }

  /** A number the way the language on the page writes it: 11,523 in English, 11 523 in Slovak. */
  number(value: number, options?: Intl.NumberFormatOptions): string {
    return numberFormat(this.locale(), options).format(value);
  }

  // ── Choosing ───────────────────────────────────────────────────────────────

  /**
   * A choice: loads that language's bundle, then switches - and remembers it
   * on this device and for the visit, and saves it to the account while that
   * decides. Never rejects: false when the words could not be had (the page
   * stays as it is, and nothing is saved), or when a later choice overtook
   * this one. The last choice wins, even one that needs no request.
   *
   * The language the last choice took off the page is kept in memory (the way
   * back): choosing it again needs no request - so a choice can always be
   * undone, also when the server is why it must be.
   */
  async setLanguage(code: string, choice: LanguageChoice = {}): Promise<boolean> {
    const wanted = languageCode(code);
    if (!wanted) {
      return false;
    }
    const remember = choice.remember ?? true;
    const save = choice.save ?? remember;
    if (remember) {
      // A new choice is the answer to the note about the last one.
      this._notSaved.set(false);
    }
    const before = this.ready() ? this._language() : null;
    const turn = ++this.turn;
    if (wanted !== this._language() || !this.ready()) {
      const bundle = this.wayBack(wanted) ?? (await this.counted(this.request(wanted, false)));
      if (turn !== this.turn) {
        return false;
      }
      if (!bundle || bundle.language !== wanted) {
        // Switched off a moment ago: the server answered in English. The page stays in its language; the
        // switcher stops offering the one that went.
        if (bundle?.languages.some((language) => language.code === this._language())) {
          this._languages.set(bundle.languages);
        }
        return false;
      }
      this.putInForce(bundle, remember ? 'choice' : 'server');
    }
    if (remember) {
      // In memory too: storage may refuse the write, and the choice must hold for this page all the same.
      this.chosen = wanted;
      writeDevice(this.settings().keys.language, wanted);
      // A choice made here is stronger than the `?lang=` this tab came with.
      this.tab = null;
      writeTab(this.settings().keys.language, null);
      this.visit = wanted;
    }
    if (!save || !this.accountDecides()) {
      return true;
    }
    if (!choice.revertible) {
      this.saveLanguage(wanted, null);
      return true;
    }
    return new Promise<boolean>((answer) => {
      this.saveLanguage(wanted, {
        saved: () => answer(true),
        refused: () => {
          // Back to the language the page was in: from memory, so it needs no request.
          if (before !== null && this._language() === wanted) {
            void this.setLanguage(before, { save: false }).then(() => answer(false));
          } else {
            answer(false);
          }
        },
      });
    });
  }

  /** The note under the switcher goes (the next choice, a click elsewhere, Escape). */
  clearLanguageNotSaved(): void {
    this._notSaved.set(false);
  }

  /**
   * The language a new account is given: the reader's wishes - the same the
   * page follows - settled against what the server offers (the IAM's public
   * configuration's `languages`). With a bundle on the page this is
   * `language()`; without one it is not: the page reads the compiled English,
   * and an account made then would be English for good.
   */
  preferred(offered: readonly string[]): string {
    return offered.length ? pickLanguage(this.candidates(), offered, this.settings().browserAliases) : this._language();
  }

  // ── Following ──────────────────────────────────────────────────────────────

  /**
   * The strings again, from the server: after somebody changed them or the
   * languages (the admin pages call it), and after an Apply that applied
   * something (the strings may only now exist). Asks for the language on the
   * page and settles against the list that comes with it - a language hidden
   * or offered a moment ago is followed - then puts the answer in force and in
   * the cache. Never rejects; when the server cannot be had the page stays as
   * it is and asks again at the next navigation.
   */
  async reload(): Promise<void> {
    try {
      if (!this.started) {
        // Nothing has been read yet: the start asks, and what it gets is fresh.
        await this.init();
        return;
      }
      // What is in memory is no longer known to be what the server has; the way back holds words from before.
      this.fresh = false;
      this.replaced = null;
      await this.again();
    } catch (error) {
      console.error('[i18n] the strings could not be read again', error);
    }
  }

  /**
   * Where the page is, said by the site's title strategy after every
   * navigation: the English areas are English, and a `?lang=` arriving with
   * an address inside the app holds for the tab (one nobody offers does not
   * unseat a choice already made).
   *
   * A navigation is also when a page that is behind asks for its words once
   * more: no bundle in memory (an upload not applied yet, a lost answer), or
   * the cached one whose refresh failed. One load a navigation, none while
   * another is out, none at the first navigation of a visit (it ends a moment
   * after init() asked), none while the server cannot be asked.
   */
  noteAddress(url: string): void {
    this._englishOnly.set(this.settings().englishOnly(url));
    const first = this.firstNavigation;
    this.firstNavigation = false;
    if (!this.started) {
      return;
    }
    const tag = addressLanguage(url);
    const offered = this._languages().map((language) => language.code);
    if (tag && tag !== this.tab && (!offered.length || offered.includes(tag) || offered.includes(tag.split('-')[0]))) {
      this.tab = tag;
      writeTab(this.settings().keys.language, tag);
      const settled = pickLanguage(this.candidates(), offered, this.settings().browserAliases);
      if (offered.length && settled !== this._language()) {
        void this.setLanguage(settled, { remember: false });
        return;
      }
    }
    if (!first && !this.fresh && this.out === 0 && this.canAsk()) {
      void this.again().catch((error: unknown) => console.error('[i18n] the strings could not be asked for again', error));
    }
  }

  /**
   * Resolves when the wanted language is on the page, or its load is over -
   * never rejects, never later than `waits.settle` (2 s). A guard of the
   * signed-in pages awaits it, so somebody who has just signed in does not see
   * their account's pages in the sign-in page's language first.
   */
  settled(): Promise<void> {
    if (!this.started) {
      return Promise.resolve();
    }
    // The account's language may have changed a moment ago, before the effect that follows it ran.
    this.followAccount(this.accountLanguage());
    if (this.out === 0) {
      return Promise.resolve();
    }
    return Promise.race([new Promise<void>((done) => this.idle.push(done)), wait(this.settings().waits.settle)]);
  }

  // ── Starting ───────────────────────────────────────────────────────────────

  /**
   * Once as the site starts (an app initializer; after the sign-in has put
   * the address back): decides the language and gets its words before the
   * first page is drawn. Never rejects, and may be called again.
   *
   * While the server cannot be asked (`canAsk`), nothing is requested: the
   * cached bundle is taken when there is one - in whatever language it is in -
   * and the pages read the compiled English otherwise. With a cache the fresh
   * bundle is asked for all the same, and the start waits a second for it (a
   * 304, mostly); with none it waits three, asking once more after half a
   * second when the first answer is lost - then the page starts on what it has,
   * and the bundle is put in force when it arrives.
   */
  async init(): Promise<void> {
    try {
      await this.start();
    } catch (error) {
      console.error('[i18n] the language could not be set up', error);
    }
  }

  private async start(): Promise<void> {
    const location = this.document.location;
    this._englishOnly.set(this.settings().englishOnly(location?.pathname ?? '/'));
    this.takeAddressLanguage();
    this.seenAccount = this.accountLanguage();
    this.started = true;

    // Whether the server can be asked decides what a cache is worth. While it cannot, nothing is known of
    // the wishes the server would settle, and the language the cache is in is the best there is.
    const running = this.canAsk();
    const candidates = this.candidates();
    const cached = this.cachedBundle(candidates, running);
    if (cached) {
      this.putInForce(cached, 'cache');
    }
    if (!running) {
      return;
    }

    const turn = ++this.turn;
    const first = cached ? cached.language : candidates[0].code;
    const waits = this.settings().waits;
    this.firstNavigation = true;
    const loading = this.counted(cached ? this.refresh(turn, candidates, first, true) : this.firstLoad(turn, candidates, first));
    await Promise.race([loading, wait(cached ? waits.cache : waits.first)]);
  }

  /** The start with no cache: one lost answer should not leave a first visit in English - it is asked once more. */
  private async firstLoad(turn: number, candidates: readonly LanguageCandidate[], first: string): Promise<boolean> {
    if ((await this.refresh(turn, candidates, first, true)) || turn !== this.turn) {
      return true;
    }
    await wait(this.settings().waits.retry);
    return turn === this.turn && this.refresh(turn, candidates, first, true);
  }

  /** The strings once more, for the wishes as they are now: the language in force first - its bundle names what is on offer. */
  private again(): Promise<boolean> {
    const turn = ++this.turn;
    const candidates = this.candidates();
    return this.counted(this.refresh(turn, candidates, this.ready() ? this._language() : candidates[0].code, false));
  }

  /** One load, put in force when it came and is still the last one begun. */
  private async refresh(turn: number, candidates: readonly LanguageCandidate[], first: string, starting: boolean): Promise<boolean> {
    const bundle = await this.load(candidates, first, starting);
    if (!bundle || turn !== this.turn) {
      return false;
    }
    this.putInForce(bundle, 'server');
    return true;
  }

  /**
   * Counted while it is out, whichever way it ends. Whoever waits for the
   * loads to be over (settled()) hears of it a moment later - after what the
   * load's own caller does with the answer: the page is in the language then.
   */
  private async counted<T>(work: Promise<T>): Promise<T> {
    this.out++;
    try {
      return await work;
    } finally {
      this.out--;
      if (this.out === 0 && this.idle.length) {
        const waiting = this.idle;
        this.idle = [];
        setTimeout(() => waiting.forEach((done) => done()));
      }
    }
  }

  /**
   * The bundle for the language the wishes settle on. The offered languages
   * arrive with the bundle itself, so: ask for `first`, settle against the
   * list that came, and fetch that language if it is another one. One request
   * mostly (the server answers `sk-sk` by `sk`); two at most - a first visit
   * whose first wish is not on offer, or a language hidden or offered since
   * the cache was made. When the second fails the first answer is what there
   * is: a page in the database's English.
   */
  private async load(candidates: readonly LanguageCandidate[], first: string, starting: boolean): Promise<TranslationBundle | null> {
    const answer = await this.request(first, starting);
    if (!answer) {
      return null;
    }
    const settled = pickLanguage(
      candidates,
      answer.languages.map((language) => language.code),
      this.settings().browserAliases,
    );
    return settled === answer.language ? answer : ((await this.request(settled, starting)) ?? answer);
  }

  /** One bundle from the server, checked - or null: out of reach, refused, or not what a bundle is. */
  private async request(code: string, starting: boolean): Promise<TranslationBundle | null> {
    try {
      return bundleFrom(await this.fetchBundle(code));
    } catch (error) {
      this.refused(error, starting);
      // Offline, a 503 before Apply, the server down: the cache - or the compiled English - is what the page
      // shows then; it is not worth stopping the site over.
      return null;
    }
  }

  /** An answer that was a refusal (a 503 not_set_up, update_pending...) is the site's to read. */
  private refused(error: unknown, starting: boolean): void {
    const status = typeof (error as { status?: unknown } | null)?.status === 'number' ? (error as { status: number }).status : 0;
    const listener = this.settings().onBundleRefused;
    if (status > 0 && listener) {
      const failure = error as { error?: unknown; body?: unknown };
      listener({ status, body: failure.error !== undefined ? failure.error : failure.body, error, starting, hasWords: this.ready() });
    }
  }

  /**
   * GET {bundleUrl}/{code}: the server's answer, unchecked - through the
   * site's own way when it has one (`fetchBundle`), else HttpClient, marked
   * ANOTOKI_TRANSLATION_BUNDLE for the site's interceptors. On its own so a
   * spec's stand-in answers without HTTP.
   */
  protected fetchBundle(code: string): Promise<unknown> {
    const settings = this.settings();
    const answer = settings.fetchBundle
      ? settings.fetchBundle(code)
      : this.injector.get(HttpClient).get<unknown>(`${settings.bundleUrl}/${encodeURIComponent(code)}`, { context: new HttpContext().set(ANOTOKI_TRANSLATION_BUNDLE, true) });
    return isObservable(answer) ? firstValueFrom(answer) : Promise.resolve(answer);
  }

  /** Whether the server can be asked at all (`canAsk`). On its own so a spec's stand-in needs nothing. */
  protected canAsk(): boolean {
    return this.settings().canAsk();
  }

  /**
   * Puts a bundle in force as the one a spec runs with (the testing entry
   * point's stand-in): it counts as the server's - nothing asks for it again -
   * and is kept nowhere.
   */
  protected use(bundle: TranslationBundle): void {
    this.putInForce(bundle, 'test');
  }

  /**
   * Puts a checked bundle in force - strings first, then the language they
   * are in. The server's (and a choice's) is kept for the next visit; the
   * cache's is in force only until the server's comes. A choice keeps the
   * bundle it takes off the page as the way back; anything else closes it.
   */
  private putInForce(bundle: TranslationBundle, from: 'server' | 'choice' | 'cache' | 'test'): void {
    if (from !== 'choice') {
      this.replaced = null;
    } else if (this.shown && this.shown.language !== bundle.language) {
      this.replaced = this.shown;
    }
    this.shown = bundle;
    const values = new Map(Object.entries(bundle.values));
    const english = bundle.language === FALLBACK_LANGUAGE ? values : new Map(Object.entries(bundle.english ?? {}));
    this._values.set(values);
    this._english.set(english.size ? english : null);
    this._languages.set(bundle.languages);
    this._language.set(bundle.language);
    this.fresh = from !== 'cache';
    if (from === 'server' || from === 'choice') {
      writeDevice(this.settings().keys.cache, JSON.stringify(bundle));
    }
  }

  /** The bundle the last choice took off the page, when it is in that language and the language is still offered. */
  private wayBack(code: string): TranslationBundle | null {
    const replaced = this.replaced;
    return replaced?.language === code && this.offers(code) ? { ...replaced, languages: [...this._languages()] } : null;
  }

  /**
   * The cached bundle, only when it is one - it parses, has the shape, and
   * (`settle`) is in the language the wishes settle on now. Anything else is
   * removed: a corrupt or outdated cache is no cache. Without `settle` (the
   * server cannot be asked) its language is not asked about: it is still the
   * reader's own words from their last visit, used and left where it is.
   */
  private cachedBundle(candidates: readonly LanguageCandidate[], settle: boolean): TranslationBundle | null {
    const key = this.settings().keys.cache;
    const raw = readDevice(key);
    if (raw === null) {
      return null;
    }
    let bundle: TranslationBundle | null = null;
    try {
      bundle = bundleFrom(JSON.parse(raw));
    } catch {
      bundle = null;
    }
    const offered = bundle?.languages.map((language) => language.code) ?? [];
    if (bundle && (!settle || bundle.language === pickLanguage(candidates, offered, this.settings().browserAliases))) {
      return bundle;
    }
    writeDevice(key, null);
    return null;
  }

  // ── The account ────────────────────────────────────────────────────────────

  /** The account's language, while there is one - read as a signal where the site gives one. */
  private accountLanguage(): string | null {
    return languageCode(this.settings().account?.language() ?? null);
  }

  private accountDecides(): boolean {
    return this.settings().account?.decides?.() ?? false;
  }

  /**
   * A changed language of the account: adopted when it comes, while this site
   * offers it and nothing here holds against it - this tab's `?lang=`; while
   * the account decides, a choice of this visit it has not taken (one on its
   * way to it included); otherwise any choice this device remembered. Used,
   * never stored.
   */
  private followAccount(language: string | null): void {
    if (!this.started || language === this.seenAccount) {
      return;
    }
    this.seenAccount = language;
    if (language !== null && language === this.visit) {
      // The account has the choice of this visit now: it decides again.
      this.visit = null;
    }
    if (!language || language === this._language() || !this.offers(language)) {
      return;
    }
    const held = languageCode(this.tabWish()) ?? (this.accountDecides() ? this.visit : languageCode(this.chosenWish()));
    if (!held) {
      void this.setLanguage(language, { remember: false });
    }
  }

  /**
   * A choice, to the account: one save at a time, and the last choice is the
   * one saved - two in flight could be handled in either order and leave the
   * account on a language the page no longer shows. A choice made while a save
   * is on its way waits for it (only the latest), and is not sent when the
   * account has it by then. An earlier save's refusal that a later choice has
   * overtaken is no news.
   */
  private saveLanguage(code: string, waiter: SaveWaiter | null): void {
    if (this.saving) {
      this.nextSave?.waiter?.refused();
      this.nextSave = { code, waiter };
      return;
    }
    const account = this.settings().account;
    if (!account?.save || !this.accountDecides() || this.accountLanguage() === code) {
      if (this.accountLanguage() === code && this.visit === code) {
        this.visit = null;
      }
      waiter?.saved();
      return;
    }
    this.saving = true;
    /** The save is over: the waiting choice, if any, is saved now - and then this one's answer is no news. */
    const settle = (): boolean => {
      const next = this.nextSave;
      this.saving = false;
      this.nextSave = null;
      if (next) {
        this.saveLanguage(next.code, next.waiter);
      }
      return next !== null;
    };
    let saving: Promise<unknown>;
    try {
      saving = Promise.resolve(account.save(code));
    } catch (error) {
      saving = Promise.reject(error);
    }
    saving.then(
      () => {
        if (this.visit === code) {
          this.visit = null;
        }
        settle();
        waiter?.saved();
      },
      (error: unknown) => {
        if (settle()) {
          waiter?.refused();
          return;
        }
        if (waiter) {
          waiter.refused();
          return;
        }
        if (!this.quiet(error)) {
          this._notSaved.set(true);
        }
      },
    );
  }

  private quiet(error: unknown): boolean {
    const quiet = this.settings().account?.quiet;
    if (quiet) {
      return quiet(error);
    }
    return (error as { code?: unknown } | null)?.code === 'invalid_request';
  }

  // ── The wishes ─────────────────────────────────────────────────────────────

  /**
   * The wishes as they stand now. While the account's language decides, what
   * this device remembered comes after it: it may be older than a choice made
   * since on another anotoki site.
   */
  private candidates(): LanguageCandidate[] {
    const navigator = this.document.defaultView?.navigator;
    const browser = navigator?.languages?.length ? navigator.languages : [navigator?.language];
    const account = this.accountLanguage();
    return this.accountDecides()
      ? languageCandidates({ tab: this.tabWish(), chosen: this.visit, account, device: this.chosenWish(), browser })
      : languageCandidates({ tab: this.tabWish(), chosen: this.chosenWish(), account, browser });
  }

  /** `?lang=` of this tab: what this page took from its address, else what the tab kept. */
  private tabWish(): string | null {
    return this.tab ?? readTab(this.settings().keys.language);
  }

  /** The device's choice: what was chosen on this page, else what the device kept. */
  private chosenWish(): string | null {
    return this.chosen ?? readDevice(this.settings().keys.language);
  }

  private offers(code: string): boolean {
    return this._languages().some((language) => language.code === code);
  }

  /**
   * `?lang=` holds for this tab: kept in sessionStorage - it survives a round
   * trip to the IAM and the navigation inside the app - and taken out of the
   * address before the router reads it. Never kept on the device: a link
   * somebody followed is not a choice they made. Kept in memory too: where
   * sessionStorage refuses the write, the link still works for this page.
   */
  private takeAddressLanguage(): void {
    const view = this.document.defaultView;
    const location = this.document.location;
    const parts = (location?.search ?? '').replace(/^\?/, '').split('&');
    const given = parts.filter((part) => part.split('=')[0] === 'lang');
    if (!view || !location || !given.length) {
      return;
    }
    const code = addressLanguage(`?${given[0]}`);
    if (code) {
      this.tab = code;
      writeTab(this.settings().keys.language, code);
    }
    // The other parameters stay byte for byte as they came.
    const rest = parts.filter((part) => part !== '' && part.split('=')[0] !== 'lang').join('&');
    try {
      view.history.replaceState(view.history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    } catch {
      // A browser that refuses: the parameter stays, and does no harm.
    }
  }

  // ── Words ──────────────────────────────────────────────────────────────────

  /** The configuration, read the first time it is needed - untracked: its factory is the site's, and no signal it reads is followed. */
  private settings(): TranslationSettings {
    return (this.settingsMemo ??= untracked(() => translationSettings(this.injector.get(ANOTOKI_TRANSLATIONS_CONFIG, null))));
  }

  /** The compiled English as a map, for an English area whose bundle came without English. */
  private compiledEnglish(): ReadonlyMap<string, string> {
    return new Map(Object.entries(this.settings().fallbackEnglish));
  }

  /** What a key reads now, or nothing (see the class comment for the order). */
  private find(key: string): string | undefined {
    const strings = this.strings();
    const value = strings?.get(key);
    if (value !== undefined) {
      return value;
    }
    if (key.startsWith(LIBRARY_PREFIX)) {
      const word = this.siteLibraryWord(key) ?? this.builtInWord(key);
      if (word !== null) {
        return word;
      }
    }
    if (strings === null) {
      const english = this.settings().fallbackEnglish;
      if (Object.hasOwn(english, key)) {
        return english[key];
      }
    }
    return undefined;
  }

  /** The site's own words for a library key (`libraryWords`), in the language on the page or its base. */
  private siteLibraryWord(key: string): string | null {
    if (!key.startsWith(LIBRARY_PREFIX)) {
      return null;
    }
    const code = this.effectiveLanguage();
    const own = this.settings().libraryWords;
    for (const language of [code, code.split('-')[0]]) {
      const table = Object.hasOwn(own, language) ? own[language] : undefined;
      const word = table && Object.hasOwn(table, key) ? table[key] : undefined;
      if (typeof word === 'string' && word !== '') {
        return word;
      }
    }
    return null;
  }

  /** The library's built-in words for a library key: the language on the page's, its base's, English. */
  private builtInWord(key: string): string | null {
    const code = this.effectiveLanguage();
    for (const language of [code, code.split('-')[0], FALLBACK_LANGUAGE]) {
      const table = Object.hasOwn(BUILT_IN, language) ? BUILT_IN[language] : undefined;
      const word = table && Object.hasOwn(table, key) ? table[key] : undefined;
      if (typeof word === 'string' && word !== '') {
        return word;
      }
    }
    return null;
  }

  /** The family member a number asks for: its own form when the strings have it, `.other` otherwise. */
  private pluralForm(key: string, count: number): string {
    const form = `${key}.${pluralRules(this.effectiveLanguage()).select(count)}`;
    return this.has(form) ? form : `${key}.other`;
  }

  private missing(key: string): string {
    if (!this.warned.has(key)) {
      this.warned.add(key);
      console.warn(`[i18n] no string for '${key}'`);
    }
    return key;
  }

  // ── For the kit and the shell ──────────────────────────────────────────────

  /**
   * The kit's words from here - spread into provideAnotokiUi(): its language is
   * the page's (English in the English areas), and its `lookup` reads the
   * database's string of `anotoki.<key>` (an owner's rewording) or the site's
   * `libraryWords`, so they win over the kit's built-in words.
   */
  forKit(): Required<Pick<AnotokiUiConfig, 'language' | 'lookup'>> {
    return {
      language: () => this.effectiveLanguage(),
      lookup: (key) => this.libraryWord(LIBRARY_PREFIX + key),
    };
  }

  /**
   * The shell's language switcher, from here - provideAnotokiShell's
   * `languages`: the offered languages under their own names, a choice through
   * setLanguage() (saved to the account), and the note when the account
   * refused it.
   */
  forShell(): ShellLanguages {
    return {
      current: () => this.language(),
      offered: () => this.languages().map((language) => ({ code: language.code, name: language.native_name })),
      choose: (code) => this.setLanguage(code),
      notSaved: () => this.languageNotSaved(),
      clearNotSaved: () => this.clearLanguageNotSaved(),
    };
  }
}

const PLURAL_RULES = new Map<string, Intl.PluralRules>();
const NUMBER_FORMATS = new Map<string, Intl.NumberFormat>();

/** The plural rules of a language: only ever asked with a code that passed the pattern. */
function pluralRules(language: string): Intl.PluralRules {
  let rules = PLURAL_RULES.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    PLURAL_RULES.set(language, rules);
  }
  return rules;
}

function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = options ? `${locale} ${JSON.stringify(options)}` : locale;
  let format = NUMBER_FORMATS.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    NUMBER_FORMATS.set(key, format);
  }
  return format;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((done) => setTimeout(done, milliseconds));
}
