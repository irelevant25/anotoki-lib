import { InjectionToken } from '@angular/core';
import { HttpRequest } from '@angular/common/http';
import { createAuthClient } from './client/oidc-client';
import { AnotokiAuthClient, AnotokiAuthEnvironment, AnotokiAuthOptions, AnotokiPreferences } from './client/types';
import { SignInWords } from './words';

/**
 * What the site's server says about signing in, at boot: GET /api/auth/config
 * (the library's AuthRoutes), or a part of the site's own boot answer.
 * snake_case is the library's wire format; the camelCase a site answered
 * before it adopted the library is read too, so an open page and an updated
 * server understand each other while an upload is under way.
 */
export interface AuthBootConfig {
  issuer: string;
  client_id?: string;
  clientId?: string;
  /** Whether the site requires signing in. Anything but false is true: it fails closed. */
  login_required?: boolean;
  loginRequired?: boolean;
  /** Whether the IAM knows the site (a 200, not a 404). Missing: it does. */
  sign_in_available?: boolean;
  signInAvailable?: boolean;
}

/**
 * A browser's key of the site's visitor (X-Visitor-Key) - the site's own
 * store, as every site has one. current() is read as each request leaves.
 */
export interface VisitorKeyStore {
  current(): string | null;
  /** Keeps the key a visitor's first save brought; a second one never overwrites the first. */
  remember(key: string): void;
  /** Forgets $key - only while it is still the one held (another tab may have one of its own by now). */
  forget(key: string, lost?: boolean): void;
  /** The first save that may make a visitor, under way: the others wait for its answer (one visitor a browser). */
  firstSave?(): Promise<void> | null;
  /** Starts that first save; the function it answers ends it. */
  beginFirstSave?(): () => void;
}

/**
 * What the site shows of the account's choices: given the account's theme,
 * dates, clock and language while somebody is signed in (with a choice still
 * on its way shown as made), and null for both otherwise - the site's own
 * device choices then (its storage, its theme-boot.js).
 */
export interface SitePreferences {
  apply(preferences: AnotokiPreferences | null, locale: string | null): void;
}

/** What a site tells the module, through provideAnotokiAuth(). The functions run in an injection context. */
export interface AnotokiAuthConfig {
  /** The boot configuration: its URL (GET, with no token), or a function giving it from the site's own boot answer. */
  config: string | (() => AuthBootConfig | null | Promise<AuthBootConfig | null>);
  /**
   * The site's API, which the interceptor handles: paths under `prefixes` (default ['/api/']) of this
   * origin, but `skip` (default ['/api/site-status', '/api/auth/config', '/api/translations/'] - a path
   * ending with / skips what is under it). A visitor's key goes only under `visitorPrefixes` (default: all of it).
   */
  api?: { prefixes?: string[]; skip?: string[]; visitorPrefixes?: string[] };
  /** The site's visitors' keys; null or missing: the site has no visitors (a visitor's request carries nothing). */
  visitors?: () => VisitorKeyStore | null;
  /** A save that makes a visitor when nobody sends it: it goes alone, and the others wait for the key it brings. */
  makesVisitor?: (request: HttpRequest<unknown>) => boolean;
  /**
   * The page's language: the IAM's pages open in it (ui_locales), and the built-in words are in it. With the
   * translations module: `() => inject(TranslationService).language()`.
   */
  language?: () => string | null | undefined;
  /** Before the browser leaves for the IAM: settle the writes, ask about unsaved work. false stops it. */
  beforeSignIn?: () => boolean | Promise<boolean>;
  /** Before signing out: the same. */
  beforeSignOut?: () => boolean | Promise<boolean>;
  /** The site's theme, dates and language, which follow the account while somebody is signed in. */
  preferences?: () => SitePreferences | null;
  /** The sign-in hint: its cookie's name (anotoki_signed_in); false turns the hint off. */
  hint?: { cookieName?: string } | false;
  /** More headers on every request of the site's API (Japanese Academy's X-Time-Zone). */
  headers?: () => Record<string, string>;
  /** Where the IAM sends the browser back to: a route of the site. Default '/auth/callback'. */
  redirectPath?: string;
  /** Where signing out lands. Default '/'. */
  postLogoutPath?: string;
  /** Where staffGuard and adminGuard send somebody signed in without the role. Default '/'. */
  forbiddenRoute?: string;
  /** Per language, words to use instead of the built-in ones (the library's `anotoki.signIn.*`). */
  words?: Record<string, Partial<SignInWords>>;
  /**
   * The site's own string for a library key (`anotoki.signIn.retry`) - an owner's rewording in its database -
   * before its `words` and the built-in ones; null, '' or the key itself for none. With the translations module:
   * `(key) => inject(TranslationService).libraryWord(key)`, as the kit's `lookup` reads it.
   */
  translate?: (key: string) => string | null | undefined;
}

export const ANOTOKI_AUTH_CONFIG = new InjectionToken<AnotokiAuthConfig>('ANOTOKI_AUTH_CONFIG');

/** Makes the IAM client: createAuthClient, which a site's specs replace (@anotoki/lib/auth/testing). */
export const ANOTOKI_AUTH_CLIENT_FACTORY = new InjectionToken<(options: AnotokiAuthOptions, environment: AnotokiAuthEnvironment) => AnotokiAuthClient>('ANOTOKI_AUTH_CLIENT_FACTORY', {
  providedIn: 'root',
  factory: () => createAuthClient,
});

export const DEFAULT_REDIRECT_PATH = '/auth/callback';
export const DEFAULT_PREFIXES = ['/api/'];
export const DEFAULT_SKIP = ['/api/site-status', '/api/auth/config', '/api/translations/'];
export const DEFAULT_HINT_COOKIE = 'anotoki_signed_in';
