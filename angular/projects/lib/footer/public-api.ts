/*
 * @anotoki/lib/footer - <anotoki-site-footer>, the family's footer (0.6.3): the foot of every page of every anotoki
 * site and of its admin panel, the build analyzer's - "Version X · What's new · Send feedback", Terms · Privacy ·
 * Contact under them (<anotoki-legal-links>, the site's provideAnotokiLegal()), and the fan clause where the site asks
 * for it. In every site's first load, so small: its words (`anotoki.footer.*`, @anotoki/lib/words/footer) are read by
 * the footer itself, and the feedback form (@anotoki/lib/feedback/form, configured by the site's
 * provideAnotokiFeedback()) is loaded with the press that opens it.
 *
 *   <anotoki-shell>
 *     ...
 *     <anotoki-site-footer shellFooter [version]="version()" whatsNew (whatsNew)="openWhatsNew()" feedback fan="hoyoverse" />
 *   </anotoki-shell>
 */

export type { SiteFooterFan } from './src/site-footer/site-footer.component';
export { SiteFooterComponent } from './src/site-footer/site-footer.component';
