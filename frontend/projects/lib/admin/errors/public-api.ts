/*
 * @anotoki/lib/admin/errors - the administrators' error log, <anotoki-error-log-page>
 * (English, for the site's ADMIN alone): an entry point of its own, on a lazy route.
 *
 *   { path: 'errors', loadComponent: () => import('@anotoki/lib/admin/errors').then((m) => m.ErrorLogPageComponent) }
 *
 * The server's half: Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes::admin().
 */

export type { ErrorLogEntry, ErrorLogGroup, ErrorLogReport, ErrorLogTally } from './src/models';
export { ErrorLogPageComponent } from './src/error-log-page/error-log-page.component';
