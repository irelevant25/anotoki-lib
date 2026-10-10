/*
 * What the auth module's specs share: a client in memory, a browser that only
 * records where it was sent, and the providers that wire the module into a
 * test app. Only the specs import this; it is not part of the package (the
 * sites' specs have @anotoki/lib/auth/testing).
 */

import { EnvironmentProviders, Provider, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Routes, provideRouter } from '@angular/router';
import { AuthBrowser, ANOTOKI_AUTH_BROWSER } from './browser';
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
} from './client/types';
import { ANOTOKI_AUTH_CLIENT_FACTORY, AnotokiAuthConfig, AuthBootConfig } from './config';
import { provideAnotokiAuth } from './provide';
import { anotokiAuthInterceptor } from './auth.interceptor';

export const ISSUER = 'https://iam.test';
export const CLIENT_ID = 'test-site';
/** A hint value in the IAM's shape: 22 characters of base64url. */
export const HINT_A = 'aaaaaaaaaaaaaaaaaaaaaa';
export const HINT_B = 'bbbbbbbbbbbbbbbbbbbbbb';

export function user(sub: string, roles: string[] = ['MEMBER'], more: Partial<AnotokiUser> = {}): AnotokiUser {
  return { sub, preferred_username: `user${sub}`, email: `user${sub}@example.test`, email_verified: true, locale: 'en', roles, preferences: null, ...more };
}

/** The client in memory, with every knob a spec turns. */
export class SpecClient implements AnotokiAuthClient {
  session: StoredSession | null = null;
  readonly logins: AnotokiLoginParameters[] = [];
  readonly logouts: { local?: boolean }[] = [];
  readonly saved: AnotokiPreferenceChanges[] = [];
  refreshes = 0;
  refreshAnswer: 'token' | 'refused' | 'unreachable' | 'never' = 'token';
  preferencesError: string | null = null;
  initResult: AnotokiInitResult = { returnTo: null, error: null, silent: false };
  probeAnswer = true;
  probes = 0;
  offered: string[] | null = ['en', 'sk'];
  private readonly listeners = new Set<() => void>();
  private readonly ended = new Set<(ended: StoredSession) => void>();
  private tokens = 0;

  constructor(
    readonly options: AnotokiAuthOptions,
    readonly environment: AnotokiAuthEnvironment,
  ) {}

  /** A session as the page finds it in storage; hint undefined: one the SDK made, before the library. */
  hold(person: AnotokiUser, hint?: string | null): void {
    this.session = { access_token: this.next(), access_expires_at: Date.now() + 600_000, refresh_token: 'rt', id_token: 'id', user: person, updated_at: Date.now() };
    if (hint !== undefined) {
      this.session.hint = hint;
    }
  }

  /** Another tab signed somebody in, or out. */
  change(person: AnotokiUser | null): void {
    if (person === null) {
      this.session = null;
    } else {
      this.hold(person, this.environment.hintNow?.() ?? null);
    }
    this.listeners.forEach((listener) => listener());
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
    this.change(null);
  }
  async getAccessToken(): Promise<string | null> {
    return this.session?.access_token ?? null;
  }
  refresh(refused?: string | null): Promise<string | null> {
    this.refreshes++;
    const current = this.session;
    if (!current) {
      return Promise.resolve(null);
    }
    if (refused !== undefined && refused !== current.access_token) {
      return Promise.resolve(current.access_token);
    }
    switch (this.refreshAnswer) {
      case 'never':
        return new Promise(() => undefined);
      case 'unreachable':
        return Promise.resolve(null);
      case 'refused':
        this.session = null;
        this.listeners.forEach((listener) => listener());
        this.ended.forEach((listener) => listener(current));
        return Promise.resolve(null);
      default:
        this.session = { ...current, access_token: this.next() };
        this.listeners.forEach((listener) => listener());
        return Promise.resolve(this.session.access_token);
    }
  }
  async savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> {
    this.saved.push(changes);
    if (!this.session?.user) {
      throw Object.assign(new Error('Nobody is signed in'), { code: 'login_required' });
    }
    if (this.preferencesError !== null) {
      throw Object.assign(new Error('refused'), { code: this.preferencesError });
    }
    const { language, ...rest } = changes;
    const was = this.session.user;
    const preferences: AnotokiPreferences = { ...(was.preferences ?? { theme: 'auto', date_format: null, time_format: null }), ...rest };
    const saved = { locale: language ?? was.locale, preferences };
    this.session = { ...this.session, user: { ...was, ...saved } };
    this.listeners.forEach((listener) => listener());
    return saved;
  }
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onSessionEnded(listener: (ended: StoredSession) => void): () => void {
    this.ended.add(listener);
    return () => this.ended.delete(listener);
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
    return this.offered === null ? { issuer: ISSUER } : { issuer: ISSUER, ui_locales_supported: this.offered };
  }
  async probe(): Promise<boolean> {
    this.probes++;
    return this.probeAnswer;
  }
  accountUrl(): string {
    return `${ISSUER}/account`;
  }
  issuer(): string {
    return ISSUER;
  }
  clientId(): string {
    return this.options.clientId;
  }
  dispose(): void {
    this.listeners.clear();
  }
  private next(): string {
    return `token-${++this.tokens}`;
  }
}

/** The browser of a spec: its cookies, frame, prerendering and clock set by the test; where it was sent, recorded. */
export class SpecBrowser implements AuthBrowser {
  readonly isBrowser = true;
  cookies = '';
  framed = false;
  prerender = false;
  clock = Date.now();
  readonly navigations: string[] = [];
  reloads = 0;
  cookie(): string {
    return this.cookies;
  }
  topLevel(): boolean {
    return !this.framed;
  }
  prerendering(): boolean {
    return this.prerender;
  }
  origin(): string {
    return location.origin;
  }
  path(): string {
    return location.pathname + location.search + location.hash;
  }
  navigate(url: string): void {
    this.navigations.push(url);
  }
  reload(): void {
    this.reloads++;
  }
  now(): number {
    return this.clock;
  }
}

export interface SpecSite {
  boot: AuthBootConfig | null;
  client: SpecClient | null;
  /** What the client starts with, before init() reads it. */
  prepare: (client: SpecClient) => void;
  browser: SpecBrowser;
}

export function specSite(boot: Partial<AuthBootConfig> = {}): SpecSite {
  return {
    boot: { issuer: ISSUER, client_id: CLIENT_ID, login_required: false, sign_in_available: true, ...boot },
    client: null,
    prepare: () => undefined,
    browser: new SpecBrowser(),
  };
}

/** A zoneless app with the module: the spec's boot answer, client and browser, and anything the test adds. */
export function provideSpecAuth(site: SpecSite, config: Partial<AnotokiAuthConfig> = {}, routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([anotokiAuthInterceptor])),
    provideHttpClientTesting(),
    provideRouter(routes),
    provideAnotokiAuth(() => ({ config: () => site.boot, ...config })),
    {
      provide: ANOTOKI_AUTH_CLIENT_FACTORY,
      useValue: (options: AnotokiAuthOptions, environment: AnotokiAuthEnvironment) => {
        const client = new SpecClient(options, environment);
        site.prepare(client);
        site.client = client;
        return client;
      },
    },
    { provide: ANOTOKI_AUTH_BROWSER, useValue: site.browser },
  ];
}

/** Lets pending promises and timers of 0 run out. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((done) => setTimeout(done));
  }
}

/** Whether a promise settled (within a few turns). */
export async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  await settle();
  return done;
}
