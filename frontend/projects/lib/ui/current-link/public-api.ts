/*
 * @anotoki/lib/ui/current-link - currentLink(): which of a navigation's links is the page's (the router's address, the
 * most specific link when several match, or the one a page names) - what the kit's link tabs and side navigation mark
 * aria-current="page", for a site's own navigation too. A small entry point of its own, outside the kit's core and its
 * first loads: not re-exported by @anotoki/lib/ui.
 */

export type { RoutedLink } from './src/current-link';
export { currentLink } from './src/current-link';
