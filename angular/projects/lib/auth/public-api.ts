/*
 * @anotoki/lib/auth - signing in through the anotoki IAM, the same on every
 * anotoki site: the IAM's browser client (its SDK 1.2.0, with the same storage),
 * the session as signals, the interceptor that decides who a request is when it
 * is issued, the guards, the callback, the sign-in hint's silent hop, the
 * account's preferences followed and saved. The server's half is the PHP
 * package anotoki/lib (Anotoki\Lib\Auth).
 *
 * Eager (every page of a site that signs in reads it). It imports the kit's
 * pieces from their own entry points (the callback's button, the library's
 * words in ui/config) and the migrations module (whether the site is blocked),
 * never @anotoki/lib/ui; a spec's stand-in is @anotoki/lib/auth/testing.
 */

export type {
  AnotokiAuthClient,
  AnotokiAuthEnvironment,
  AnotokiAuthError,
  AnotokiAuthOptions,
  AnotokiDateFormat,
  AnotokiInitResult,
  AnotokiLoginParameters,
  AnotokiPreferenceChanges,
  AnotokiPreferences,
  AnotokiSavedPreferences,
  AnotokiTheme,
  AnotokiTimeFormat,
  AnotokiUser,
  StoredSession,
} from './src/client/types';
export { createAuthClient, safeReturnTo } from './src/client/oidc-client';
export type { AnotokiAuthConfig, AuthBootConfig, SitePreferences, VisitorKeyStore } from './src/config';
export { ANOTOKI_AUTH_CLIENT_FACTORY, ANOTOKI_AUTH_CONFIG } from './src/config';
export { provideAnotokiAuth } from './src/provide';
export type { AuthState, SignInFailure, SignInOptions } from './src/auth.service';
export { AnotokiAuth } from './src/auth.service';
export type { AuthBrowser } from './src/browser';
export { ANOTOKI_AUTH_BROWSER } from './src/browser';
export { anotokiAuthInterceptor } from './src/auth.interceptor';
export type { Caller } from './src/issued-as';
export { CARRIES_VISITOR_KEY, ISSUED_AS, VISITOR_KEY_HEADER, issuedAs } from './src/issued-as';
export { SavesInFlight } from './src/saves-in-flight';
export { adminGuard, personGuard, personOrVisitorGuard, staffGuard } from './src/guards';
export type { AccountPreference, PreferenceSave, ShownPreferences } from './src/preferences';
export { AccountPreferences } from './src/preferences';
export type { HintMarker } from './src/hint';
export { HINT_SHAPE, readHint } from './src/hint';
export type { SignInWords } from './src/words';
export { SIGN_IN_WORD_NAMES, failureText, signInKey, signInWords } from './src/words';
export { AuthCallbackComponent } from './src/callback/auth-callback.component';
export { SignInFailureComponent } from './src/failure/sign-in-failure.component';
