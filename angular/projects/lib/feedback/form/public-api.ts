/*
 * @anotoki/lib/feedback/form - <anotoki-feedback-form>, the form a site's visitors
 * send it a message with: an entry point of its own (it draws the kit's fields),
 * loaded where it is shown - best when the person opens it, so no first load
 * carries it:
 *
 *   const { FeedbackFormComponent } = await import('@anotoki/lib/feedback/form');
 *
 * Its configuration and words are @anotoki/lib/feedback's (provideAnotokiFeedback).
 */

export { FeedbackFormComponent } from './src/feedback-form/feedback-form.component';
