/*
 * @anotoki/lib/migrations - one behaviour for every anotoki site while its
 * database waits for an update, and the administrators' Migrations page.
 * The server's half is the PHP package anotoki/lib (Anotoki\Lib\Migrations).
 */

export type { AnotokiMigrationsConfig, SiteState, SiteStatusWords } from './src/config';
export { ANOTOKI_MIGRATIONS_CONFIG, provideAnotokiMigrations } from './src/config';
export { SiteStatus } from './src/site-status.service';
export { siteStatusInterceptor } from './src/site-status.interceptor';
export { SiteGateComponent } from './src/site-gate/site-gate.component';
export { SiteStatusComponent } from './src/site-status/site-status.component';
export { UpdateBannerComponent } from './src/update-banner/update-banner.component';
export { MigrationsPageComponent } from './src/migrations-page/migrations-page.component';
