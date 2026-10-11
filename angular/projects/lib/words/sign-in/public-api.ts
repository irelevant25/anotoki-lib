/*
 * @anotoki/lib/words/sign-in - the anotoki library's own words of `anotoki.signIn.*`, in English and in
 * Slovak (informal, "ty"). Imported by the module that says them, and by @anotoki/lib/words (every module's words,
 * for the translations module) - never by the kit, so no first load of the kit carries them.
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.signIn.signingIn': 'Signing you in…',
  'anotoki.signIn.notCompleted': 'The sign-in was not completed.',
  'anotoki.signIn.expired': 'The sign-in took too long or did not start on this page. Try again.',
  'anotoki.signIn.storageUnavailable': 'This browser does not let the site remember a sign-in. Allow the site\'s storage, then try again.',
  'anotoki.signIn.unavailable': 'Signing in is not available right now. Try again in a few minutes.',
  'anotoki.signIn.failed': 'The sign-in failed ({code}).',
  'anotoki.signIn.retry': 'Try again',
  'anotoki.signIn.back': 'Back',
} as const;

/** A key of these words. */
export type SignInLibraryKey = keyof typeof EN;

const SK: Readonly<Record<SignInLibraryKey, string>> = {
  'anotoki.signIn.signingIn': 'Prihlasujeme ťa…',
  'anotoki.signIn.notCompleted': 'Prihlásenie sa nedokončilo.',
  'anotoki.signIn.expired': 'Prihlásenie trvalo príliš dlho alebo sa nezačalo na tejto stránke. Skús to znova.',
  'anotoki.signIn.storageUnavailable': 'Tento prehliadač nedovolí stránke zapamätať si prihlásenie. Povoľ jej ukladanie údajov a skús to znova.',
  'anotoki.signIn.unavailable': 'Prihlásenie teraz nie je dostupné. Skús to znova o pár minút.',
  'anotoki.signIn.failed': 'Prihlásenie zlyhalo ({code}).',
  'anotoki.signIn.retry': 'Skúsiť znova',
  'anotoki.signIn.back': 'Späť',
};

/** These words, per language: English and Slovak, each with every key. */
export const SIGN_IN_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<SignInLibraryKey, string>>>> = { en: EN, sk: SK };
