import { HttpErrorResponse } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { EnvironmentInjector, Injectable, computed, inject, runInInjectionContext, signal } from '@angular/core';
import { ANOTOKI_MIGRATIONS_CONFIG, SiteStatus } from '@anotoki/lib/migrations';
import { firstValueFrom } from 'rxjs';
import {
  ANOTOKI_AUTH_BROWSER,
  ANOTOKI_AUTH_CONFIG,
  AnotokiAuthClient,
  AnotokiInitResult,
  AnotokiPreferenceChanges,
  AnotokiSavedPreferences,
  AnotokiUser,
  AuthBootConfig,
  AuthState,
  DEFAULT_HINT_COOKIE,
  DEFAULT_REDIRECT_PATH,
  SignInFailure,
  SignInOptions,
  SignInSession,
  StoredSession,
  VisitorKeyStore,
} from '@anotoki/lib/auth/core';
import { ANOTOKI_AUTH_CLIENT_FACTORY } from './config';
import { HINT_PROBE_MS, hintMayHop, readHint, readMarker, writeMarker } from './hint';
import { Caller } from '@anotoki/lib/auth/marker';
import { VISITOR_KEY_HEADER } from './issued-as';
import { SavesInFlight } from './saves-in-flight';

/** How long the boot waits for the refresh that follows the IAM before the page is drawn anyway. */
export const FOLLOW_WAIT_MS = 5_000;

/**
 * Signing in, through the anotoki IAM - one service for every site, built on
 * Japanese Academy's state machine.
 *
 * init() (the app initializer, before the router's first navigation) reads the
 * boot configuration from the site's server - the IAM, the client id, whether
 * the site requires signing in - and then, in order:
 *
 *   1. finishes a callback: the code exchanged, the page put back where the
 *      sign-in started. A silent sign-in that came back without one says
 *      nothing (the console only); an ordinary one is signInFailure;
 *   2. restores a stored session (the tokens the IAM's SDK kept under the same
 *      keys are the library's: nobody is signed out by the move);
 *   3. follows the IAM: when the IAM's sign-in hint is gone, or another one,
 *      since the session was made, one refresh - signed out at the IAM is
 *      signed out here, at this page load, not ten minutes later;
 *   4. where the site lets visitors in and nobody is signed in here: the hint
 *      (hint.ts) - a person signed in at the IAM is signed in here with one
 *      silent hop, tried once per hint value. Where the site requires signing
 *      in, personGuard sends people to the IAM as ever.
 *
 * A page is one person's: another person signing in in another tab - or
 * anybody, on a page shown to a visitor - loads the page afresh; tokens are
 * handed out only for the person the page shows. Roles come from the ID token
 * (the server reads its own from the access token); MEMBER is everybody.
 */
@Injectable({ providedIn: 'root' })
export class AnotokiAuth implements SignInSession {
  private readonly config = inject(ANOTOKI_AUTH_CONFIG);
  private readonly createClient = inject(ANOTOKI_AUTH_CLIENT_FACTORY);
  private readonly browser = inject(ANOTOKI_AUTH_BROWSER);
  private readonly http = inject(HttpClient);
  private readonly injector = inject(EnvironmentInjector);
  private readonly saves = inject(SavesInFlight);

  private client: AnotokiAuthClient | null = null;
  /** Whose the page is: the IAM user id signed in when it was first shown signed in (undefined until then). */
  private shownFor: string | undefined;
  /** The page was shown to a visitor: a sign-in (in another tab) means a fresh page. */
  private shownAsVisitor = false;
  /** The last save of the account's preferences, settled either way: the next waits for it. */
  private lastPreferenceSave: Promise<unknown> = Promise.resolve();
  private starting: Promise<void> | null = null;

  private readonly stateSignal = signal<AuthState>('starting');
  private readonly userSignal = signal<AnotokiUser | null>(null);
  private readonly loginRequiredSignal = signal(true);
  private readonly availableSignal = signal(false);
  private readonly failureSignal = signal<SignInFailure | null>(null);

