import { FEEDBACK_LIBRARY_WORDS } from '@anotoki/lib/words/feedback';

/**
 * The visitors' words of the feedback form - its title and fields, the kinds of
 * message, its thanks, and what it says of a message it could not send (from
 * the refusal's code alone, never from the server's English sentence). Each is
 * the library's word `anotoki.feedback.<name>`: built in for English and Slovak
 * (informal, "ty"), and in every site's database (anotoki_translations/004),
 * where its owner may reword them. A site words them its own way per language
 * (`words`), or from its database (`translate`: the translations module's
 * libraryWord()).
 */
export interface FeedbackWords {
  title: string;
  lead: string;
  kind: string;
  kindBug: string;
  kindIdea: string;
  kindOther: string;
  section: string;
  sectionNone: string;
  subject: string;
  message: string;
  messageHint: string;
  email: string;
  emailHint: string;
  anonymous: string;
  anonymousHint: string;
  send: string;
  sending: string;
  thanks: string;
  thanksText: string;
  another: string;
  messageRequired: string;
  subjectRequired: string;
  /** {max}: how many characters the field takes. */
  tooLong: string;
  emailInvalid: string;
  tooManyHour: string;
  tooManyDay: string;
  unavailable: string;
  signInRequired: string;
  failed: string;
  network: string;
  honeypot: string;
}

/** The words' names, each the library's word `anotoki.feedback.<name>`. */
export const FEEDBACK_WORD_NAMES = [
  'title',
  'lead',
  'kind',
  'kindBug',
  'kindIdea',
  'kindOther',
  'section',
  'sectionNone',
  'subject',
  'message',
  'messageHint',
  'email',
  'emailHint',
  'anonymous',
  'anonymousHint',
  'send',
  'sending',
  'thanks',
  'thanksText',
  'another',
  'messageRequired',
  'subjectRequired',
  'tooLong',
  'emailInvalid',
  'tooManyHour',
  'tooManyDay',
  'unavailable',
  'signInRequired',
  'failed',
  'network',
  'honeypot',
] as const satisfies readonly (keyof FeedbackWords)[];

function builtIn(language: 'en' | 'sk'): FeedbackWords {
  return Object.fromEntries(FEEDBACK_WORD_NAMES.map((name) => [name, FEEDBACK_LIBRARY_WORDS[language][`anotoki.feedback.${name}`]])) as unknown as FeedbackWords;
}

/**
 * The built-in words: the library's words `anotoki.feedback.*`
 * (@anotoki/lib/words/feedback, generated from php/resources/library-words.json)
 * - never a copy by hand, and in no first load of the kit.
 *
 * The calls are marked pure: a site's build keeps a top-level call it is not
 * told is pure, and with it every word of the form, a form shown or not.
 */
export const BUILT_IN_FEEDBACK_WORDS: Readonly<Record<'en' | 'sk', FeedbackWords>> = {
  en: /* @__PURE__ */ builtIn('en'),
  sk: /* @__PURE__ */ builtIn('sk'),
};

/** The library's key of a word, as a site's database holds it. */
export function feedbackKey(name: keyof FeedbackWords): string {
  return `anotoki.feedback.${name}`;
}

/**
 * The words for a language - English, under the built-in words of that
 * language, under the site's own, under its database's (`translate`) - and the
 * language they are in ('en' when nothing has that language).
 */
export function feedbackWords(
  language: string | null | undefined,
  overrides?: Readonly<Record<string, Partial<FeedbackWords>>>,
  translate?: (key: string) => string | null | undefined,
): { lang: string; words: FeedbackWords } {
  const code = (language || 'en').trim().toLowerCase();
  const primary = code.split('-')[0];
  const builtIn = BUILT_IN_FEEDBACK_WORDS[code as 'en'] ?? BUILT_IN_FEEDBACK_WORDS[primary as 'en'];
  const own = overrides?.[language ?? ''] ?? overrides?.[code] ?? overrides?.[primary];

  const words: FeedbackWords = { ...BUILT_IN_FEEDBACK_WORDS.en, ...builtIn };
  for (const [name, value] of Object.entries(own ?? {})) {
    if (typeof value === 'string' && value !== '') {
      words[name as keyof FeedbackWords] = value;
    }
  }
  let translated = false;
  if (translate) {
    for (const name of FEEDBACK_WORD_NAMES) {
      const value = translate(feedbackKey(name));
      // A bundle without the key answers the key itself, or nothing.
      if (typeof value === 'string' && value !== '' && value !== feedbackKey(name)) {
        words[name] = value;
        translated = true;
      }
    }
  }

  return { lang: builtIn || own || translated ? code : 'en', words };
}
