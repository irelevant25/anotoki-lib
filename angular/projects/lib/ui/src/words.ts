/**
 * Every word the kit itself says (the toast region's name, "optional", the bar's
 * "Sign out"...), built in for English and Slovak (informal, "ty"). A site
 * changes any of them per language (provideAnotokiUi's `words`) or feeds them
 * from its database (`lookup`): the keys are the ones the translations module
 * seeds, as `anotoki.<key>`.
 *
 * Names are never kit words: a site's sections, brand area and "Back to ..."
 * are the site's own, passed in as they read.
 *
 * One table for all the kit's entry points, kept in the core one: a site's
 * wrapper words its own menu items with the same keys (topbar.account), through
 * the one AnotokiWords.t().
 */
const EN = {
  'ui.close': 'Close',
  'ui.dismiss': 'Dismiss',
  'ui.notifications': 'Notifications',
  'ui.cancel': 'Cancel',
  'ui.confirm': 'Confirm',
  'ui.retry': 'Try again',
  'ui.optional': 'optional',
  'ui.loading': 'Loading…',
  'ui.showPassword': 'Show password',
  'ui.hidePassword': 'Hide password',
  'ui.copy': 'Copy',
  'ui.copied': 'Copied',
  'ui.copyToClipboard': 'Copy to clipboard',
  'ui.copiedToClipboard': 'Copied to clipboard.',
  'ui.copyFailed': 'Copying did not work. Select the text and copy it yourself.',
  'ui.qrCode': 'QR code',
  'ui.or': 'or',
  'ui.pages': 'Pages',
  'ui.previous': 'Previous',
  'ui.next': 'Next',
  'ui.range': '{first}-{last} of {total}',
  'ui.pageOf': 'Page {page} of {pages}',
  'ui.nothingToShow': 'Nothing to show',
  'topbar.skipToContent': 'Skip to content',
  'topbar.sections': 'Main navigation',
  'topbar.phoneMenu': 'Menu',
  'topbar.menuButton': 'Your menu: {name}',
  'topbar.menu': 'Your menu',
  'topbar.roleAdmin': 'Administrator',
  'topbar.roleEditor': 'Editor',
  'topbar.account': 'Your anotoki account',
  'topbar.admin': 'Admin panel',
  'topbar.signIn': 'Sign in',
  'topbar.signOut': 'Sign out',
  'topbar.saving': 'Saving…',
  'language.label': 'Language',
  'language.button': 'Language: {name} ({code})',
  'language.notLoaded': 'The language could not be loaded. Try again.',
  'language.notSaved': 'The language could not be saved to your anotoki account - it holds for this visit only.',
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.auto': 'Automatic',
  'theme.autoHint': 'As your device is set',
  'theme.notSaved': 'The theme could not be saved to your anotoki account.',
} as const;

/** A word the kit says. */
export type AnotokiWordKey = keyof typeof EN;

/** Words for some of the keys, in one language. */
export type AnotokiWordTable = Readonly<Partial<Record<AnotokiWordKey, string>>>;

const SK: Readonly<Record<AnotokiWordKey, string>> = {
  'ui.close': 'Zavrieť',
  'ui.dismiss': 'Zavrieť',
  'ui.notifications': 'Oznámenia',
  'ui.cancel': 'Zrušiť',
  'ui.confirm': 'Potvrdiť',
  'ui.retry': 'Skúsiť znova',
  'ui.optional': 'nepovinné',
  'ui.loading': 'Načítava sa…',
  'ui.showPassword': 'Zobraziť heslo',
  'ui.hidePassword': 'Skryť heslo',
  'ui.copy': 'Kopírovať',
  'ui.copied': 'Skopírované',
  'ui.copyToClipboard': 'Kopírovať do schránky',
  'ui.copiedToClipboard': 'Skopírované do schránky.',
  'ui.copyFailed': 'Kopírovanie nefungovalo. Označ text a skopíruj ho ručne.',
  'ui.qrCode': 'QR kód',
  'ui.or': 'alebo',
  'ui.pages': 'Strany',
  'ui.previous': 'Predchádzajúca',
  'ui.next': 'Ďalšia',
  'ui.range': '{first}-{last} z {total}',
  'ui.pageOf': 'Strana {page} z {pages}',
  'ui.nothingToShow': 'Nie je čo zobraziť',
  'topbar.skipToContent': 'Preskočiť na obsah',
  'topbar.sections': 'Hlavná navigácia',
  'topbar.phoneMenu': 'Ponuka',
  'topbar.menuButton': 'Tvoja ponuka: {name}',
  'topbar.menu': 'Tvoja ponuka',
  'topbar.roleAdmin': 'Administrátor',
  'topbar.roleEditor': 'Editor',
  'topbar.account': 'Tvoj anotoki účet',
  'topbar.admin': 'Administrátorský panel',
  'topbar.signIn': 'Prihlásiť sa',
  'topbar.signOut': 'Odhlásiť sa',
  'topbar.saving': 'Ukladá sa…',
  'language.label': 'Jazyk',
  'language.button': 'Jazyk: {name} ({code})',
  'language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.',
  'language.notSaved': 'Jazyk sa nepodarilo uložiť do tvojho anotoki účtu - platí len počas tejto návštevy.',
  'theme.label': 'Vzhľad',
  'theme.light': 'Svetlý',
  'theme.dark': 'Tmavý',
  'theme.auto': 'Automaticky',
  'theme.autoHint': 'Podľa nastavenia zariadenia',
  'theme.notSaved': 'Vzhľad sa nepodarilo uložiť do tvojho anotoki účtu.',
};

/** The built-in words, per language. English has every key; it is what any other word falls back on. */
export const BUILT_IN_WORDS: Readonly<Record<string, Readonly<Record<AnotokiWordKey, string>>>> = { en: EN, sk: SK };

/** Every key the kit has. */
export const ANOTOKI_WORD_KEYS = Object.keys(EN) as readonly AnotokiWordKey[];
