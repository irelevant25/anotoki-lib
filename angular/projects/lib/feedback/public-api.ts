/*
 * @anotoki/lib/feedback - the visitors' feedback form's configuration
 * (provideAnotokiFeedback, which registers its words, `anotoki.feedback.*`, with
 * the translations module) and its words (feedbackWords). Small, so a site
 * provides it with the rest of its app; the form itself is
 * @anotoki/lib/feedback/form, loaded where it is shown - best when the person
 * opens it:
 *
 *   const { FeedbackFormComponent } = await import('@anotoki/lib/feedback/form');
 *
 * The administrators read what came on @anotoki/lib/admin/feedback. The
 * server's half: Anotoki\Lib\Feedback\Http\FeedbackRoutes::public().
 */

export type { AnotokiFeedbackConfig, FeedbackField, FeedbackKind, FeedbackSection } from './src/config';
export { ANOTOKI_FEEDBACK_CONFIG, DEFAULT_FEEDBACK_ENDPOINT, DEFAULT_HONEYPOT, provideAnotokiFeedback } from './src/config';
export type { FeedbackWords } from './src/words';
export { BUILT_IN_FEEDBACK_WORDS, FEEDBACK_WORD_NAMES, feedbackKey, feedbackWords } from './src/words';
