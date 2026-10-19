import { Injectable, signal } from '@angular/core';

/**
 * What a person typed into the feedback form, kept while the page lives (the owner's rule of 2026-10-19: nothing typed
 * is lost until the message is sent or the page is loaded afresh). The form's fields are these signals, so a dialog
 * closed - Escape, a click outside it, Cancel - or a page left takes the form away, never its words: the next form
 * shows them again, the footer's and the Contact page's alike. In memory alone - never the browser's storage - so a
 * page loaded afresh starts empty. Emptied when the message is sent, and by the form's Clear.
 *
 * The robots' field is never kept: a person never types there.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackDraft {
  /** The kind chosen: '' is the site's first. */
  readonly kind = signal('');
  readonly section = signal('');
  readonly subject = signal('');
  readonly message = signal('');
  /** The address in its field: the account's, written in, until the person types their own (`emailTyped`). */
  readonly email = signal('');
  emailTyped = false;
  readonly anonymous = signal(false);
  /** The site's extra fields, by name. */
  readonly details = signal<Readonly<Record<string, string>>>({});

  /** Empty again, as a form that was never touched. */
  clear(): void {
    this.kind.set('');
    this.section.set('');
    this.subject.set('');
    this.message.set('');
    this.email.set('');
    this.emailTyped = false;
    this.anonymous.set(false);
    this.details.set({});
  }
}
