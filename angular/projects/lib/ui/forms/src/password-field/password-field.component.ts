import { ChangeDetectionStrategy, Component, ElementRef, input, model, signal, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui';
import { FieldBase } from '../field-base';

/**
 * A password input with a show / hide button.
 *
 * `autocomplete` is required rather than defaulted: `current-password` and
 * `new-password` tell a password manager whether to fill a saved password or
 * offer to make one, and a form that gets it wrong teaches people to stop
 * trusting their manager. The show button is a real button with aria-pressed,
 * in the tab order: some people need to check what they typed. Each field
 * starts hidden. Content marked `labelAside` ("Forgot your password?") stands
 * beside the label - not inside it, where it would be part of the field's name.
 */
@Component({
  selector: 'anotoki-password-field',
  imports: [IconComponent],
  templateUrl: './password-field.component.html',
  styleUrl: './password-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-password-field' },
})
export class PasswordFieldComponent extends FieldBase {
  readonly value = model<string>('');
  readonly autocomplete = input.required<'current-password' | 'new-password' | 'off'>();
  readonly maxlength = input<number | null>(null);

  protected readonly visible = signal(false);
  protected readonly control = viewChild<ElementRef<HTMLInputElement>>('control');

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