  readonly state = this.stateSignal.asReadonly();
  /** Who is signed in - the ID token's claims - while the page is theirs. */
  readonly user = computed(() => (this.stateSignal() === 'signed-in' ? this.userSignal() : null));
  readonly signedIn = computed(() => this.stateSignal() === 'signed-in');
  readonly sub = computed(() => this.user()?.sub ?? null);
  /**
   * Whether the site requires signing in, as the server relays it: true unless it says false (fails
   * closed); true from the moment a visitor's request is refused with sign_in_required.
   */
  readonly loginRequired = this.loginRequiredSignal.asReadonly();
  readonly visitorsWelcome = computed(() => !this.loginRequiredSignal());
  /** Whether a sign-in can be offered: the server named an IAM that knows the site. */
  readonly signInAvailable = this.availableSignal.asReadonly();
  /** A sign-in that came back without one, or could not start - never a silent one's. */
  readonly signInFailure = this.failureSignal.asReadonly();
  /** This site's roles, in capitals: ADMIN and EDITOR open its admin area; MEMBER is everybody. */
  readonly roles = computed(() => (this.user()?.roles ?? []).map((role) => String(role).toUpperCase()));
  readonly isAdmin = computed(() => this.roles().includes('ADMIN'));
  readonly isStaff = computed(() => this.isAdmin() || this.roles().includes('EDITOR'));
  /** The name to show: the IAM's, or the address; '' when there is neither. */
  readonly displayName = computed(() => {
    const user = this.user();
    return user ? user.preferred_username || user.email || '' : '';
  });
  /** The account's theme, dates and clock while the page is a signed-in person's and the IAM keeps them; null otherwise. */
  readonly preferences = computed(() => this.user()?.preferences ?? null);
  /** The account's language while the page is a signed-in person's. Not a promise the site speaks it. */
  readonly locale = computed(() => this.user()?.locale ?? null);

  /** Once, before the router's first navigation. Never rejects. On a silent hop, it never resolves: the page is leaving. */
  init(): Promise<void> {
    this.starting ??= this.start();
    return this.starting;
  }

  /**
   * Off to the IAM's sign-in, back to `returnTo`. Waits for the writes on their way and asks the site
   * (beforeSignIn) first. True when the browser is on its way; false when the site said no, or the sign-in
   * could not start (signInFailure says why: storage_unavailable).
   */
  async signIn(options: SignInOptions = {}): Promise<boolean> {
    const client = this.client;
    if (!client) {
      return false;
    }
    await this.saves.settled();
    if (this.config.beforeSignIn && !(await this.fromSite(this.config.beforeSignIn))) {
      return false;
    }
    const returnTo = options.returnTo ?? this.failureSignal()?.returnTo ?? this.browser.path();
    const uiLocales = this.uiLocales();
    try {
      await client.login({
        returnTo,
        ...(options.prompt ? { prompt: options.prompt } : {}),
        ...(options.maxAge !== undefined ? { maxAge: options.maxAge } : {}),
        ...(uiLocales ? { uiLocales } : {}),
      });
      return true;
    } catch (error) {
      console.error('[anotoki auth] the sign-in could not start', error);
      const code = (error as { code?: unknown } | null)?.code;
      this.failureSignal.set({ code: typeof code === 'string' && code !== '' ? code : 'could_not_start', returnTo });
      return false;
    }
  }

  /** signIn() opening on the IAM's registration form. */
  register(options: Omit<SignInOptions, 'prompt'> = {}): Promise<boolean> {
    return this.signIn({ ...options, prompt: 'create' });
  }

  /**
   * Signs out - everywhere by default (the IAM ends its session, and the browser comes back to the site),
   * or this site only (`local`). Either way the IAM's hint, as it is now, counts as tried: this site never
   * signs the person straight back in with it.
   */
  async signOut(options: { local?: boolean } = {}): Promise<boolean> {
    const client = this.client;
    if (!client) {
      return false;
    }
    await this.saves.settled();
    if (this.config.beforeSignOut && !(await this.fromSite(this.config.beforeSignOut))) {
      return false;
    }
    this.markTried(this.hintNow());
    await client.logout({ local: options.local === true });
    return true;
  }

  /** A valid access token for the page's person, or null: nobody signed in, or somebody else than whose the page is. */
  async token(): Promise<string | null> {
    return this.client ? this.ownToken(await this.client.getAccessToken()) : null;
  }

  /** After the API refused `refused` (by default the token held now): a different one for the page's person, or null. */
  async refresh(refused?: string | null): Promise<string | null> {
    return this.client ? this.ownToken(await this.client.refresh(refused)) : null;
  }

  /** The IAM user id signed in here now (in any tab), or null. */
  subject(): string | null {
    return this.client?.user()?.sub ?? null;
  }

  /**
   * Whom a request issued now is for: a visitor's while the page is shown to one; a person's whenever the
   * sign-in is set up otherwise (signed in, or on the way to the IAM); nobody's when there is no sign-in.
   */
  caller(): Caller {
    if (this.stateSignal() === 'visitor') {
      return 'visitor';
    }
    return this.client ? 'person' : 'nobody';
  }

