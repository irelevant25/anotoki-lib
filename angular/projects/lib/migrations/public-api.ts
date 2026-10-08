/*
 * @anotoki/lib/migrations - one behaviour for every anotoki site while its
 * database waits for an update: the site's status, the gate in front of its
 * pages, the status page and the update banner. The administrators'
 * Migrations page is an entry point of its own, @anotoki/lib/migrations/page,
 * so it stays out of a site's first load.
 * The server's half is the PHP package anotoki/lib (Anotoki\Lib\Migrations).
 */

export type { AnotokiMigrationsConfig, SiteState, SiteStatusWords } from './src/config';
export { ANOTOKI_MIGRATIONS_CONFIG, provideAnotokiMigrations } from './src/config';
export { SiteStatus } from './src/site-status.service';
export { siteStatusInterceptor } from './src/site-status.interceptor';
export { SiteGateComponent } from './src/site-gate/site-gate.component';
export { SitePagesDirective } from './src/site-gate/site-pages.directive';
export { SiteStatusComponent } from './src/site-status/site-status.component';
export { UpdateBannerComponent } from './src/update-banner/update-banner.component';

// For @anotoki/lib/migrations/page only; not a site's API.
export { defaultFormatDate as ɵdefaultFormatDate } from './src/config';
export { messageOf as ɵmessageOf } from './src/http';
