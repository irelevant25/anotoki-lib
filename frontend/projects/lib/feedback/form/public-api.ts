/*
 * @anotoki/lib/feedback/form - <anotoki-feedback-form>, the form a site's visitors
 * send it a message with, and <anotoki-feedback-dialog> (0.8.0), the form in the
 * kit's dialog with its buttons in the dialog's footer - as the family's footer and
 * the Contact page open it. An entry point of its own (it draws the kit's fields),
 * loaded where it is shown - best when the person opens it, so no first load
 * carries it:
 *
 *   const { FeedbackDialogComponent } = await import('@anotoki/lib/feedback/form');
 *
 * What the person typed is kept while the page lives (the form's draft, in memory
 * alone): a form drawn again shows it, until the message is sent or Clear empties it.
 * Its configuration and words are @anotoki/lib/feedback's (provideAnotokiFeedback).
 */

export { FeedbackFormComponent } from './src/feedback-form/feedback-form.component';
export { FeedbackDialogComponent } from './src/feedback-dialog/feedback-dialog.component';