  /** The API answered 401: when the session is over, the page follows; when it is somebody else's, a fresh page. */
  refused(): void {
    this.follow();
  }

  /**
   * A visitor's request was refused with 401 sign_in_required: the site requires signing in now (the switch
   * turned on since the page loaded). Nobody visits from now on; the visitor's key stays where it is, so a
   * sign-in still moves what it holds.
   */
  noteSignInRequired(): void {
    this.loginRequiredSignal.set(true);
    if (this.stateSignal() === 'visitor') {
      this.stateSignal.set('signed-out');
    }
  }

  /** Forgets the failed sign-in (its words were read, the person goes on). */
  dismissFailure(): void {
    this.failureSignal.set(null);
  }

  /** The IAM's page of the account itself; '' before there is a sign-in. */
  accountUrl(): string {
    return this.client?.accountUrl() ?? '';
  }

  issuer(): string {
    return this.client?.issuer() ?? '';
  }

  clientId(): string {
    return this.client?.clientId() ?? '';
  }

  /** The languages the IAM's pages speak (discovery's ui_locales_supported), or null when it does not say. */
  async uiLocalesSupported(): Promise<string[] | null> {
    if (!this.client) {
      return null;
    }
    const list = (await this.client.discovery())['ui_locales_supported'];
    return Array.isArray(list) ? list.filter((code): code is string => typeof code === 'string') : null;
  }

  /**
   * Saves to the account what the person chose with the site's own controls - for every anotoki site. One
   * save at a time (each answer is the whole account, and an earlier answer arriving late would put back what
   * a later save changed), and only for the person the page is shown to: `login_required`, and nothing sent,
   * when it is nobody's page or another person is signed in now. Rejects with an Error whose `code` is the
   * IAM's or the client's. AccountPreferences builds the outcomes on this.
   */
  savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> {
    const save = (): Promise<AnotokiSavedPreferences> => {
      const client = this.client;
      if (!client || this.stateSignal() !== 'signed-in' || client.user()?.sub !== this.shownFor) {
        return Promise.reject(Object.assign(new Error('Nobody whose page this is is signed in'), { code: 'login_required' }));
      }
      return client.savePreferences(changes);
    };
    const saved = this.lastPreferenceSave.then(save);
    this.lastPreferenceSave = saved.catch(() => undefined);
    return saved;
  }

