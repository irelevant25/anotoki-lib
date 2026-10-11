/*
 * @anotoki/lib/people/page - the administrators' People page, <anotoki-people-page>:
 * an entry point of its own, loaded by the site's lazy admin route, so a site's
 * first load never carries it.
 *
 *   { path: 'people', canActivate: [adminGuard], loadComponent: () => import('@anotoki/lib/people/page').then((m) => m.PeoplePageComponent) }
 */

export { PeoplePageComponent } from './src/people-page/people-page.component';
