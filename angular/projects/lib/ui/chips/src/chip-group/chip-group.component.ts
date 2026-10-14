import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, effect, inject, input, model, viewChildren } from '@angular/core';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { uniqueId } from '@anotoki/lib/ui/dom';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { ChipComponent } from '../chip/chip.component';

/** One choice of a chip group. */
export interface ChipOption {
  value: string;
  /** Its words. */
  label: string;
  /** The words' language, where it is not the page's (a stage's English name on a Slovak page): a `lang` on them. */
  lang?: string | null;
  /** Shown, and not to be chosen (nothing to practise there). */
  disabled?: boolean;
  /** Its accessible name, where the words shown are short (a code): it must hold them, so a person who says what they see finds it (WCAG 2.5.3). */
  name?: string;
  /** Quieter words after the label: a count ("12"), "new". */
  note?: string | number | null;
  /** One of the kit's icons (or a registered one) before the words. */
  icon?: string;
}

/**
 * Choice chips - a row of small round-ended buttons that wraps onto lines, one of them chosen or several: the
 * lessons to practise, the elements to filter by, the kind of question.
 *
 * One at a time (the default) is a radio group underneath (role="radiogroup" of role="radio" chips, aria-checked): one
 * Tab stop - the chosen chip, or the first that can be chosen while none is - and the arrow keys, Home and End move
 * the choice, the focus with it, over the chips that cannot be chosen. `multiple` makes every chip a toggle
 * (aria-pressed) in a named group, each its own Tab stop. Either way the chosen ones show a check before their words.
 *
 * A field of the kit's: its label over the chips (a real name for the group, aria-labelledby), `hint` and `error` under
 * them, tied by aria-describedby - the error a role="alert", aria-invalid on a radio group -, `required`, `optional`,
 * `disabled`, `hideLabel`. The value is a signal both ways: `[(value)]` (one: the chosen value, or null), `[(values)]`
 * (several, in the options' order).
 */
@Component({
  selector: 'anotoki-chip-group',
  imports: [ChipComponent, IconComponent],
  templateUrl: './chip-group.component.html',
  styleUrl: './chip-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-chip-group', '[class.anotoki-chip-group--multiple]': 'multiple()' },
})
export class ChipGroupComponent {
  protected readonly words = inject(AnotokiWords);

  /** The group's name, shown over it. */
  readonly label = input.required<string>();
  readonly options = input.required<readonly ChipOption[]>();
  /** Several at once, each chip a toggle (aria-pressed); one at a time otherwise (a radio group). */
  readonly multiple = input(false, { transform: booleanAttribute });
  /** The chosen value, one at a time; null while none is. */
  readonly value = model<string | null>(null);
  /** The chosen values, with `multiple`, in the options' order. */
  readonly values = model<readonly string[]>([]);
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  /** Wrong, with the words elsewhere: aria-invalid (a radio group) and no message of its own. */
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  /** Says "optional" after the label. */
  readonly optional = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  /** The label for screen readers alone. */
  readonly hideLabel = input(false, { transform: booleanAttribute });

  private readonly id = uniqueId('anotoki-chip-group');
  protected readonly labelId = `${this.id}-label`;
  protected readonly hintId = `${this.id}-hint`;
  protected readonly errorId = `${this.id}-error`;
  protected readonly describedBy = computed(() => (this.error() ? this.errorId : this.hint() ? this.hintId : null));
  protected readonly isInvalid = computed(() => this.invalid() || !!this.error());

  /** One at a time: the chip a Tab lands on - the chosen one, or the first that can be chosen while none is. */
  protected readonly focusable = computed(() => {
    const value = this.value();
    const open = this.options().filter((option) => !option.disabled);
    return open.some((option) => option.value === value) ? value : (open[0]?.value ?? null);
  });

  private readonly chips = viewChildren(ChipComponent, { read: ElementRef });
  /** A choice made from the keyboard: the focus follows it once it is drawn. */
  private followFocus: string | null = null;

  constructor() {
    effect(() => {
      const value = this.value();
      const chips = this.chips();
      if (this.followFocus !== null && this.followFocus === value) {
        this.followFocus = null;
        const index = this.options().findIndex((option) => option.value === value);
        (chips[index]?.nativeElement as HTMLElement | undefined)?.focus();
      }
    });
  }

  protected chosen(option: ChipOption): boolean {
    return this.multiple() ? this.values().includes(option.value) : this.value() === option.value;
  }

  protected press(option: ChipOption): void {
    if (this.disabled() || option.disabled) {
      return;
    }
    if (!this.multiple()) {
      this.value.set(option.value);
      return;
    }
    const values = this.values();
    const next = values.includes(option.value) ? values.filter((value) => value !== option.value) : [...values, option.value];
    // In the options' order - a value they do not have (yet) after theirs - whatever order they were pressed in.
    const order = this.options().map((each) => each.value);
    const rank = (value: string) => (order.includes(value) ? order.indexOf(value) : order.length);
    this.values.set(next.sort((a, b) => rank(a) - rank(b)));
  }

  /** One at a time: the arrows move the choice round (Home, End to the ends), over the chips that cannot be chosen. */
  protected onKeydown(event: KeyboardEvent): void {
    if (this.multiple() || this.disabled()) {
      return;
    }
    const options = this.options();
    let index = options.findIndex((option) => option.value === this.value());
    let step: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        step = 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        step = -1;
        index = index < 0 ? options.length : index;
        break;
      case 'Home':
        step = 1;
        index = -1;
        break;
      case 'End':
        step = -1;
        index = options.length;
        break;
      default:
        return;
    }
    event.preventDefault();
    for (let tries = 0; tries < options.length; tries++) {
      index = (index + step + options.length) % options.length;
      if (!options[index].disabled) {
        this.followFocus = options[index].value;
        this.value.set(options[index].value);
        return;
      }
    }
  }
}
