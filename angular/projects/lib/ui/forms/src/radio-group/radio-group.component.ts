import { ChangeDetectionStrategy, Component, booleanAttribute, input, model } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui';

export interface RadioOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * One choice out of a few, each explained: a `<fieldset>` of native radios
 * drawn as cards - the arrow keys move the choice and a screen reader says
 * "2 of 3" without any help; the whole card is the label.
 */
@Component({
  selector: 'anotoki-radio-group',
  templateUrl: './radio-group.component.html',
  styleUrl: './radio-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-radio-group' },
})
export class RadioGroupComponent {
  readonly label = input.required<string>();
  readonly options = input.required<readonly RadioOption[]>();
  readonly value = model<string>('');
  readonly disabled = input(false, { transform: booleanAttribute });

  protected readonly name = uniqueId('anotoki-radio');
}
