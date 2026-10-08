import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, effect, input, output, viewChildren } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/** One choice of a segmented control. */
export interface SegmentedOption {
  value: string;
  /** Its name: the words on it, or - with `iconsOnly` - its accessible name and tooltip. */
  label: string;
  /** An icon before the words (or instead of them, with `iconsOnly`). */
  icon?: string;
  /** A tooltip, where the name alone says too little ("As your device is set"). */
  hint?: string;
  /**
   * Its accessible name, where the words shown are short (a code: "SK"): it
   * must hold them ("Slovenčina (SK)"), so a person who says what they see
   * finds it (WCAG 2.5.3).
   */
  name?: string;
  /** The language of the label, where it is not the page's ("Slovenčina" on an English page). */
  lang?: string | null;
}

/**
 * One choice out of a few, side by side: light | dark | auto, EN | SK.
 *
 * A radio group underneath (role="radiogroup" of role="radio" buttons): one
 * Tab stop - the chosen segment, or the first when none is - and the arrow
 * keys move the choice, and the focus with it once the choice is made.
 *
 * `value` is what the page says is chosen; a choice is asked for with
 * `valueChange` (`[(value)]` binds both). A page that refuses or delays a
 * choice (a language whose words have not come) simply does not change
 * `value`: the control keeps showing - and the focus stays on - what is true.
 */
@Component({
  selector: 'anotoki-segmented',
  imports: [IconComponent],
  templateUrl: './segmented.component.html',
  styleUrl: './segmented.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-segmented', '[attr.data-size]': 'size()' },
})
export class SegmentedComponent {
  /** The group's name. */
  readonly label = input.required<string>();
  readonly options = input.required<readonly SegmentedOption[]>();
  readonly value = input<string | null>(null);
  readonly valueChange = output<string>();
  /** Icons alone, each named by its label (aria-label and tooltip). */
  readonly iconsOnly = input(false, { transform: booleanAttribute });
  readonly size = input<'sm' | 'md'>('md');
  /** A choice is on its way (aria-busy). */
  readonly busy = input(false, { transform: booleanAttribute });

  /** The segment a Tab lands on: the chosen one, or the first while none is (a group nobody can Tab into is out of a keyboard's reach). */
  protected readonly focusable = computed(() => {
    const value = this.value();
    const options = this.options();
    return options.some((option) => option.value === value) ? value : (options[0]?.value ?? null);
  });

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('segment');
  /** A choice made from the keyboard: the focus follows it once it is made. */
  private followFocus: string | null = null;

  constructor() {
    effect(() => {
      const value = this.value();
      const buttons = this.buttons();
      if (this.followFocus !== null && this.followFocus === value) {
        this.followFocus = null;
        const index = this.options().findIndex((option) => option.value === value);
        buttons[index]?.nativeElement.focus();
      }
    });
  }

  protected choose(value: string): void {
    this.valueChange.emit(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    const options = this.options();
    if (!step || !options.length) {
      return;
    }
    event.preventDefault();
    const index = options.findIndex((option) => option.value === this.value());
    // From a value that is not among the options, the first arrow lands on the first or the last.
    const next = index < 0 ? (step > 0 ? 0 : options.length - 1) : (index + step + options.length) % options.length;
    this.followFocus = options[next].value;
    this.choose(options[next].value);
  }
}
