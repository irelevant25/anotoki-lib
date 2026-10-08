import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, output, signal, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui';
import { FieldBase } from '../field-base';

/**
 * A short numeric code (six digits by default), drawn as boxes and typed into
 * one real input.
 *
 * One input rather than six is what makes the rest work: pasting "123 456"
 * from a mail, the phone offering the code from a text message
 * (autocomplete="one-time-code"), a password manager filling it, and a screen
 * reader hearing one field with one label. The input lies over the boxes,
 * transparent; the boxes only draw what it holds. Anything but digits is
 * dropped as it arrives, so a paste with spaces or a dash lands whole.
 * `complete` fires when the last digit is in, for a page that submits then.
 */
@Component({
  selector: 'anotoki-code-input',
  imports: [IconComponent],
  templateUrl: './code-input.component.html',
  styleUrl: './code-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-code-input', '[style.--_code-cells]': 'length()' },
})
export class CodeInputComponent extends FieldBase {
  readonly value = model<string>('');
  readonly length = input(6);

  /** The last digit is in. */
  readonly complete = output<string>();

  protected readonly focused = signal(false);
  protected readonly cells = computed(() => Array.from({ length: this.length() }, (_, index) => this.value()[index] ?? ''));
  protected readonly activeIndex = computed(() => Math.min(this.value().length, this.length() - 1));
  protected readonly control = viewChild<ElementRef<HTMLInputElement>>('control');

  protected onFocus(): void {
    this.focused.set(true);
    // The caret always sits after the last digit: the boxes have no way to show one in the middle.
    const element = this.control()?.nativeElement;
    if (element) {
      const end = element.value.length;
      queueMicrotask(() => element.setSelectionRange(end, end));
    }
  }

  protected onInput(event: Event): void {
    const element = event.target as HTMLInputElement;
    const digits = element.value.replace(/\D/g, '').slice(0, this.length());
    if (element.value !== digits) {
      element.value = digits;
    }
    const wasComplete = this.value().length === this.length();
    this.value.set(digits);
    if (digits.length === this.length() && !wasComplete) {
      this.complete.emit(digits);
    }
  }
}
