import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, input, model, output, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui';
import { FieldBase } from '../field-base';

export type TextFieldType = 'text' | 'email' | 'url' | 'search' | 'tel' | 'number' | 'date' | 'time';

/**
 * A labelled text input: `<anotoki-text-field label="Name" [(value)]="name" />`.
 *
 * A real `<input>` with a real `<label for>`, so password managers, autofill
 * and screen readers see an ordinary field. `value` is a string whatever the
 * type - a number field's too: what a person types is text until the page
 * decides otherwise. Content marked `fieldPrefix` / `fieldSuffix` sits inside
 * the border, before or after the text (a unit, a button).
 */
@Component({
  selector: 'anotoki-text-field',
  imports: [IconComponent],
  templateUrl: './text-field.component.html',
  styleUrl: './text-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-text-field' },
})
export class TextFieldComponent extends FieldBase {
  readonly value = model<string>('');
  readonly type = input<TextFieldType>('text');
  readonly autocomplete = input('');
  readonly inputmode = input('');
  readonly placeholder = input('');
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly maxlength = input<number | null>(null);
  readonly minlength = input<number | null>(null);
  readonly min = input<number | string | null>(null);
  readonly max = input<number | string | null>(null);
  readonly pattern = input('');
  /** Off by default: addresses, usernames and codes are not prose. */
  readonly spellcheck = input<'true' | 'false'>('false');
  readonly autocapitalize = input('');

  readonly blurred = output<void>();

  protected readonly control = viewChild<ElementRef<HTMLInputElement>>('control');

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
