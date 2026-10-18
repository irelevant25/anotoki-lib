import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/**
 * Reloads the page: what the waiting pages do once the site is ready again,
 * so it starts afresh. A token of its own only so the tests can see it happen
 * (jsdom has no navigation); it is not part of the public API.
 */
export const RELOAD_PAGE = new InjectionToken<() => void>('anotoki: reload the page', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.defaultView?.location.reload();
  },
});
