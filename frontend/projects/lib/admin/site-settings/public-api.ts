/*
 * @anotoki/lib/admin/site-settings - the administrators' site settings, <anotoki-site-settings-page> (0.11.0; English,
 * for the site's ADMIN alone): a card for each part the site offers - Getting in, Announcement, Page access - each
 * opening its dialog. An entry point of its own, on a lazy route inside the site's admin routes and its ADMIN check:
 *
 *   { path: 'settings', loadComponent: () => import('@anotoki/lib/admin/site-settings').then((m) => m.SiteSettingsPageComponent) }
 *
 * The parts are the server's to say (the site's SiteSettings, its `parts`): the IAM offers the announcement alone. The
 * languages a message is written in are provideAnotokiAdmin()'s `languages`. What the pages show is
 * @anotoki/lib/site-settings's (the bar, the guard, the notice) and @anotoki/lib/migrations's (the closed sign). The
 * server's half: Anotoki\Lib\SiteSettings\Http\SiteSettingsRoutes::admin().
 */

export type { AdminPage, AdminSiteSettings, AnnouncementLevel, Message, PageVisibility, SettingHistory, SettingRow, SitePart, SiteSwitches, SwitchName } from './src/models';
export { SiteSettingsPageComponent } from './src/site-settings-page/site-settings-page.component';
