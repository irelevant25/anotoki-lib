/*
 * @anotoki/lib/site-settings/notice - the administrators' notice as it is drawn (0.11.1). <anotoki-page-notice>
 * (@anotoki/lib/site-settings) loads it only for the site's ADMIN, and only while there is something to tell them - the
 * site closed, the page switched off or kept for some readers - and puts it in its place: an entry point of its own,
 * with the kit's callout and its words (`anotoki.siteSettings.*`, read by the notice itself), so that no first load
 * carries any of them. It imports nothing of the module that loads it (ng-packagr allows no cycle): the element hands
 * it what there is to say. A site names nothing of it.
 */

export { PageNoticeListComponent } from './src/page-notice-list/page-notice-list.component';
