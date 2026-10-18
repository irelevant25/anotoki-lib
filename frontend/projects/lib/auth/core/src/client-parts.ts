import { StoredSession } from './types';

/**
 * What the client's later parts are given of the client: its settings, its storage and endpoints, and its own
 * token functions - the parts that run only at a moment (@anotoki/lib/auth/session: a callback's code exchanged
 * for tokens, a refresh, a save of the account's preferences), loaded as they are first needed, so their code is
 * not in a site's first load. Internal: createAuthClient() hands itself over as it loads them.
 */
export interface ClientParts {
  readonly issuer: string;
  readonly clientId: string;
  readonly redirectUri: string;
  /** The Web Lock that serialises refreshes - and the write-back of a preferences save - across tabs. */
  readonly lockName: string;
  /** The sessionStorage key's start of a sign-in in progress (its PKCE verifier and nonce, by state). */
  readonly pendingPrefix: string;
  fetch: typeof fetch;
  /** The IAM's sign-in hint as the browser holds it now: a new session is made under it. */
  hintNow(): string | null;
  /** The IAM's discovery document (its own paths when it cannot be reached). */
  endpoints(): Promise<Record<string, unknown>>;
  endpoint(document: Record<string, unknown>, name: string): string;
  /** What is stored, null for nothing - undefined when storage cannot be read at all. */
  readSession(): StoredSession | null | undefined;
  /** Writes the session (null: none) for this page and every tab, and tells the listeners. */
  writeSession(next: StoredSession | null): void;
  /** The session this page holds. */
  session(): StoredSession | null;
  /** Takes up what another tab stored, without writing it. */
  adoptSession(next: StoredSession | null): void;
  /** Tells the session-ended listeners: the IAM refused the session's refresh. */
  sessionEnded(ended: StoredSession): void;
  /** The session's access token while it has more than the margin left, else null. */
  freshToken(current: StoredSession | null): string | null;
  /** The client's own: a fresh token (refreshed when it must be), and a refresh after a refusal. */
  getAccessToken(): Promise<string | null>;
  refresh(refused: string | null): Promise<string | null>;
}
