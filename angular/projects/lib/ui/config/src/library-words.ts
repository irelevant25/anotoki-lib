/*
 * The anotoki library's own words of the UI kit - `anotoki.language|ui|topbar|theme.*` - in English and
 * in Slovak (informal, "ty"); and LibraryKey, the name of every library key.
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`. A spec holds the generated files to the JSON (library-words.spec.ts), and
 * the PHP half's LibraryWordsTest does too.
 *
 * The same keys are in every site's database (anotoki_translations/002 and the library migrations after it), where
 * an owner may reword them; these are what a page reads while it has no string from there. The kit reads its own
 * from here (words.ts: AnotokiWords), and so does the translations module, so they are in every first load that
 * holds either - and no other module's words are: each is in @anotoki/lib/words/<namespace>, which its module alone
 * imports and registers with the translations module (provideLibraryWords).
 */

const EN = {
  'anotoki.language.label': 'Language',
  'anotoki.language.button': 'Language: {name} ({code})',
  'anotoki.language.notLoaded': 'The language could not be loaded. Try again.',
  'anotoki.language.notSaved': 'The language could not be saved to your anotoki account - it holds for this visit only.',
  'anotoki.ui.close': 'Close',
  'anotoki.ui.dismiss': 'Dismiss',
  'anotoki.ui.notifications': 'Notifications',
  'anotoki.ui.cancel': 'Cancel',
  'anotoki.ui.confirm': 'Confirm',
  'anotoki.ui.retry': 'Try again',
  'anotoki.ui.optional': 'optional',
  'anotoki.ui.loading': 'Loading…',
  'anotoki.ui.showPassword': 'Show password',
  'anotoki.ui.hidePassword': 'Hide password',
  'anotoki.ui.copy': 'Copy',
  'anotoki.ui.copied': 'Copied',
  'anotoki.ui.copyToClipboard': 'Copy to clipboard',
  'anotoki.ui.copiedToClipboard': 'Copied to clipboard.',
  'anotoki.ui.copyFailed': 'Copying did not work. Select the text and copy it yourself.',
  'anotoki.ui.qrCode': 'QR code',
  'anotoki.ui.or': 'or',
  'anotoki.ui.pages': 'Pages',
  'anotoki.ui.previous': 'Previous',
  'anotoki.ui.next': 'Next',
  'anotoki.ui.range': '{first}-{last} of {total}',
  'anotoki.ui.pageOf': 'Page {page} of {pages}',
  'anotoki.ui.nothingToShow': 'Nothing to show',
  'anotoki.topbar.skipToContent': 'Skip to content',
  'anotoki.topbar.sections': 'Main navigation',
  'anotoki.topbar.phoneMenu': 'Menu',
  'anotoki.topbar.menuButton': 'Your menu: {name}',
  'anotoki.topbar.menu': 'Your menu',
  'anotoki.topbar.roleAdmin': 'Administrator',
  'anotoki.topbar.roleEditor': 'Editor',
  'anotoki.topbar.account': 'Your anotoki account',
  'anotoki.topbar.admin': 'Admin panel',
  'anotoki.topbar.signIn': 'Sign in',
  'anotoki.topbar.signOut': 'Sign out',
  'anotoki.topbar.saving': 'Saving…',
  'anotoki.topbar.linkCount': '{count} new',
  'anotoki.theme.label': 'Theme',
  'anotoki.theme.light': 'Light',
  'anotoki.theme.dark': 'Dark',
  'anotoki.theme.auto': 'Automatic',
  'anotoki.theme.autoHint': 'As your device is set',
  'anotoki.theme.notSaved': 'The theme could not be saved to your anotoki account.',
} as const;

/** A key of these words. */
export type KitLibraryKey = keyof typeof EN;

