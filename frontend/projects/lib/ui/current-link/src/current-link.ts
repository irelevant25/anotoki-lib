import { Signal, computed, inject } from '@angular/core';
import { ActivatedRoute, IsActiveMatchOptions, Router, UrlTree, isActive } from '@angular/router';

/** A link of a navigation, as currentLink() reads it. */
export interface RoutedLink {
  /** Its name among the others: what a navigation's `current` names. */
  id?: string | null;
  /** Where it leads in the site: the router's commands, as `routerLink` takes them, relative to the page that draws it - none for a link elsewhere. */
  path?: string | readonly unknown[] | null;
  /** The page's on this exact address alone - a section's home, which every address under it starts with. */
  exact?: boolean | null;
}

/**
 * The address alone, or it and those under it - the query's parameters a link names must be there, others may be too
 * ("/?theme=dark" is the home page's; RouterLinkActive's `exact` would ask for no others).
 */
const EXACT: Partial<IsActiveMatchOptions> = { paths: 'exact', queryParams: 'subset', matrixParams: 'ignored', fragment: 'ignored' };
const UNDER: Partial<IsActiveMatchOptions> = { paths: 'subset', queryParams: 'subset', matrixParams: 'ignored', fragment: 'ignored' };

/**
 * Which of a navigation's links is the page's, for its aria-current="page": the one the router's address is - with
 * `exact`, that address alone; without it, that address or one under it - the most specific when several are (a
 * section's home, "/kanji", and its page "/kanji/lessons": the page), or none. `named` overrides it: the id of the link
 * to mark whatever the address says (a screen drawn over another without changing the address), null for the router's.
 *
 * Call it in an injection context (a component's field): a link's path is read as its `routerLink` reads it, relative
 * to the route of the page that draws the navigation. A signal: it follows the links, `named` and every navigation.
 */
export function currentLink<T extends RoutedLink>(links: () => readonly T[], named: () => string | null | undefined = () => null): Signal<T | null> {
  const router = inject(Router);
  const route = inject(ActivatedRoute, { optional: true }) ?? undefined;
  // Made again after every navigation: a relative path depends on where the page is.
  const trees = computed<(UrlTree | null)[]>(() => {
    router.lastSuccessfulNavigation();
    return links().map((link) => (link.path === null || link.path === undefined ? null : router.createUrlTree(typeof link.path === 'string' ? [link.path] : [...link.path], { relativeTo: route })));
  });
  return computed<T | null>(() => {
    const all = links();
    const id = named();
    if (id !== null && id !== undefined) {
      return all.find((link) => link.id === id) ?? null;
    }
    const made = trees();
    let found: T | null = null;
    let length = -1;
    for (let index = 0; index < all.length; index++) {
      const tree = made[index];
      if (tree && isActive(tree, router, all[index].exact ? EXACT : UNDER)()) {
        // The most specific: the longest address of those the page is at or under.
        const address = router.serializeUrl(tree).length;
        if (address > length) {
          found = all[index];
          length = address;
        }
      }
    }
    return found;
  });
}
