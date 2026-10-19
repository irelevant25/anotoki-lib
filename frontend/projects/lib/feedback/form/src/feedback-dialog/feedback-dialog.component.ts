import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { FeedbackFormComponent } from '../feedback-form/feedback-form.component';

/**
 * The feedback form in the kit's dialog, as the family's footer and the Contact page open it (0.8.0): named by the
 * button that opened it, the form with no heading of its own. Its buttons - Clear at the left, Cancel and Send at
 * the right; Send another and Close after the thanks - are the dialog's own footer, always in view: only the form
 * scrolls when it is taller than the window. Closing it (Escape, a click outside it, its close button, Cancel)
 * loses nothing typed: the form's draft is the page's, and the next dialog shows it.
 *
 * A site that opens the form itself does the same with `<anotoki-feedback-dialog [heading]="..." (closed)="...">`,
 * loaded with the press that opens it (`await import('@anotoki/lib/feedback/form')`); the form takes the site's
 * provideAnotokiFeedback() as it is (its words, its sections, the person's address).
 */
@Component({
  selector: 'anotoki-feedback-dialog',
  imports: [DialogComponent, FeedbackFormComponent, NgTemplateOutlet],
  templateUrl: './feedback-dialog.component.html',
  styleUrl: './feedback-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-feedback-dialog' },
})
export class FeedbackDialogComponent {
  /** The dialog's heading: the words of the button that opened it ("Feedback", "Send feedback"). */
  readonly heading = input.required<string>();
  /** Their language, where it is not the page's ('en' on a page in a language the library has no words for). */
  readonly lang = input<string | null>(null);

  /** The dialog is done with: Escape, the backdrop, its close button, the form's Cancel, or its Close after the thanks. */
  readonly closed = output<void>();
}
