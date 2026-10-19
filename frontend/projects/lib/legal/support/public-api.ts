/*
 * @anotoki/lib/legal/support - <anotoki-support-page> (0.8.0), the Support page every anotoki site shows, the same on
 * each, in the owner's own words (`anotoki.support.*`, which the page reads itself: in no first load): why the
 * projects can be supported, a button to the owner's Ko-fi page (SUPPORT_URL, opened in a new tab), and the owner's
 * thanks. Configured by the legal configuration (provideAnotokiLegal, @anotoki/lib/legal: the language, an owner's
 * rewording). An entry point of its own, on a lazy route of the site's - anybody's, in the frame its legal pages are
 * in; the About page's last line links to it, and so do the footer's links:
 *
 *   { path: 'support', loadComponent: () => import('@anotoki/lib/legal/support').then((m) => m.SupportPageComponent) }
 */

export { SUPPORT_URL, SupportPageComponent } from './src/support-page/support-page.component';
export type { SupportWordName, SupportWords } from './src/words';
export { BUILT_IN_SUPPORT_WORDS, supportKey, supportWordNames, supportWords } from './src/words';
