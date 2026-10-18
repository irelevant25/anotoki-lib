/*
 * @anotoki/lib/words/feedback - the anotoki library's own words of `anotoki.feedback.*`, in English and in
 * Slovak (informal, "ty"). Imported by the module that says them, which registers them with the translations module
 * (provideLibraryWords) - never by the kit nor by the translations module, so they reach a site with the module alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.feedback.title': 'Send feedback',
  'anotoki.feedback.lead': 'Something broken, an idea, a question? Tell us - every message is read.',
  'anotoki.feedback.kind': 'What is it about?',
  'anotoki.feedback.kindBug': 'Something does not work',
  'anotoki.feedback.kindIdea': 'An idea',
  'anotoki.feedback.kindOther': 'Something else',
  'anotoki.feedback.section': 'Where on the site?',
  'anotoki.feedback.sectionNone': 'Nowhere in particular',
  'anotoki.feedback.subject': 'Subject',
  'anotoki.feedback.message': 'Your message',
  'anotoki.feedback.messageHint': 'What happened and what should have happened - or what would be better.',
  'anotoki.feedback.email': 'Your e-mail address',
  'anotoki.feedback.emailHint': 'Only if you would like an answer. It is used for nothing else.',
  'anotoki.feedback.anonymous': 'Send it without my name',
  'anotoki.feedback.anonymousHint': 'Neither your account nor your address goes with it.',
  'anotoki.feedback.send': 'Send',
  'anotoki.feedback.sending': 'Sending…',
  'anotoki.feedback.thanks': 'Thank you!',
  'anotoki.feedback.thanksText': 'Your message is on its way to us.',
  'anotoki.feedback.another': 'Send another',
  'anotoki.feedback.messageRequired': 'Write a message first.',
  'anotoki.feedback.subjectRequired': 'Give it a subject.',
  'anotoki.feedback.tooLong': 'This is longer than {max} characters.',
  'anotoki.feedback.emailInvalid': 'That does not look like an e-mail address.',
  'anotoki.feedback.tooManyHour': 'Thank you - but that is a lot of messages in a short while. Try again in an hour.',
  'anotoki.feedback.tooManyDay': 'Thank you - but there have been a lot of messages today. Try again tomorrow.',
  'anotoki.feedback.unavailable': 'Messages cannot be sent right now. Try again in a few minutes.',
  'anotoki.feedback.signInRequired': 'Sign in to send a message.',
  'anotoki.feedback.failed': 'The message could not be sent. Try again - what you wrote is still here.',
  'anotoki.feedback.network': 'The site could not be reached. Check the connection, then try again.',
  'anotoki.feedback.honeypot': 'Leave this field empty',
} as const;

/** A key of these words. */
export type FeedbackLibraryKey = keyof typeof EN;

const SK: Readonly<Record<FeedbackLibraryKey, string>> = {
  'anotoki.feedback.title': 'Pošli nám spätnú väzbu',
  'anotoki.feedback.lead': 'Niečo nefunguje, máš nápad alebo otázku? Napíš nám - čítame každú správu.',
  'anotoki.feedback.kind': 'O čo ide?',
  'anotoki.feedback.kindBug': 'Niečo nefunguje',
  'anotoki.feedback.kindIdea': 'Nápad',
  'anotoki.feedback.kindOther': 'Niečo iné',
  'anotoki.feedback.section': 'Kde na stránke?',
  'anotoki.feedback.sectionNone': 'Nikde konkrétne',
  'anotoki.feedback.subject': 'Predmet',
  'anotoki.feedback.message': 'Tvoja správa',
  'anotoki.feedback.messageHint': 'Čo sa stalo a čo sa malo stať - alebo čo by bolo lepšie.',
  'anotoki.feedback.email': 'Tvoja e-mailová adresa',
  'anotoki.feedback.emailHint': 'Len ak chceš odpoveď. Na nič iné ju nepoužijeme.',
  'anotoki.feedback.anonymous': 'Poslať bez môjho mena',
  'anotoki.feedback.anonymousHint': 'Nepôjde s ňou ani tvoj účet, ani tvoja adresa.',
  'anotoki.feedback.send': 'Poslať',
  'anotoki.feedback.sending': 'Posielam…',
  'anotoki.feedback.thanks': 'Ďakujeme!',
  'anotoki.feedback.thanksText': 'Tvoja správa je na ceste k nám.',
  'anotoki.feedback.another': 'Poslať ďalšiu',
  'anotoki.feedback.messageRequired': 'Najprv napíš správu.',
  'anotoki.feedback.subjectRequired': 'Doplň predmet.',
  'anotoki.feedback.tooLong': 'Toto je dlhšie ako {max} znakov.',
  'anotoki.feedback.emailInvalid': 'Toto nevyzerá ako e-mailová adresa.',
  'anotoki.feedback.tooManyHour': 'Ďakujeme - no to je veľa správ za krátky čas. Skús to znova o hodinu.',
  'anotoki.feedback.tooManyDay': 'Ďakujeme - no dnes prišlo veľa správ. Skús to znova zajtra.',
  'anotoki.feedback.unavailable': 'Správy teraz nemôžeš poslať. Skús to znova o pár minút.',
  'anotoki.feedback.signInRequired': 'Na poslanie správy sa prihlás.',
  'anotoki.feedback.failed': 'Správu sa nepodarilo poslať. Skús to znova - tvoj text tu stále je.',
  'anotoki.feedback.network': 'Stránka nie je dostupná. Skontroluj pripojenie a skús to znova.',
  'anotoki.feedback.honeypot': 'Toto pole nechaj prázdne',
};

/** These words, per language: English and Slovak, each with every key. */
export const FEEDBACK_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<FeedbackLibraryKey, string>>>> = { en: EN, sk: SK };
