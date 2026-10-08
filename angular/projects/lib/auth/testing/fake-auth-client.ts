import {
  AnotokiAuthClient,
  AnotokiAuthEnvironment,
  AnotokiAuthOptions,
  AnotokiInitResult,
  AnotokiLoginParameters,
  AnotokiPreferenceChanges,
  AnotokiPreferences,
  AnotokiSavedPreferences,
  AnotokiUser,
  StoredSession,
} from '@anotoki/lib/auth';

/** A person for a test: the sub, and whatever else the test cares about. */
export type TestUser = Partial<AnotokiUser> & { sub: string };

/** The whole user of a TestUser: an ordinary account's claims where the test says nothing. */
export function testUser(user: TestUser): AnotokiUser {
  return {
    preferred_username: `user${user.sub}`,
    email: `user${user.sub}@example.test`,
    email_verified: true,
    locale: 'en',
    roles: ['MEMBER'],
    preferences: null,
    ...user,
  };
}

/**
 * The IAM's browser client, in memory - for a site's specs, through
 * ANOTOKI_AUTH_CLIENT_FACTORY (provideTestAnotokiAuth() puts it there). Nothing
 * leaves the test: a sign-in is recorded in `logins`, a sign-out in `logouts`;
 * the test says who is signed in (signIn(), signOut()), what a refresh does
 * (`refreshAnswer`), what the IAM says to a saved preference
 * (`preferencesError`) and to its discovery document.
 */
export class FakeAuthClient implements AnotokiAuthClient {
  session: StoredSession | null = null;
  readonly logins: AnotokiLoginParameters[] = [];
  readonly logouts: { local?: boolean }[] = [];
  readonly saved: AnotokiPreferenceChanges[] = [];
  refreshes = 0;
  /** What the next refreshes do: a new token, the IAM's refusal (the session ends), or no answer (the session stays). */
  refreshAnswer: 'token' | 'refused' | 'unreachable' = 'token';
  /** The IAM's code for a saved preference, or null to take it. */
  preferencesError: string | null = null;
  /** What init() answers (a callback's outcome); by default none. */
  initResult: AnotokiInitResult = { returnTo: null, error: null, silent: false };
  /** Whether the IAM answers its discovery document. */
  probeAnswer = true;
  discoveryDocument: Record<string, unknown>;

  private readonly listeners = new Set<() => void>();
  private readonly endedListeners = new Set<(ended: StoredSession) => void>();
  private tokens = 0;

  constructor(
    readonly options: AnotokiAuthOptions,
    readonly environment: AnotokiAuthEnvironment = {},
    user: TestUser | null = null,
  ) {
    this.discoveryDocument = { issuer: options.issuer, ui_locales_supported: ['en', 'sk'] };
    if (user) {
      this.session = this.sessionOf(testUser(user), environment.hintNow?.() ?? null);
    }
  }

  /** Somebody signs in (in this tab or another): the page hears of it. */
  signIn(user: TestUser, hint: string | null = this.environment.hintNow?.() ?? null): void {
    this.session = this.sessionOf(testUser(user), hint);
    this.notify();
  }

  /** Nobody is signed in any more (another tab signed out). */
  signOut(): void {
    this.session = null;
    this.notify();
  }

  async init(): Promise<AnotokiInitResult> {
    return this.initResult;
  }

  async login(parameters: AnotokiLoginParameters = {}): Promise<void> {
    this.logins.push(parameters);
  }

  register(parameters: Omit<AnotokiLoginParameters, 'prompt'> = {}): Promise<void> {
    return this.login({ ...parameters, prompt: 'create' });
  }

  async logout(parameters: { local?: boolean } = {}): Promise<void> {
    this.logouts.push(parameters);
    this.signOut();
  }

  async getAccessToken(): Promise<string | null> {
    return this.session?.access_token ?? null;
  }

  async refresh(refused?: string | null): Promise<string | null> {
    this.refreshes++;
    const current = this.session;
    if (!current) {
      return null;
    }
    if (refused === null && current.access_token) {
      return current.access_token;
    }
    if (this.refreshAnswer === 'unreachable') {
      return null;
    }
    if (this.refreshAnswer === 'refused') {
      this.session = null;
      this.notify();
      this.endedListeners.forEach((listener) => listener(current));
      return null;
    }
    this.session = { ...current, access_token: this.nextToken(), updated_at: Date.now() };
    this.notify();
    return this.session.access_token;
  }

  async savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> {
    this.saved.push(changes);
    if (!this.session?.user) {
      throw Object.assign(new Error('Nobody is signed in'), { code: 'login_required' });
    }
    if (this.preferencesError !== null) {
      throw Object.assign(new Error('The IAM refused the change'), { code: this.preferencesError });
    }
    const user = this.session.user;
    const { language, ...rest } = changes;
    const preferences: AnotokiPreferences = { ...(user.preferences ?? { theme: 'auto', date_format: null, time_format: null }), ...rest };
    const saved: AnotokiSavedPreferences = { locale: language ?? user.locale, preferences };
    this.session = { ...this.session, user: { ...user, ...saved } };
    this.notify();
    return saved;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onSessionEnded(listener: (ended: StoredSession) => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }

  user(): AnotokiUser | null {
    return this.session?.user ?? null;
  }

  hint(): string | null | undefined {
    return this.session === null ? null : this.session.hint;
  }

  setHint(value: string | null): void {
    if (this.session) {
      this.session = { ...this.session, hint: value };
    }
  }

  async discovery(): Promise<Record<string, unknown>> {
    return this.discoveryDocument;
  }

  async probe(): Promise<boolean> {
    return this.probeAnswer;
  }

  accountUrl(): string {
    return `${this.options.issuer}/account`;
  }

  issuer(): string {
    return this.options.issuer;
  }

  clientId(): string {
    return this.options.clientId;
  }

  dispose(): void {
    this.listeners.clear();
    this.endedListeners.clear();
  }

  private sessionOf(user: AnotokiUser, hint: string | null): StoredSession {
    return { access_token: this.nextToken(), access_expires_at: Date.now() + 600_000, refresh_token: 'refresh', id_token: 'id', user, updated_at: Date.now(), hint };
  }

  private nextToken(): string {
    return `token-${++this.tokens}`;
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
