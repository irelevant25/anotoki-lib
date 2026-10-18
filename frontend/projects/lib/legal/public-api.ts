/*
 * @anotoki/lib/legal - the legal pages' configuration (provideAnotokiLegal: the site's facts, its paths, the
 * operator - Code Hero s.r.o. unless it names another) and the footer's three links (<anotoki-legal-links>: Terms ·
 * Privacy · Contact, which registers their words, `anotoki.legalLinks.*`, with the translations module). Small, so a
 * site provides it with the rest of its app; the pages themselves are @anotoki/lib/legal/pages, each on a lazy route:
 *
 *   { path: 'terms', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.TermsPageComponent) },
 *   { path: 'privacy', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.PrivacyPageComponent) },
 *   { path: 'contact', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.ContactPageComponent) },
 */

export type {
  AnotokiLegalConfig,
  LegalAccount,
  LegalBackups,
  LegalDataItem,
  LegalErrorLog,
  LegalFacts,
  LegalFeedback,
  LegalModule,
  LegalOperator,
  LegalPaths,
  LegalProcessor,
  LegalProcessorPreset,
  LegalStorageItem,
  LegalStorageKind,
  LegalStoragePreset,
  LegalVisitors,
} from './src/config';
export { ANOTOKI_LEGAL_CONFIG, DEFAULT_LEGAL_PATHS, LEGAL_ANALYTICS_HOST, LEGAL_OPERATOR, legalEmail, legalOperator, legalPaths, provideAnotokiLegal } from './src/config';
export type { LegalLinkWords } from './src/link-words';
export { BUILT_IN_LEGAL_LINK_WORDS, LEGAL_LINK_WORD_NAMES, legalLinkWords } from './src/link-words';
export { LegalLinksComponent } from './src/legal-links/legal-links.component';
