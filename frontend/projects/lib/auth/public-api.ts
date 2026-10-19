/*
 * @anotoki/lib/auth - signing in through the anotoki IAM, the same on every
 * anotoki site: the IAM's browser client (its SDK 1.2.0, with the same storage),
 * the session as signals, the interceptor that decides who a request is when it
 * is issued, the guards, the callback, the sign-in hint's silent hop, the
 * account's preferences followed and saved. The server's half is the PHP
 * package anotoki/lib (Anotoki\Lib\Auth).
 *
 * Eager (every page of a site that signs in reads it). It imports the kit's
 * pieces from their own entry points (the library's words in ui/config) and the
 * migrations module (whether the site is blocked), never @anotoki/lib/ui; a
 * spec's stand-in is @anotoki/lib/auth/testing.
 *
 * What runs only at a moment is loaded then (0.5.0): the client's token
 * requests - a callback's code exchanged, a refresh, a preferences save - are
 * @anotoki/lib/auth/session, which the client loads the first time it needs
 * them; the callback page and the failure's screen are
 * @anotoki/lib/auth/screens. AuthCallbackComponent and SignInFailureComponent
 * here are what a route names, as before: each loads its screen as the route
 * is shown, so neither screen's code is in the first load.
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
} from '@anotoki/lib/auth/core';
export { safeReturnTo } from '@anotoki/lib/auth/core';
export { createAuthClient } from './src/client/oidc-client';
export type { AnotokiAuthConfig, AuthBootConfig, SitePreferences, VisitorKeyStore } from '@anotoki/lib/auth/core';
export { ANOTOKI_AUTH_CONFIG } from '@anotoki/lib/auth/core';
export { ANOTOKI_AUTH_CLIENT_FACTORY } from './src/config';
export { provideAnotokiAuth } from './src/provide';
export type { AuthState, SignInFailure, SignInOptions } from '@anotoki/lib/auth/core';
export { SignInSession } from '@anotoki/lib/auth/core';
export { AnotokiAuth } from './src/auth.service';
export type { AuthBrowser } from '@anotoki/lib/auth/core';
export { ANOTOKI_AUTH_BROWSER } from '@anotoki/lib/auth/core';
export { anotokiAuthInterceptor } from './src/auth.interceptor';
// Whom a request is for: an entry point of its own (@anotoki/lib/auth/marker), which a request's maker - the feedback
// form - names without this module; named here too, where a site has always taken it.
export type { Caller } from '@anotoki/lib/auth/marker';
export { ISSUED_AS, issuedAs } from '@anotoki/lib/auth/marker';
export { CARRIES_VISITOR_KEY, VISITOR_KEY_HEADER } from './src/issued-as';
export { SavesInFlight } from './src/saves-in-flight';
export { adminGuard, personGuard, personOrVisitorGuard, staffGuard } from './src/guards';
export type { AccountPreference, PreferenceSave, ShownPreferences } from './src/preferences';
export { AccountPreferences } from './src/preferences';
export type { HintMarker } from './src/hint';
export { HINT_SHAPE, readHint } from './src/hint';
export type { SignInWords } from '@anotoki/lib/auth/core';
export { SIGN_IN_WORD_NAMES, failureText, signInKey, signInWords } from '@anotoki/lib/auth/core';
export { AuthCallbackComponent } from './src/routes/callback-route.component';
export { SignInFailureComponent } from './src/routes/failure-route.component';
