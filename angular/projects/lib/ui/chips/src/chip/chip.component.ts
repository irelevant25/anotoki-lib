import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';

/** A chip's colour: what its state is, said in words beside it or by its name too - never by the colour alone. */
export type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

/**
 * A chip: a small round-ended button - a step of a path in its state (passed `success`, open `primary`, locked
 * `disabled`), a filter that is on or off (`pressed`), one choice of a row (what <anotoki-chip-group> draws, with
 * `checked` on a `role="radio"`): `<button anotokiChip tone="success">Step 2</button>`.
 *
 * An attribute component on a real `<button>`, as the kit's button is: the element keeps what the browser gives it
 * (the keyboard, the focus, the click), and `type="button"`, so a chip in a form never submits it. `pressed` says
 * aria-pressed, `checked` aria-checked; either, when true, draws the chip as chosen - its ground and edge, and a check
 * before its words, so the state is never told by colour alone.
 *
 * 32 px high, and 44 px where the pointer is a finger (`pointer: coarse`); its words wrap rather than run out of a
 * narrow screen.
 */
@Component({
  selector: 'button[anotokiChip]',
  imports: [IconComponent],
  templateUrl: './chip.component.html',
  styleUrl: './chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-chip',
    type: 'button',
    '[attr.data-tone]': 'tone()',
    '[class.anotoki-chip--on]': 'pressed() || checked()',
    '[attr.aria-pressed]': 'pressed() === null ? null : pressed() ? "true" : "false"',
    '[attr.aria-checked]': 'checked() === null ? null : checked() ? "true" : "false"',
    '[attr.disabled]': 'disabled() ? "" : null',
  },
})
export class ChipComponent {
  readonly tone = input<ChipTone>('neutral');
  /** A toggle: aria-pressed, and the chosen look while true. null (the default): not a toggle. */
  readonly pressed = input<boolean | null>(null);
  /** One choice of a radio group (the page gives the chip role="radio"): aria-checked, and the chosen look while true. */
  readonly checked = input<boolean | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
}
