/*
 * The types of the IAM's browser client - the IAM's SDK anotoki-auth.d.ts 1.2.0,
 * kept as they were so a site's own code that names them changes nothing but
 * its import, with what the library adds: the silent sign-in, the hint a
 * session was made under, the probe of the IAM.
 */

export interface AnotokiAuthOptions {
  /** The IAM's address - its issuer - without a trailing slash: http://localhost:4300 on a development machine. */
  issuer: string;
  /** This application's client id in the IAM. */
  clientId: string;
  /** Where the IAM sends the browser back to; registered for this client, byte for byte. */
  redirectUri: string;
  /** Where signing out lands; registered for this client. Without it the IAM shows its own page. */
  postLogoutRedirectUri?: string;
  /** Defaults to "openid profile email". */
  scope?: string;
  /** localStorage key for the tokens. Defaults to "anotoki-auth:{clientId}" - the SDK's, so nobody is signed out by the move. */
  storageKey?: string;
}

/** What the client needs of the browser that a test puts in place of the real one. */
export interface AnotokiAuthEnvironment {
  /** Leaves the page for $url (location.assign). */
  navigate?: (url: string) => void;
  /** fetch() - the token endpoint, discovery, revoke, preferences. */
  fetch?: typeof fetch;
  /** The hint cookie's value as a session is made (stored with it), or null. */
  hintNow?: () => string | null;
}

export interface AnotokiUser {
  /** The IAM user id, as a decimal string. */
  sub: string;
  preferred_username: string | null;
  email: string | null;
  email_verified: boolean;
  locale: string | null;
  /** This application's roles for the user. ['MEMBER'] for an ordinary account. */
  roles: string[];
  /** The account's theme, dates and clock, which every anotoki site follows; null when the IAM sends none - keep the site's own then. */
  preferences: AnotokiPreferences | null;
}

export type AnotokiTheme = 'auto' | 'light' | 'dark';
/** 6.10.2026, 06/10/2026, 10/06/2026, 2026-10-06. */
export type AnotokiDateFormat = 'dmy_dot' | 'dmy_slash' | 'mdy_slash' | 'ymd_dash';
export type AnotokiTimeFormat = '24' | '12';

export interface AnotokiPreferences {
  /** "auto" follows the operating system. */
  theme: AnotokiTheme;
  /** null: the language's own way of writing a date. */
  date_format: AnotokiDateFormat | null;
  /** null: the language's own clock. */
  time_format: AnotokiTimeFormat | null;
}

/** What savePreferences() may change; anything left out stays as it is. */
export interface AnotokiPreferenceChanges {
  theme?: AnotokiTheme;
  date_format?: AnotokiDateFormat | null;
  time_format?: AnotokiTimeFormat | null;
  /** A language code the IAM offers ("en", "sk"). */
  language?: string;
}

export interface AnotokiSavedPreferences {
  locale: string | null;
  preferences: AnotokiPreferences | null;
}

export interface AnotokiAuthError extends Error {
  /** An OAuth error ("access_denied", "login_required", "invalid_grant"...) or the client's own ("state_mismatch", "invalid_id_token", "invalid_issuer", "storage_unavailable", "network"). */
  code: string;
}

export interface AnotokiInitResult {
  /** Set when this page load was the sign-in callback: where the person was when the sign-in started. */
  returnTo: string | null;
  /** Set when the callback carried a refusal, or the code could not be exchanged. */
  error: AnotokiAuthError | null;
  /** The callback answered a silent sign-in (prompt=none, the hint's): its error is never shown. */
  silent: boolean;
}

export interface AnotokiLoginParameters {
  /** A path on this site to come back to. Defaults to the current one. */
  returnTo?: string;
  prompt?: 'none' | 'login' | 'create';
  loginHint?: string;
  uiLocales?: string;
  maxAge?: number;
  /** A sign-in nobody asked for (the hint's): whatever comes back, nothing is said. */
  silent?: boolean;
}

/**
 * What localStorage holds under the storage key - the SDK 1.2.0's shape, so a
 * session the SDK kept is the library's, and `hint`: the value of the IAM's
 * sign-in hint cookie when the session was made (absent from a session the SDK
 * made, before the library).
 */
export interface StoredSession {
  access_token: string;
  access_expires_at: number;
  refresh_token: string | null;
  id_token: string | null;
  user: AnotokiUser | null;
  updated_at: number;
  hint?: string | null;
}

export interface AnotokiAuthClient {
  /** Once per page load, before drawing: finishes a callback, or restores and refreshes a stored session. */
  init(): Promise<AnotokiInitResult>;
  /** Navigates to the IAM. Never resolves in practice - the page is left. */
  login(parameters?: AnotokiLoginParameters): Promise<void>;
  /** login() opening on the registration form. */
  register(parameters?: Omit<AnotokiLoginParameters, 'prompt'>): Promise<void>;
  /** Everywhere by default (navigates to the IAM's logout); `local: true` for this site only. */
  logout(parameters?: { local?: boolean }): Promise<void>;
  /** A valid access token, refreshed when under 30 seconds remain; null when signed out or the IAM cannot be reached. */
  getAccessToken(): Promise<string | null>;
  /**
   * After an API answered 401 to `refused` (by default the token held now): a different, fresh one - or null
   * (signed out, or the IAM unreachable).
   */
  refresh(refused?: string | null): Promise<string | null>;
  /** Changes the account's preferences, for every anotoki site; user() follows at once, in every tab. */
  savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences>;
  /** Called on sign-in, sign-out, refresh and a saved preference - in this tab or another. Returns an unsubscribe. */
  onChange(listener: () => void): () => void;
  /** Called when the IAM refused a refresh (invalid_grant): the session that ended, with its hint. */
  onSessionEnded(listener: (ended: StoredSession) => void): () => void;
  isAuthenticated(): boolean;
  user(): AnotokiUser | null;
  /** The hint the session was made under: undefined for a session from before the library, null for none. */
  hint(): string | null | undefined;
  /** The session holds under this hint now (a refresh under a changed hint went through). */
  setHint(value: string | null): void;
  /** The IAM's discovery document (an hour in sessionStorage), or the IAM's own paths when it cannot be had. */
  discovery(): Promise<Record<string, unknown>>;
  /** Whether the IAM answers its discovery document, with its own issuer, within $timeoutMs - asked afresh. */
  probe(timeoutMs: number): Promise<boolean>;
  /** The IAM's account page. */
  accountUrl(): string;
  issuer(): string;
  clientId(): string;
  /** Stops listening to the other tabs (a test's clean-up). */
  dispose(): void;
}
