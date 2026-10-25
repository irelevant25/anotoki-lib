/*
 * @anotoki/lib/migrations/maintenance - the closed sign, <anotoki-maintenance-page> (0.11.0): what everybody but the
 * site's ADMIN reads while its administrators have closed it for maintenance (the site settings' "Getting in"). The
 * status page (<anotoki-site-status>, @anotoki/lib/migrations) loads it as the site's status says `maintenance` - an
 * entry point of its own, with its words (`anotoki.maintenance.*`, read by the sign itself), so that no first load
 * carries either. A site names nothing of it.
 */

export { MaintenancePageComponent } from './src/maintenance-page/maintenance-page.component';
