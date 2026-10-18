import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ANOTOKI_TRANSLATIONS_CONFIG } from './config';

/** A page whose changes are kept only when saved: it says whether it may be left, asking first when it has some. */
export interface HoldsUnsavedChanges {
  canLeave(): boolean | Promise<boolean>;
}

/**
 * Leaving the admin Translations or Languages page (a link, Back) asks the
 * page first - on the site's routes: `canDeactivate: [anotokiUnsavedChangesGuard]`.
 * Here, not in the pages' own entry point: a route's guard is in the site's
 * first load, and the pages must not be pulled in with it.
 *
 * Not when nobody is signed in any more (`account.userKey()` is null): the
 * session ended or the person signed out, and the page is on its way to the
 * sign-in whatever is answered - "stay" would keep a page that can do nothing,
 * "leave" would give up what was typed for no reason. Nothing is asked and
 * nothing is lost: the drafts keep what was typed, and the same person finds
 * it in its boxes after signing in again. A page already gone has nobody to ask.
 *
 * Closing the tab or reloading is the browser's to ask: the drafts listen
 * for `beforeunload`.
 */
export const anotokiUnsavedChangesGuard: CanDeactivateFn<HoldsUnsavedChanges | null> = (page) => {
  const userKey = inject(ANOTOKI_TRANSLATIONS_CONFIG, { optional: true })?.account?.userKey;
  if (userKey && userKey() === null) {
    return true;
  }
  return page && typeof page.canLeave === 'function' ? page.canLeave() : true;
};
