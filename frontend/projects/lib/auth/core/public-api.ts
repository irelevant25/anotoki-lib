/*
 * @anotoki/lib/auth/core - what the auth module's parts share: the client's types and small helpers, the
 * module's configuration and browser tokens, its built-in words, and the session as its screens see it. The
 * library's own: @anotoki/lib/auth re-exports every public piece of it, and a site imports from there.
 *
 * Its own entry point so the parts loaded later - the screens (@anotoki/lib/auth/screens) and the client's
 * token requests (@anotoki/lib/auth/session) - never import the module's first part: each is a file a site's
 * build puts in a chunk of its own.
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
} from './src/types';
export { authError, decodeJwtPayload, preferencesFrom, safeReturnTo } from './src/helpers';
export type { AnotokiAuthConfig, AuthBootConfig, SitePreferences, VisitorKeyStore } from './src/config';
export { ANOTOKI_AUTH_CONFIG, DEFAULT_HINT_COOKIE, DEFAULT_PREFIXES, DEFAULT_REDIRECT_PATH, DEFAULT_SKIP } from './src/config';
export type { AuthBrowser } from './src/browser';
export { ANOTOKI_AUTH_BROWSER } from './src/browser';
export type { SignInWords } from './src/words';
export { BUILT_IN_WORDS, SIGN_IN_WORD_NAMES, failureText, provideSignInWords, signInKey, signInWords } from './src/words';
export type { AuthState, SignInFailure, SignInOptions } from './src/session';
export { SignInSession } from './src/session';
export type { ClientParts } from './src/client-parts';
