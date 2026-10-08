import { ChangeDetectionStrategy, Component, booleanAttribute, input, model } from '@angular/core';
import { SpinnerComponent, uniqueId } from '@anotoki/lib/ui';

/**
 * An on / off switch: `<anotoki-switch [(checked)]="on">Accept password sign-in</anotoki-switch>`.
 *
 * A native checkbox with role="switch" - announced as on / off, the keyboard
 * and forms for free. For a switch that saves the moment it is flipped, the
 * page binds `checked` both ways, saves on `checkedChange`, and puts the old
 * value back when the save fails - the switch follows, its state being the
 * page's. `busy` shows the save on its way and blocks a second flip meanwhile.
 */
@Component({
  selector: 'anotoki-switch',
  imports: [SpinnerComponent],
  templateUrl: './switch.component.html',
  styleUrl: './switch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-switch' },
})
export class SwitchComponent {
  readonly checked = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly name = input('');
  readonly hint = input<string | null>(null);

  protected readonly hintId = uniqueId('anotoki-switch-hint');

  protected onChange(event: Event): void {
    this.checked.set((event.target as HTMLInputElement).checked);
  }
}
