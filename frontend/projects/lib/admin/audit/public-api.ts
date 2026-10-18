/*
 * @anotoki/lib/admin/audit - the administrators' audit log, <anotoki-audit-log-page>
 * (English, for the site's ADMIN alone, read only): an entry point of its own, on a lazy route.
 *
 *   { path: 'audit', loadComponent: () => import('@anotoki/lib/admin/audit').then((m) => m.AuditLogPageComponent) }
 *
 * Its filters are the page's query parameters (actor, action, target_type, target_id, scope_type, scope_id, from,
 * to, page), so a site's own pages link to a part of it: ['/admin/audit'], { queryParams: { target_type: 'user', target_id: 42 } }.
 * The server's half: Anotoki\Lib\Audit\Http\AuditRoutes::admin().
 */

export type { AuditEntry, AuditFacets, AuditPage, ChangeRow, ReadDetails } from './src/models';
export { readDetails } from './src/details';
export { AuditLogPageComponent } from './src/audit-log-page/audit-log-page.component';
