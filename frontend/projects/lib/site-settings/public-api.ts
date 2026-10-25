/*
 * @anotoki/lib/site-settings - the site settings on a site's pages (0.11.0, genshin's for every anotoki site): what
 * every page is told (SiteSettings, from the site's GET /api/site-settings, read once at boot), the announcement bar
 * (<anotoki-announcement>), Page access's guard (pageAccessGuard) and what an administrator is told about the page
 * they are on (<anotoki-page-notice>). Small - a site whose pages offer an announcement or page access has it on every
 * page - and its words (`anotoki.siteSettings.*`, @anotoki/lib/words/site-settings) are read by its pieces themselves.
 *
 * Getting in is the migrations module's (@anotoki/lib/migrations): the site's status says `maintenance`, and the
 * gate draws the closed sign. The administrators' page is @anotoki/lib/admin/site-settings, on a lazy admin route.
 * The server's half is the PHP package anotoki/lib (Anotoki\Lib\SiteSettings).
 *
 *   provideAnotokiSiteSettings(() => ({ roles: () => auth.roles(), signedIn: () => auth.signedIn(), storageKey: 'anotoki-survey:announcement' })),
 *   provideAppInitializer(() => inject(SiteSettings).load()),
 *   { path: 'quizzes', canMatch: [pageAccessGuard], ... }
 *   <anotoki-announcement />  <app-top-bar />  <anotoki-page-notice />  <router-outlet />
 */

export type { AnotokiSiteSettingsConfig } from './src/config';
export { ANOTOKI_SITE_SETTINGS_CONFIG, provideAnotokiSiteSettings } from './src/config';
export type { AnnouncementLevel, PageNotice, PageVisibility, PublicPage, SiteAnnouncement } from './src/site-settings.service';
export { SiteSettings, pageMatches } from './src/site-settings.service';
export { pageAccessGuard } from './src/page-access.guard';
export { AnnouncementComponent, announcementMark } from './src/announcement/announcement.component';
export { PageNoticeComponent } from './src/page-notice/page-notice.component';
