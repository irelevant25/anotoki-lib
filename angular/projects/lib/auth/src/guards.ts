import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { ANOTOKI_MIGRATIONS_CONFIG, SiteStatus } from '@anotoki/lib/migrations';
import { AnotokiAuth } from './auth.service';
import { ANOTOKI_AUTH_CONFIG, DEFAULT_REDIRECT_PATH } from '@anotoki/lib/auth/core';

/**
 * A page for somebody signed in (canActivate and canActivateChild - on the
 * routes around a site's pages, so each page asks again). Anybody else is sent
 * to the IAM before anything of the page is drawn, and comes back to the
 * address they asked for. It lets the page through, with nobody signed in:
 *
 * - while the site is blocked (SiteStatus: being updated, not set up): the
 *   library's status page stands in front of the pages, with a quiet Sign in
 *   of its own - how an administrator gets to the update;
 *
 * and sends the browser to the failure's screen (<anotoki-sign-in-failure>,
 * which says why, with Try again and Back: on the module's `failureRoute`, or
 * the callback route by default) instead of the IAM when a sign-in this page
 * load came back without one, or could not start, or the sign-in cannot be set
 * up at all: sent straight back to the IAM, the browser would go round for ever.
 */
export const personGuard: CanActivateFn & CanActivateChildFn = (_route, state) => guard(state, false, []);

/**
 * personGuard, but a visitor passes too while the site lets visitors in (the
 * survey's takeSurveysGuard; Piano and Japanese Academy's learner pages).
 */
export const personOrVisitorGuard: CanActivateFn & CanActivateChildFn = (_route, state) => guard(state, true, []);

/**
 * For the site's admin area: somebody signed in with ADMIN or EDITOR (from the
 * token - the server checks for itself; this only spares a page that would
 * refuse). Signed in without the role: the site's `forbiddenRoute` ('/').
 * Nobody signed in: personGuard.
 */
export const staffGuard: CanActivateFn & CanActivateChildFn = (_route, state) => guard(state, false, ['ADMIN', 'EDITOR']);

/** staffGuard for ADMIN alone: the languages, the people, the migrations. */
export const adminGuard: CanActivateFn & CanActivateChildFn = (_route, state) => guard(state, false, ['ADMIN']);

function guard(target: RouterStateSnapshot, visitorsWelcome: boolean, roles: string[]): boolean | UrlTree | Promise<boolean | UrlTree> {
  const auth = inject(AnotokiAuth);
  const router = inject(Router);
  const config = inject(ANOTOKI_AUTH_CONFIG);
  // The failure's screen: the site's own route for it, or the callback route, which shows it too.
  const failure = router.parseUrl(config.failureRoute ?? config.redirectPath ?? DEFAULT_REDIRECT_PATH);
  const state = auth.state();

  if (state === 'signed-in') {
    if (roles.length > 0 && !roles.some((role) => auth.roles().includes(role))) {
      return router.parseUrl(config.forbiddenRoute ?? '/');
    }
    return true;
  }
  if (visitorsWelcome && state === 'visitor' && roles.length === 0) {
    return true;
  }
  if (inject(ANOTOKI_MIGRATIONS_CONFIG, { optional: true }) !== null && inject(SiteStatus).blocked()) {
    return true;
  }
  if (state === 'starting') {
    return false;
  }
  if (state === 'unavailable' || auth.signInFailure() !== null) {
    return failure;
  }

  // On its way to the IAM: nothing of the page is drawn. Not started: the failure's words, or - the site said
  // to stay - nowhere.
  return auth.signIn({ returnTo: target.url }).then((started) => (started || auth.signInFailure() === null ? false : failure));
}
