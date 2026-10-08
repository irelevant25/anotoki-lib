import { ChangeDetectionStrategy, Component, booleanAttribute, input, model } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui';

/**
 * A checkbox with its label as content: `<anotoki-checkbox [(checked)]="keep">Keep me signed in</anotoki-checkbox>`.
 *
 * A native checkbox, drawn the family's way, inside its own `<label>`: the
 * whole line is the click target, Space toggles it, and a screen reader hears
 * one control with one name. `hint` is a quieter line under the label, tied to
 * the checkbox by aria-describedby.
 */
@Component({
  selector: 'anotoki-checkbox',
  templateUrl: './checkbox.component.html',
  styleUrl: './checkbox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-checkbox' },
})
export class CheckboxComponent {
  readonly checked = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly name = input('');
  readonly hint = input<string | null>(null);

  protected readonly hintId = uniqueId('anotoki-checkbox-hint');

  protected onChange(event: Event): void {
    this.checked.set((event.target as HTMLInputElement).checked);
  }
}
