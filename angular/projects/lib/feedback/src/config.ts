import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { provideLibraryWords } from '@anotoki/lib/ui/config';
import { FEEDBACK_LIBRARY_WORDS } from '@anotoki/lib/words/feedback';
import { FeedbackWords } from './words';

/** A kind of message, as the site's server takes it (the PHP half's `kinds`), worded in the page's language. */
export interface FeedbackKind {
  value: string;
  label: string;
}

/** A place of the site a message can be about (the PHP half's `sections`): the value it keeps, and its words. */
export interface FeedbackSection {
  value: string;
  label: string;
}

/** One of the site's extra fields (the PHP half's `fields`: its name and most characters), worded in the page's language. */
export interface FeedbackField {
  name: string;
  label: string;
  hint?: string | null;
  /** The kinds it is asked for; every kind when there is no list. */
  kinds?: readonly string[];
  /** Its lines: 1 is a one-line field. Default 3. */
  rows?: number;
  /** The most characters the server takes (its `fields` value). */
  max: number;
}

/**
 * What a site tells the feedback form, through provideAnotokiFeedback(). The
 * functions run in an injection context when the factory does, and are read as
 * the form is drawn: a signal is followed (the page's language changing).
 */
export interface AnotokiFeedbackConfig {
  /** The public route: '/api/feedback' (Anotoki\Lib\Feedback\Http\FeedbackRoutes::public()). */
  endpoint?: string;
  /** The page's language: the form's words are in it ('en' and 'sk' built in), and the message is kept with it. */
  language?: () => string | null | undefined;
  /**
   * The site's own string for a library key (`anotoki.feedback.title`) - an owner's rewording in its
   * database - before its `words` and the built-in ones. With the translations module:
   * `(key) => inject(TranslationService).libraryWord(key)`.
   */
  translate?: (key: string) => string | null | undefined;
  /** Per language, words to use instead of the built-in ones. */
  words?: Readonly<Record<string, Partial<FeedbackWords>>>;
  /** The kinds the server takes, worded; default bug, idea and other, in the library's words. */
  kinds?: () => readonly FeedbackKind[];
  /** The places a message can be about; none: no such question. */
  sections?: () => readonly FeedbackSection[];
  /** The site's extra fields, by kind. */
  fields?: () => readonly FeedbackField[];
  /** The kinds whose message needs a subject (the PHP half's `subjectRequiredFor`). */
  subjectRequiredFor?: readonly string[];
  /** Somebody is signed in: "send it without my name" is offered. */
  signedIn?: () => boolean;
  /** The signed-in person's address, written in for them until they type their own. */
  email?: () => string | null | undefined;
  /** The page the message is about, as a path: `location.pathname` by default - never its query. */
  page?: () => string;
  /** The hidden field robots fill in (the PHP half's `honeypot`): 'website' by default; null for none. */
  honeypot?: string | null;
}

export const ANOTOKI_FEEDBACK_CONFIG = new InjectionToken<AnotokiFeedbackConfig>('ANOTOKI_FEEDBACK_CONFIG');

export const DEFAULT_FEEDBACK_ENDPOINT = '/api/feedback';
export const DEFAULT_HONEYPOT = 'website';

/**
 * Configures the feedback form (@anotoki/lib/feedback/form). The factory runs
 * in an injection context, so it can inject the site's own services:
 *
 * ```ts
 * provideAnotokiFeedback(() => {
 *   const i18n = inject(TranslationService), auth = inject(AnotokiAuth);
 *   return {
 *     language: () => i18n.language(),
 *     translate: (key) => i18n.libraryWord(key),
 *     sections: () => [{ value: 'Characters', label: i18n.t('nav.characters') }],
 *     signedIn: () => auth.signedIn(),
 *     email: () => auth.user()?.email ?? null,
 *   };
 * })
 * ```
 *
 * It registers the form's words (`anotoki.feedback.*`) with the translations
 * module: they reach a site's words with this module, and with nothing else.
 */
export function provideAnotokiFeedback(factory: () => AnotokiFeedbackConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_FEEDBACK_CONFIG, useFactory: factory }, provideLibraryWords(FEEDBACK_LIBRARY_WORDS)]);
}
