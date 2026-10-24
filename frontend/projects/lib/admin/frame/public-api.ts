/*
 * @anotoki/lib/admin/frame - <anotoki-admin-frame>, the frame of every anotoki admin panel (0.10.0; the owner's request
 * of 2026-10-24: every admin panel looks like genshin's, so that the panel is never mistaken for the site). On a
 * computer a column on the left - the panel's name, who is signed in, Back to the site, Sign out, the theme and the
 * panel's pages in groups (the kit's side navigation) - and on the right the page with the site's footer under it,
 * each column scrolling on its own; on a phone a row with the name and Menu, and everything of the column in the side
 * navigation's drawer. An entry point of its own: an admin area is a lazy route, so no site's first load carries it.
 *
 *   <anotoki-admin-frame [brand]="{ name: 'Genshin Admin', path: '/admin' }" [person]="person()" [groups]="groups()"
 *       [back]="{ label: 'Back to the site', path: '/' }" [signOut]="signOut">
 *     <anotoki-theme-toggle adminFrameTheme />
 *     <anotoki-update-banner adminFrameNotice />
 *     <router-outlet />
 *     <anotoki-site-footer adminFrameFooter [version]="version()" whatsNew (whatsNew)="openWhatsNew()" feedback />
 *   </anotoki-admin-frame>
 *
 * The theme's switch is the family's, `<anotoki-theme-toggle>` (@anotoki/lib/shell, over ThemeService and the site's
 * provideAnotokiShell()): the account's theme, as on every page of every site. It comes in a slot: the library's entry
 * points never import the shell.
 */

export type { SideNavGroup, SideNavLink } from '@anotoki/lib/ui/side-nav';
export type { AdminFrameAction, AdminFrameBrand, AdminFrameLink, AdminFramePerson } from './src/admin-frame/admin-frame.component';
export { AdminFrameComponent } from './src/admin-frame/admin-frame.component';