const SK: Readonly<Record<KitLibraryKey, string>> = {
  'anotoki.language.label': 'Jazyk',
  'anotoki.language.button': 'Jazyk: {name} ({code})',
  'anotoki.language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.',
  'anotoki.language.notSaved': 'Jazyk sa nepodarilo uložiť do tvojho anotoki účtu - platí len počas tejto návštevy.',
  'anotoki.ui.close': 'Zavrieť',
  'anotoki.ui.dismiss': 'Zavrieť',
  'anotoki.ui.notifications': 'Oznámenia',
  'anotoki.ui.cancel': 'Zrušiť',
  'anotoki.ui.confirm': 'Potvrdiť',
  'anotoki.ui.retry': 'Skúsiť znova',
  'anotoki.ui.optional': 'nepovinné',
  'anotoki.ui.loading': 'Načítava sa…',
  'anotoki.ui.showPassword': 'Zobraziť heslo',
  'anotoki.ui.hidePassword': 'Skryť heslo',
  'anotoki.ui.copy': 'Kopírovať',
  'anotoki.ui.copied': 'Skopírované',
  'anotoki.ui.copyToClipboard': 'Kopírovať do schránky',
  'anotoki.ui.copiedToClipboard': 'Skopírované do schránky.',
  'anotoki.ui.copyFailed': 'Kopírovanie nefungovalo. Označ text a skopíruj ho ručne.',
  'anotoki.ui.qrCode': 'QR kód',
  'anotoki.ui.or': 'alebo',
  'anotoki.ui.pages': 'Strany',
  'anotoki.ui.previous': 'Predchádzajúca',
  'anotoki.ui.next': 'Ďalšia',
  'anotoki.ui.range': '{first}-{last} z {total}',
  'anotoki.ui.pageOf': 'Strana {page} z {pages}',
  'anotoki.ui.nothingToShow': 'Nie je čo zobraziť',
  'anotoki.topbar.skipToContent': 'Preskočiť na obsah',
  'anotoki.topbar.sections': 'Hlavná navigácia',
  'anotoki.topbar.phoneMenu': 'Ponuka',
  'anotoki.topbar.menuButton': 'Tvoja ponuka: {name}',
  'anotoki.topbar.menu': 'Tvoja ponuka',
  'anotoki.topbar.roleAdmin': 'Administrátor',
  'anotoki.topbar.roleEditor': 'Editor',
  'anotoki.topbar.account': 'Tvoj anotoki účet',
  'anotoki.topbar.admin': 'Administrátorský panel',
  'anotoki.topbar.signIn': 'Prihlásiť sa',
  'anotoki.topbar.signOut': 'Odhlásiť sa',
  'anotoki.topbar.saving': 'Ukladá sa…',
  'anotoki.topbar.linkCount': 'nové: {count}',
  'anotoki.theme.label': 'Vzhľad',
  'anotoki.theme.light': 'Svetlý',
  'anotoki.theme.dark': 'Tmavý',
  'anotoki.theme.auto': 'Automaticky',
  'anotoki.theme.autoHint': 'Podľa nastavenia zariadenia',
  'anotoki.theme.notSaved': 'Vzhľad sa nepodarilo uložiť do tvojho anotoki účtu.',
};

/** The kit's words, per language: English and Slovak, each with every key. */
export const KIT_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<KitLibraryKey, string>>>> = { en: EN, sk: SK };

