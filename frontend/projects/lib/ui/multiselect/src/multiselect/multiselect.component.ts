import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  Injector,
  input,
  model,
  numberAttribute,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { FieldBase } from '@anotoki/lib/ui/field';
import { CheckboxComponent } from '@anotoki/lib/ui/forms';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { PopoverComponent, PopoverTriggerDirective } from '@anotoki/lib/ui/menu';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { MULTISELECT_LIBRARY_WORDS } from '@anotoki/lib/words/multiselect';

/** One choice of a multiselect: its value (a text, a number - a page's key), its name, and whether it can be chosen. */
export interface MultiselectOption<T = string> {
  readonly value: T;
  readonly label: string;
  /** Shown, and not to be chosen. */
  readonly disabled?: boolean;
  /** The name's language, where it is not the page's. */
  readonly lang?: string | null;
}

/**
 * Several things chosen out of a list - a filter of an admin list, a character's roles:
 * `<anotoki-multiselect label="Elements" [options]="elements" [(values)]="chosen" placeholder="Any" />`.
 *
 * A compact button drawn as the kit's select is - it lines up with selects in a filter bar (`inline` the bar's height)
 * - that says what is chosen: the first names (`maxShown`, 3) and how many more ("Furina, Neuvillette and 3 more", the
 * library's `anotoki.multiselect.more`), a count beside them; nothing chosen, the page's `placeholder` ("Any") or the
 * library's "None chosen". It opens the kit's popover (Escape, the focus leaving and a click outside put it away; the
 * focus moves into it), a group named by the label holding the kit's checkboxes, one a choice (an option that cannot
 * be chosen shown and passed over), and Clear, which unticks them all. The button is named by the label and what it
 * says ("Elements, Hydro, Pyro"), its state aria-expanded.
 *
 * **The values are the options' `value`s**, in the options' order - a text or a number, as the page keys them
 * (genshin's rarities) - and an empty list for none. A field of the kit's: its label, hint and error (tied to the
 * button), invalid, required (the page's to check), optional, disabled, hideLabel, autofocus, focus(); `blurred` when
 * the focus leaves the button.
 */
@Component({
  selector: 'anotoki-multiselect',
  imports: [ButtonComponent, CheckboxComponent, IconComponent, PopoverComponent, PopoverTriggerDirective],
  templateUrl: './multiselect.component.html',
  styleUrl: './multiselect.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-multiselect', '[class.anotoki-multiselect--inline]': 'inline()' },
})
export class MultiselectComponent<T = string> extends FieldBase {
  protected readonly word = pieceWords(MULTISELECT_LIBRARY_WORDS);
  private readonly injector = inject(Injector);

  /** The choices, in the order they are listed. */
  readonly options = input.required<readonly MultiselectOption<T>[]>();
  /** The chosen ones' values, in the options' order; empty for none. */
  readonly values = model<readonly T[]>([]);
  /** What the button says while nothing is chosen ("Any"); the library's "None chosen" without it. */
  readonly placeholder = input<string | null>(null);
  /** How many chosen names the button shows before "and 3 more". */
  readonly maxShown = input(3, { transform: numberAttribute });
  /** The compact height of a filter bar. */
  readonly inline = input(false, { transform: booleanAttribute });

  /** The focus left the button (a form's "touched"). */
  readonly blurred = output<void>();

  protected readonly control = viewChild<ElementRef<HTMLButtonElement>>('control');
  private readonly checkboxes = viewChildren(CheckboxComponent);

  protected readonly labelId = `${this.inputId}-label`;
  protected readonly valueId = `${this.inputId}-value`;

  /** The chosen options, in the options' order. */
  protected readonly chosen = computed(() => {
    const values = this.values();
    return this.options().filter((option) => values.includes(option.value));
  });

  /** What the button says: the first names, and how many more; or what it says of none. */
  protected readonly shown = computed(() => {
    const chosen = this.chosen();
    if (chosen.length === 0) {
      return this.placeholder() || this.word('anotoki.multiselect.noneChosen').text;
    }
    const most = Math.max(1, this.maxShown());
    const names = chosen
      .slice(0, most)
      .map((option) => option.label)
      .join(', ');
    return chosen.length > most ? `${names} ${this.word('anotoki.multiselect.more', { count: chosen.length - most }).text}` : names;
  });

  protected isChosen(option: MultiselectOption<T>): boolean {
    return this.values().includes(option.value);
  }

  /** One checkbox changed: the values are the chosen ones, in the options' order. */
  protected toggle(option: MultiselectOption<T>, checked: boolean): void {
    if (this.disabled() || option.disabled) {
      return;
    }
    const values = this.values();
    this.values.set(
      this.options()
        .filter((each) => (each === option ? checked : values.includes(each.value)))
        .map((each) => each.value),
    );
  }

  /** Every checkbox unticked; the focus on the first, as Clear goes away. */
  protected clear(): void {
    this.values.set([]);
    afterNextRender(
      () =>
        this.checkboxes()
          .find((_, index) => !this.options()[index]?.disabled)
          ?.focus(),
      { injector: this.injector },
    );
  }
}
