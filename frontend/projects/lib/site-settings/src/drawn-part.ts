import { Binding, ComponentRef, DestroyRef, PendingTasks, Type, ViewContainerRef, effect, inject, untracked } from '@angular/core';

/** The pieces' parts drawn from entry points of their own: the announcement bar, the administrators' notice. */
export type DrawnPart = 'bar' | 'notice';

/**
 * How the parts are fetched - import(): each is an entry point of its own (@anotoki/lib/site-settings/bar, /notice),
 * which a site's build puts in a chunk of its own - and what has come, kept for the page's life, so that a frame made
 * again (the IAM's sign-in pages, then its account pages) draws its bar at once. Internal: the specs count the fetches,
 * forget what came, and make a fetch fail as a network gone would.
 */
export const drawnParts: { load: Record<DrawnPart, () => Promise<Type<unknown>>>; came: Partial<Record<DrawnPart, Type<unknown>>> } = {
  load: {
    bar: () => import('@anotoki/lib/site-settings/bar').then((part) => part.AnnouncementBarComponent),
    notice: () => import('@anotoki/lib/site-settings/notice').then((part) => part.PageNoticeListComponent),
  },
  came: {},
};

const NAMES: Record<DrawnPart, string> = { bar: 'the announcement bar', notice: "the administrators' notice" };

/**
 * Puts a part into `slot` while `wanted()` says so, and takes it away while it does not - its code fetched the first
 * time it is wanted, never before, so that no first load carries it (0.11.1: the bar and its words were in every
 * site's first load, an announcement or none). While the code comes the page is not stable yet (PendingTasks: a test's
 * whenStable() waits for it, as a server's render would). Code that cannot be fetched (offline, a release swapped under
 * an open page) is said in the console, nothing is drawn, and it is asked for again the next time the part is wanted.
 * Called in a constructor; `bindings` are the part's inputs and outputs, made each time it is drawn.
 */
export function drawWhile(part: DrawnPart, slot: () => ViewContainerRef, wanted: () => boolean, bindings: () => Binding[]): void {
  const tasks = inject(PendingTasks);
  let drawn: ComponentRef<unknown> | null = null;
  let loading = false;
  let gone = false;
  inject(DestroyRef).onDestroy(() => (gone = true));

  const sync = (): void => {
    if (gone) {
      return;
    }
    if (!wanted()) {
      drawn?.destroy();
      drawn = null;
      return;
    }
    const came = drawnParts.came[part];
    if (drawn || loading) {
      return;
    }
    if (came) {
      drawn = slot().createComponent(came, { bindings: bindings() });
      return;
    }
    loading = true;
    const done = tasks.add();
    drawnParts.load[part]()
      .then(
        (loaded) => {
          drawnParts.came[part] = loaded;
          loading = false;
          sync();
        },
        (error: unknown) => {
          loading = false;
          console.error(`[anotoki site settings] ${NAMES[part]} could not be loaded`, error);
        },
      )
      .finally(done);
  };

  // Follows what the part shows, so that a part that could not be fetched is asked for again when that changes.
  effect(() => {
    wanted();
    untracked(sync);
  });
}
