import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FeedbackFormComponent } from '@anotoki/lib/feedback/form';
import { DialogComponent } from '@anotoki/lib/ui/dialog';

/**
 * The library's feedback form in the kit's dialog (the focus kept inside it, and back where it was after), as the
 * footer opens it: named by the footer's Feedback, the form with no heading of its own, and with its Cancel and -
 * after the thanks - its Close. The form takes the site's provideAnotokiFeedback() as it is (its words, its sections,
 * the person's address).
 *
 * <anotoki-site-footer> makes it when Feedback is pressed - its code loaded then - and takes it away on `closed`.
 */
@Component({
  selector: 'anotoki-footer-feedback-dialog',
  imports: [DialogComponent, FeedbackFormComponent],
  templateUrl: './feedback-dialog.component.html',
  styleUrl: './feedback-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-footer-feedback-dialog' },
})
export class FooterFeedbackDialogComponent {
  /** The dialog's heading: the words of the footer's button. */
  readonly heading = input.required<string>();
  /** Their language, where it is not the page's ('en' on a page in a language the library has no words for). */
  readonly lang = input<string | null>(null);

  /** The dialog is done with: Escape, the backdrop, its close button, the form's Cancel, or its Close after the thanks. */
  readonly closed = output<void>();
}