  /**
   * fetch() for the site's own addresses (a report opened as a blob, a file downloaded), the way the
   * interceptor sends HttpClient's: decided as it is called - a person's with the page's person's token, or
   * never sent (a 401 sign_in_required of its own); a visitor's with the visitor's key while visitors are
   * welcome; one 401 to a token that looked good gets one fresh token and one retry, for the same person.
   * Another origin gets the request as it is - never a token or a key.
   */
  async fetch(url: string, init: RequestInit = {}, as: Caller | 'caller' = 'caller'): Promise<Response> {
    const caller = as === 'caller' ? this.caller() : as;
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url, this.browser.origin() + '/').origin === this.browser.origin();
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      return fetch(url, init);
    }
    const extra = this.config.headers ? this.fromSite(this.config.headers) : {};
    const headersOf = (): Headers => {
      const headers = new Headers(init.headers ?? {});
      headers.delete('Authorization');
      headers.delete(VISITOR_KEY_HEADER);
      for (const [name, value] of Object.entries(extra ?? {})) {
        headers.set(name, value);
      }
      return headers;
    };

    if (caller === 'nobody') {
      return fetch(url, { ...init, headers: headersOf() });
    }
    if (caller === 'visitor') {
      const headers = headersOf();
      const key = this.visitors()?.current() ?? null;
      if (key && !this.loginRequiredSignal()) {
        headers.set(VISITOR_KEY_HEADER, key);
      }
      const answer = await fetch(url, { ...init, headers });
      if (answer.status === 401 && (await codeOf(answer)) === 'sign_in_required') {
        this.noteSignInRequired();
      }
      return answer;
    }

    const send = (token: string): Promise<Response> => {
      const headers = headersOf();
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(url, { ...init, headers });
    };
    const token = await this.token();
    if (!token) {
      this.refused();
      return new Response(JSON.stringify({ code: 'sign_in_required', message: 'Please sign in.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const whose = this.subject();
    let answer = await send(token);
    if (answer.status === 401) {
      const renewed = await this.refresh(token);
      if (renewed && renewed !== token && this.subject() === whose) {
        answer = await send(renewed);
      }
      if (answer.status === 401) {
        this.refused();
      }
    }
    return answer;
  }

  /** The site's visitor key store, or null for a site without visitors. */
  visitors(): VisitorKeyStore | null {
    return this.config.visitors ? (this.fromSite(this.config.visitors) ?? null) : null;
  }

  /** The language the IAM's pages should open in, when the site knows it. */
  uiLocales(): string | undefined {
    const language = this.config.language ? this.fromSite(this.config.language) : null;
    return typeof language === 'string' && language.trim() !== '' ? language.trim() : undefined;
  }

  // ── the boot ───────────────────────────────────────────────────────────────

  private async start(): Promise<void> {
    const boot = await this.readBoot();
    const issuer = typeof boot?.issuer === 'string' ? boot.issuer.trim() : '';
    const clientId = String(boot?.client_id ?? boot?.clientId ?? '').trim();
    if (boot) {
      this.loginRequiredSignal.set((boot.login_required ?? boot.loginRequired) !== false);
    }
    if (!boot || issuer === '' || clientId === '' || !this.browser.isBrowser) {
      this.availableSignal.set(false);
      this.stateSignal.set('unavailable');
      return;
    }
    this.availableSignal.set((boot.sign_in_available ?? boot.signInAvailable) !== false);

    const origin = this.browser.origin();
    let client: AnotokiAuthClient;
    try {
      client = this.createClient(
        {
          issuer,
          clientId,
          // Both registered at the IAM for this client, byte for byte.
          redirectUri: origin + this.redirectPath(),
          postLogoutRedirectUri: origin + (this.config.postLogoutPath ?? '/'),
        },
        { navigate: (url) => this.browser.navigate(url), hintNow: () => this.hintNow() },
      );
    } catch (error) {
      console.error('[anotoki auth] the sign-in could not be set up', error);
      this.availableSignal.set(false);
      this.stateSignal.set('unavailable');
      return;
    }
    this.client = client;
    client.onSessionEnded((ended) => this.sessionEnded(ended));

    let result: AnotokiInitResult = { returnTo: null, error: null, silent: false };
    try {
      result = await client.init();
    } catch (error) {
      // The IAM out of reach while a stored session was being restored: the session stays for the next try.
      console.error('[anotoki auth] the sign-in could not be restored', error);
    }
    if (result.error) {
      const code = typeof result.error.code === 'string' && result.error.code !== '' ? result.error.code : 'unknown';
      if (result.silent) {
        // The hint's try: whatever came back, the page stays a visitor's, and says nothing.
        console.info(`[anotoki auth] the silent sign-in came back without one (${code})`);
      } else {
        this.failureSignal.set({ code, returnTo: result.returnTo });
        // Refused at the IAM just now: no silent try with this hint either.
        this.markTried(this.hintNow());
      }
    }

    await this.followTheIam();
    client.onChange(() => this.follow());
    this.follow();

    if (await this.shouldHop()) {
      try {
        const uiLocales = this.uiLocales();
        await client.login({ prompt: 'none', returnTo: this.browser.path(), silent: true, ...(uiLocales ? { uiLocales } : {}) });
        // The page is leaving for the IAM: nothing more of it is drawn.
        return new Promise<void>(() => undefined);
      } catch (error) {
        console.info('[anotoki auth] the silent sign-in could not start', error);
      }
    }
  }

  private async readBoot(): Promise<AuthBootConfig | null> {
    const source = this.config.config;
    try {
      const boot = typeof source === 'string' ? await firstValueFrom(this.http.get<AuthBootConfig>(source)) : await this.fromSite(source);
      return boot && typeof boot === 'object' ? boot : null;
    } catch (error) {
      // A 503 (not set up, being updated) has told SiteStatus already, through its interceptor.
      if (!(error instanceof HttpErrorResponse)) {
        console.error('[anotoki auth] the boot configuration could not be read', error);
      }
      return null;
    }
  }

  /**
   * Follows the IAM: when its sign-in hint is gone, or another one, since this site's session was made -
   * signed out there, or somebody signed in anew - one refresh says whether the session still holds. Waited
   * for (at most FOLLOW_WAIT_MS), so the page is not drawn for a person who is no longer signed in. A session
   * from before the library has no hint of its own: it is asked once.
   */
  private async followTheIam(): Promise<void> {
    const client = this.client;
    if (!client || this.hintCookieName() === null || !client.isAuthenticated()) {
      return;
    }
    const now = this.hintNow();
    if (client.hint() === now) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([client.refresh().then((token) => ({ token })), new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), FOLLOW_WAIT_MS)))]);
    clearTimeout(timer);
    if (outcome?.token && client.isAuthenticated()) {
      client.setHint(now);
    }
  }

  /**
   * Whether to sign the visitor in with one silent hop now - only when every one of these holds: the hint is
   * on; nobody is signed in and the site lets visitors in; the IAM knows the site; no sign-in failure to say;
   * a browser's top-level page, not prerendering, not the callback route; the site not blocked (an update
   * waiting); the cookie there, in the hint's shape; the marker letting this value go, written and read back;
   * the IAM answering its discovery document. A probe that fails marks the value failed: ten minutes' wait.
   */
  private async shouldHop(): Promise<boolean> {
    const client = this.client;
    if (!client || this.hintCookieName() === null || this.stateSignal() !== 'visitor' || !this.availableSignal() || this.failureSignal() !== null) {
      return false;
    }
    if (!this.browser.isBrowser || !this.browser.topLevel() || this.browser.prerendering() || this.onCallbackRoute() || this.siteBlocked()) {
      return false;
    }
    const value = this.hintNow();
    const storage = this.storage();
    if (value === null || storage === null) {
      return false;
    }
    const clientId = client.clientId();
    if (!hintMayHop(readMarker(storage, clientId), value, this.browser.now())) {
      return false;
    }
    // The marker first, and read back: storage that cannot keep it means no hop, ever.
    if (!writeMarker(storage, clientId, { value, at: this.browser.now() })) {
      return false;
    }
    if (!(await client.probe(HINT_PROBE_MS))) {
      writeMarker(storage, clientId, { value, at: this.browser.now(), failed: true });
      return false;
    }
    return true;
  }

  // ── following the session ──────────────────────────────────────────────────

  /**
   * Brings the page in line with the client: signed in, a visitor, or signed out. Once the page has been
   * shown, somebody else signed in (in another tab) - or anybody, on a page shown to a visitor - means a fresh
   * page: nothing loaded for the one before may be shown to the next, or sent as theirs.
   */
  private follow(): void {
    const client = this.client;
    if (!client || this.stateSignal() === 'unavailable') {
      return;
    }
    if (!client.isAuthenticated()) {
      this.userSignal.set(null);
      // A visitor only where the site lets visitors in, and only on a page never shown to a person.
      if (this.loginRequiredSignal() || this.shownFor !== undefined) {
        this.stateSignal.set('signed-out');
      } else {
        this.shownAsVisitor = true;
        this.stateSignal.set('visitor');
      }
      return;
    }
    const user = client.user();
    const sub = user?.sub ?? '';
    if (this.shownAsVisitor || (this.shownFor !== undefined && sub !== this.shownFor)) {
      this.browser.reload();
      return;
    }
    this.shownFor = sub;
    this.userSignal.set(user);
    this.stateSignal.set('signed-in');
  }

  /** The token, while it is the page's person's: between another person's sign-in in another tab and this page's reload, none. */
  private ownToken(token: string | null): string | null {
    return this.shownFor === undefined || (this.client?.user()?.sub ?? '') === this.shownFor ? token : null;
  }

  /** A refresh refused under the hint the session was made with: the IAM session behind it is over, or refuses this site. */
  private sessionEnded(ended: StoredSession): void {
    if (typeof ended.hint === 'string' && ended.hint === this.hintNow()) {
      this.markTried(ended.hint);
    }
  }

  private markTried(value: string | null): void {
    const storage = this.storage();
    if (value !== null && storage !== null && this.client) {
      writeMarker(storage, this.client.clientId(), { value, at: this.browser.now() });
    }
  }

  // ── the browser and the site ───────────────────────────────────────────────

  private hintCookieName(): string | null {
    const hint = this.config.hint;
    return hint === false ? null : (hint?.cookieName ?? DEFAULT_HINT_COOKIE);
  }

  private hintNow(): string | null {
    const name = this.hintCookieName();
    return name === null ? null : readHint(this.browser.cookie(), name);
  }

  private redirectPath(): string {
    return this.config.redirectPath ?? DEFAULT_REDIRECT_PATH;
  }

  private onCallbackRoute(): boolean {
    return this.browser.path().split(/[?#]/)[0] === this.redirectPath();
  }

  private siteBlocked(): boolean {
    return this.injector.get(ANOTOKI_MIGRATIONS_CONFIG, null) !== null && this.injector.get(SiteStatus).blocked();
  }

  private storage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  /** Runs a function the site gave in the configuration - which may inject its own services. */
  private fromSite<T>(run: () => T): T {
    return runInInjectionContext(this.injector, run);
  }
}

/** The code of a failure's JSON body, read from a copy (the caller still reads the answer), or ''. */
async function codeOf(answer: Response): Promise<string> {
  const body: unknown = await answer
    .clone()
    .json()
    .catch(() => null);
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : '';
}
