import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, booleanAttribute, computed, inject, input, signal } from '@angular/core';
import { AnotokiWords, ButtonComponent, ButtonSize, ButtonVariant, IconComponent } from '@anotoki/lib/ui';
import { ToastService } from '@anotoki/lib/ui/toast';
import { copyText } from '../copy-text';

/**
 * Copies a value, then says so for two seconds - on the button, and to a
 * screen reader through a polite live region beside it. When copying does not
 * work, a toast tells the person to copy by hand (the site's
 * <anotoki-toast-host /> draws it).
 */
@Component({
  selector: 'anotoki-copy-button',
  imports: [ButtonComponent, IconComponent],
  templateUrl: './copy-button.component.html',
  styleUrl: './copy-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-copy-button' },
})
export class CopyButtonComponent {
  protected readonly words = inject(AnotokiWords);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);

  readonly text = input.required<string>();
  /** The button's words; the kit's "Copy" ("Copy to clipboard" as the name of an icon-only one) by default. */
  readonly label = input<string | null>(null);
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('sm');
  readonly iconOnly = input(false, { transform: booleanAttribute });

  protected readonly copied = signal(false);
  protected readonly name = computed(() => this.label() || this.words.t('ui.copyToClipboard'));
  protected readonly shown = computed(() => (this.copied() ? this.words.t('ui.copied') : this.label() || this.words.t('ui.copy')));

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  protected async copy(): Promise<void> {
    if (!(await copyText(this.text(), this.document))) {
      this.toasts.error(this.words.t('ui.copyFailed'));
      return;
    }
    this.copied.set(true);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.copied.set(false), 2000);
  }
}
