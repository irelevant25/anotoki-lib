/*
 * @anotoki/lib/migrations/page - the administrators' Migrations page,
 * <anotoki-migrations-page>: an entry point of its own, so that a site's first
 * load (which holds @anotoki/lib/migrations, the gate) never carries it.
 *
 *   { path: 'migrations', loadComponent: () => import('@anotoki/lib/migrations/page').then((m) => m.MigrationsPageComponent) }
 */

export { MigrationsPageComponent } from './src/migrations-page/migrations-page.component';
