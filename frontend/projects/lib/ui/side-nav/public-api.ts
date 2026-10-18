/*
 * @anotoki/lib/ui/side-nav - <anotoki-side-nav> (a named nav of links in groups - headings that name their lists,
 * optionally collapsible; an icon and a badge heard in words; the page's link aria-current="page") that moves into the
 * kit's drawer on a phone, opened by its own button or by the site's, [anotokiSideNavTrigger]. An entry point of its
 * own: not re-exported by @anotoki/lib/ui.
 */

export type { SideNavGroup, SideNavLink } from './src/side-nav-item';
export { SideNavComponent } from './src/side-nav/side-nav.component';
export { SideNavTriggerDirective } from './src/side-nav-trigger.directive';
