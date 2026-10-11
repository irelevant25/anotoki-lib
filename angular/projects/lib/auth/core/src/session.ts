import { Signal } from '@angular/core';

/**
 * What the page is, as far as signing in goes:
 *   starting     the boot configuration is being read, a callback finished, a session restored
 *   signed-in    somebody is signed in, and the page is theirs
 *   visitor      nobody is signed in, and the site lets visitors in (login_required off)
 *   signed-out   nobody is signed in where somebody must be: on the way to the IAM (personGuard), or
 *                the session ended while the page was open
 *   unavailable  the sign-in cannot be set up: the boot configuration could not be read, or names no IAM
 */
export type AuthState = 'starting' | 'signed-in' | 'visitor' | 'signed-out' | 'unavailable';

/** A sign-in that came back without one, or could not start: its code (never the IAM's sentence), and where it started. */
export interface SignInFailure {
  code: string;
  returnTo: string | null;
}

export interface SignInOptions {
  /** A path on this site to come back to; by default where the last failed sign-in started, else the page. */
  returnTo?: string;
  /** login: ask again even with a session at the IAM ("switch account"); create: open on the registration form. */
  prompt?: 'login' | 'create';
  /** The longest ago the person may have signed in at the IAM, in seconds (a backup restore asks for a recent one). */
  maxAge?: number;
}

/**
 * What the module's two screens - the callback page and the failure's screen, an entry point of their own
 * (@anotoki/lib/auth/screens) that a site loads as it routes to them - ask of the session: AnotokiAuth, which
 * provideAnotokiAuth() provides under this class too. The screens never import the service itself: the module's
 * first part can still name them for a site's route of before, while a route that loads them lazily keeps their
 * code out of the first load.
 */
export abstract class SignInSession {
  abstract readonly state: Signal<AuthState>;
  /** A sign-in that came back without one, or could not start - never a silent one's. */
  abstract readonly signInFailure: Signal<SignInFailure | null>;
  /** Off to the IAM's sign-in; false when the site said no, or the sign-in could not start. */
  abstract signIn(options?: SignInOptions): Promise<boolean>;
  /** Forgets the failed sign-in. */
  abstract dismissFailure(): void;
}
