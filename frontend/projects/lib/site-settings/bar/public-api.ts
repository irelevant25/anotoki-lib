/*
 * @anotoki/lib/site-settings/bar - the announcement bar as it is drawn (0.11.1). <anotoki-announcement>
 * (@anotoki/lib/site-settings) loads it only while there is an announcement to show - not hidden, written in the page's
 * language or in English - and puts it in its place: an entry point of its own, with the kit's pieces it draws and its
 * words (`anotoki.siteSettings.*`, read by the bar itself), so that no first load carries any of them. It imports
 * nothing of the module that loads it (ng-packagr allows no cycle): the element hands it what it shows. A site names
 * nothing of it.
 */

export { AnnouncementBarComponent } from './src/announcement-bar/announcement-bar.component';
