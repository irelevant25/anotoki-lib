import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FeedbackDialogComponent, FeedbackFormComponent } from '@anotoki/lib/feedback/form';
import { TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { ToastService } from '@anotoki/lib/ui/toast';
import { feedbackWords } from '@anotoki/lib/feedback';

/**
 * The visitors' feedback form, as a site places it - on a page of its own, and
 * in the dialog its footer opens (<anotoki-feedback-dialog>, 0.8.0: its buttons
 * in the dialog's footer) - in the page's language (?lang=sk), against the
 * showcase's imagined server: a message saying "too many" is refused as a sender
 * over the limit, one saying "offline" as a site that takes none now. Both are
 * the page's one draft: what is typed in one is in the other.
 */
@Component({
  selector: 'show-feedback-demo',
  imports: [ButtonComponent, CardComponent, FeedbackDialogComponent, FeedbackFormComponent],
  templateUrl: './feedback-demo.component.html',
  styleUrl: './feedback-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackDemoComponent {
  private readonly i18n = inject(TranslationService);
  private readonly toasts = inject(ToastService);
  protected readonly open = signal(false);

  protected title(): string {
    return feedbackWords(this.i18n.language(), undefined, (key) => this.i18n.libraryWord(key)).words.title;
  }

  protected thanked(): void {
    this.toasts.success(feedbackWords(this.i18n.language()).words.thanks);
  }
}
