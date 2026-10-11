import { DestroyRef, Type, ViewContainerRef, afterNextRender, inject } from '@angular/core';

type Screens = typeof import('@anotoki/lib/auth/screens');

/**
 * Puts one of the module's screens (@anotoki/lib/auth/screens) into a route's slot, loaded as the route is shown:
 * a site whose route names the screen from @anotoki/lib/auth, as before 0.4.2, gets its code in a chunk of its own,
 * never in the first load. Nothing is put in a route already left. Called in a constructor.
 */
export function loadScreen(slot: () => ViewContainerRef, pick: (screens: Screens) => Type<unknown>): void {
  let gone = false;
  inject(DestroyRef).onDestroy(() => (gone = true));
  const drawn = new Promise<void>((done) => afterNextRender(() => done()));

  Promise.all([import('@anotoki/lib/auth/screens'), drawn]).then(
    ([screens]) => {
      if (!gone) {
        slot().createComponent(pick(screens));
      }
    },
    (error: unknown) => console.error('[anotoki auth] the sign-in screen could not be loaded', error),
  );
}