/** A key of the library's own words, every module's: `anotoki.<namespace>.<word>` (a type: nothing of it is in a bundle). */
export type LibraryKey =
  | KitLibraryKey
  | 'anotoki.siteStatus.updatingTitle'
  | 'anotoki.siteStatus.updatingText'
  | 'anotoki.siteStatus.unavailableTitle'
  | 'anotoki.siteStatus.unavailableText'
  | 'anotoki.siteStatus.notSetUpTitle'
  | 'anotoki.siteStatus.notSetUpText'
  | 'anotoki.siteStatus.openSetup'
  | 'anotoki.siteStatus.tryAgain'
  | 'anotoki.siteStatus.signIn'
  | 'anotoki.signIn.signingIn'
  | 'anotoki.signIn.failedTitle'
  | 'anotoki.signIn.notCompleted'
  | 'anotoki.signIn.expired'
  | 'anotoki.signIn.storageUnavailable'
  | 'anotoki.signIn.unavailable'
  | 'anotoki.signIn.failed'
  | 'anotoki.signIn.retry'
  | 'anotoki.signIn.back'
  | 'anotoki.feedback.title'
  | 'anotoki.feedback.lead'
  | 'anotoki.feedback.kind'
  | 'anotoki.feedback.kindBug'
  | 'anotoki.feedback.kindIdea'
  | 'anotoki.feedback.kindOther'
  | 'anotoki.feedback.section'
  | 'anotoki.feedback.sectionNone'
  | 'anotoki.feedback.subject'
  | 'anotoki.feedback.message'
  | 'anotoki.feedback.messageHint'
  | 'anotoki.feedback.email'
  | 'anotoki.feedback.emailHint'
  | 'anotoki.feedback.anonymous'
  | 'anotoki.feedback.anonymousHint'
  | 'anotoki.feedback.send'
  | 'anotoki.feedback.sending'
  | 'anotoki.feedback.thanks'
  | 'anotoki.feedback.thanksText'
  | 'anotoki.feedback.another'
  | 'anotoki.feedback.messageRequired'
  | 'anotoki.feedback.subjectRequired'
  | 'anotoki.feedback.tooLong'
  | 'anotoki.feedback.emailInvalid'
  | 'anotoki.feedback.tooManyHour'
  | 'anotoki.feedback.tooManyDay'
  | 'anotoki.feedback.unavailable'
  | 'anotoki.feedback.signInRequired'
  | 'anotoki.feedback.failed'
  | 'anotoki.feedback.network'
  | 'anotoki.feedback.honeypot'
  | 'anotoki.legalLinks.label'
  | 'anotoki.legalLinks.terms'
  | 'anotoki.legalLinks.privacy'
  | 'anotoki.legalLinks.contact'
  | 'anotoki.legal.updated'
  | 'anotoki.legal.onThisPage'
  | 'anotoki.legal.whatFor'
  | 'anotoki.legal.howLong'
  | 'anotoki.legal.toBeNamed'
  | 'anotoki.legal.copyAddress'
  | 'anotoki.legal.accountPage'
  | 'anotoki.legal.accountTitle'
  | 'anotoki.legal.sectionContact'
  | 'anotoki.legal.otherWays'
  | 'anotoki.legal.fanHoyoverse'
  | 'anotoki.legal.termsTitle'
  | 'anotoki.legal.termsLead'
  | 'anotoki.legal.termsWhatTitle'
  | 'anotoki.legal.termsWhatText'
  | 'anotoki.legal.termsAccountText'
  | 'anotoki.legal.termsAccountTextIam'
  | 'anotoki.legal.termsAccountCare'
  | 'anotoki.legal.termsAgeTitle'
  | 'anotoki.legal.termsAgeText'
  | 'anotoki.legal.termsUseTitle'
  | 'anotoki.legal.termsUseText'
  | 'anotoki.legal.termsSendTitle'
  | 'anotoki.legal.termsSendText'
  | 'anotoki.legal.termsAvailabilityTitle'
  | 'anotoki.legal.termsAvailabilityText'
  | 'anotoki.legal.termsChangesText'
  | 'anotoki.legal.termsWarrantyTitle'
  | 'anotoki.legal.termsWarrantyText'
  | 'anotoki.legal.termsFanTitle'
  | 'anotoki.legal.termsLawTitle'
  | 'anotoki.legal.termsLawText'
  | 'anotoki.legal.termsContactText'
  | 'anotoki.legal.privacyTitle'
  | 'anotoki.legal.privacyLead'
  | 'anotoki.legal.privacyWhoTitle'
  | 'anotoki.legal.privacyWhoText'
  | 'anotoki.legal.privacyWhoContact'
  | 'anotoki.legal.privacyKeepsTitle'
  | 'anotoki.legal.privacyKeepsText'
  | 'anotoki.legal.visitorsName'
  | 'anotoki.legal.visitorsWhy'
  | 'anotoki.legal.feedbackName'
  | 'anotoki.legal.feedbackWhat'
  | 'anotoki.legal.feedbackWhy'
  | 'anotoki.legal.feedbackKept'
  | 'anotoki.legal.errorLogName'
  | 'anotoki.legal.errorLogWhat'
  | 'anotoki.legal.errorLogWhy'
  | 'anotoki.legal.errorLogKept'
  | 'anotoki.legal.auditLogName'
  | 'anotoki.legal.auditLogWhat'
  | 'anotoki.legal.auditLogWhy'
  | 'anotoki.legal.auditLogKept'
  | 'anotoki.legal.backupsName'
  | 'anotoki.legal.backupsWhat'
  | 'anotoki.legal.backupsWherePlain'
  | 'anotoki.legal.backupsWhereEncrypted'
  | 'anotoki.legal.backupsWhy'
  | 'anotoki.legal.backupsKept'
  | 'anotoki.legal.privacyAccountText'
  | 'anotoki.legal.privacyAccountLink'
  | 'anotoki.legal.privacyAccountRecord'
  | 'anotoki.legal.privacyAccountTextIam'
  | 'anotoki.legal.privacyStorageTitle'
  | 'anotoki.legal.privacyStorageText'
  | 'anotoki.legal.storageCookie'
  | 'anotoki.legal.storageLocal'
  | 'anotoki.legal.storageSession'
  | 'anotoki.legal.storageHintPurpose'
  | 'anotoki.legal.storageHintKept'
  | 'anotoki.legal.storageSignInPurpose'
  | 'anotoki.legal.storageSignInKept'
  | 'anotoki.legal.storageThemePurpose'
  | 'anotoki.legal.storageLanguagePurpose'
  | 'anotoki.legal.storageUntilCleared'
  | 'anotoki.legal.storageVisitorPurpose'
  | 'anotoki.legal.storageVisitorKept'
  | 'anotoki.legal.privacyAnalyticsTitle'
  | 'anotoki.legal.privacyAnalyticsText'
  | 'anotoki.legal.privacyAnalyticsNone'
  | 'anotoki.legal.privacyOthersTitle'
  | 'anotoki.legal.privacyOthersText'
  | 'anotoki.legal.hostingName'
  | 'anotoki.legal.hostingRole'
  | 'anotoki.legal.cloudflareRole'
  | 'anotoki.legal.googleRole'
  | 'anotoki.legal.mailName'
  | 'anotoki.legal.mailRole'
  | 'anotoki.legal.privacyHowLongTitle'
  | 'anotoki.legal.privacyHowLongText'
  | 'anotoki.legal.privacyRightsTitle'
  | 'anotoki.legal.privacyRightsText'
  | 'anotoki.legal.privacyRightsDelete'
  | 'anotoki.legal.privacyRightsComplaint'
  | 'anotoki.legal.authority'
  | 'anotoki.legal.privacyChangesTitle'
  | 'anotoki.legal.privacyChangesText'
  | 'anotoki.legal.privacyContactText'
  | 'anotoki.legal.contactTitle'
  | 'anotoki.legal.contactLead'
  | 'anotoki.legal.contactFeedbackTitle'
  | 'anotoki.legal.contactFeedbackText'
  | 'anotoki.legal.contactFeedbackButton'
  | 'anotoki.legal.contactFeedbackFailed'
  | 'anotoki.legal.contactEmailTitle'
  | 'anotoki.legal.contactEmailTitleAlone'
  | 'anotoki.legal.contactEmailText'
  | 'anotoki.legal.contactEmailTextAlone'
  | 'anotoki.legal.contactEmailAccount'
  | 'anotoki.legal.contactDeleteTitle'
  | 'anotoki.legal.contactDeleteText'
  | 'anotoki.legal.contactDeleteEverywhere'
  | 'anotoki.legal.contactDeleteEverywhereIam'
  | 'anotoki.legal.contactResponseTitle'
  | 'anotoki.legal.contactResponseText'
  | 'anotoki.legal.contactAboutTitle'
  | 'anotoki.legal.contactAboutText'
  | 'anotoki.chips.remove'
  | 'anotoki.progress.count'
  | 'anotoki.stepper.stepOf'
  | 'anotoki.stepper.done';
