import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AlertComponent } from '../alert/alert.component';
import { AnotokiWords } from '../anotoki-words.service';
import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';

/**
 * A load that failed, in place of what should have been there, with a retry.
 *
 * Inline rather than a toast: the gap in the page is where the reader is
 * looking, and a retry button there is the obvious next thing to do. It is
 * announced (role="alert"): the person asked for the page.
 */
@Component({
  selector: 'anotoki-error-state',
  imports: [AlertComponent, ButtonComponent, IconComponent],
  templateUrl: './error-state.component.html',
  styleUrl: './error-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-error-state' },
})
export class ErrorStateComponent {
  private readonly words = inject(AnotokiWords);

  readonly heading = input<string | null>(null);
  readonly message = input.required<string>();
  /** The retry button's words; the kit's "Try again" by default. */
  readonly retryLabel = input<string | null>(null);
  readonly retry = output<void>();

  protected readonly label = computed(() => this.retryLabel() || this.words.t('ui.retry'));
  protected readonly lang = computed(() => (this.retryLabel() ? null : this.words.foreignLang()));
}
