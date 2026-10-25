/*
 * @anotoki/lib/admin - the configuration of the library's admin tools
 * (provideAnotokiAdmin) and the unread feedback count a site's admin
 * navigation shows (FeedbackUnread). Small, so a site may provide it with the
 * rest of its app; the pages are entry points of their own, each on a lazy
 * route - English, for the site's ADMIN alone:
 *
 *   { path: 'errors', loadComponent: () => import('@anotoki/lib/admin/errors').then((m) => m.ErrorLogPageComponent) }
 *   { path: 'audit', loadComponent: () => import('@anotoki/lib/admin/audit').then((m) => m.AuditLogPageComponent) }
 *   { path: 'feedback', loadComponent: () => import('@anotoki/lib/admin/feedback').then((m) => m.FeedbackPageComponent) }
 *   { path: 'backups', loadComponent: () => import('@anotoki/lib/admin/backups').then((m) => m.BackupsPageComponent) }
 *   { path: 'files', loadComponent: () => import('@anotoki/lib/admin/files').then((m) => m.FilesPageComponent) }
 *   { path: 'settings', loadComponent: () => import('@anotoki/lib/admin/site-settings').then((m) => m.SiteSettingsPageComponent) }   (0.11.0)
 *
 * The server's half is the PHP package anotoki/lib (Anotoki\Lib\ErrorLog, Audit,
 * Feedback, Backups, Files, SiteSettings).
 */

export type { AdminFailure, AdminTool, AnotokiAdminConfig } from './src/config';
export { ANOTOKI_ADMIN_CONFIG, adminBase, provideAnotokiAdmin } from './src/config';
export { FeedbackUnread } from './src/feedback-unread';
