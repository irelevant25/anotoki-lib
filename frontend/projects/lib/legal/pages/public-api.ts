/*
 * @anotoki/lib/legal/pages - the three legal pages every anotoki site shows: <anotoki-terms-page>,
 * <anotoki-privacy-page> and <anotoki-contact-page>, in the family's words (`anotoki.legal.*`, which they read
 * themselves: pages of text, in no first load) around the site's facts (provideAnotokiLegal, @anotoki/lib/legal).
 * An entry point of its own, each page on a lazy route of the site's:
 *
 *   { path: 'privacy', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.PrivacyPageComponent) }
 *
 * The Contact page opens the feedback form (@anotoki/lib/feedback/form, loaded with the first press) on a site that
 * takes feedback.
 */

export { TermsPageComponent } from './src/terms-page/terms-page.component';
export { PrivacyPageComponent } from './src/privacy-page/privacy-page.component';
export { ContactPageComponent } from './src/contact-page/contact-page.component';
export type { LegalWordName, LegalWords } from './src/words';
export { BUILT_IN_LEGAL_WORDS, LEGAL_TEXTS_UPDATED, legalKey, legalWordNames, legalWords } from './src/words';
