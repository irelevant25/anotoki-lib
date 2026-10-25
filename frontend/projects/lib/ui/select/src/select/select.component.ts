import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, input, model, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { FieldBase } from '@anotoki/lib/ui/field';

/** One choice of a select: its value - a text by default; a number, a boolean, a page's key (0.11.0) - and its words. */
export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** The label's language, where it is not the page's. */
  lang?: string | null;
}

/**
 * A labelled native `<select>`.
 *
 * Native on purpose: on a phone it opens the platform's own picker, better
 * than anything drawn in the page, and it is accessible without a line of
 * ARIA. The value is the chosen option's `value`, of the options' own type
 * (0.11.0: a number - genshin's rarities -, a boolean, a text; texts before):
 * `[options]="rarities" [(value)]="rarity" [none]="null" placeholder="Any"`.
 * The placeholder's option is `none` - '' by default, a text's "none".
 */
@Component({
  selector: 'anotoki-select',
  imports: [IconComponent],
  templateUrl: './select.component.html',
  styleUrl: './select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-select', '[class.anotoki-select--inline]': 'inline()' },
})
export class SelectComponent<T = string> extends FieldBase {
  readonly value = model<T>('' as T);
  readonly options = input.required<readonly SelectOption<T>[]>();
  /** A first, empty option ("Any", "Choose…"); null for none. */
  readonly placeholder = input<string | null>(null);
  /** The value the placeholder's option stands for: '' unless the page says otherwise - null for a number's "none" (0.11.0). */
  readonly none = input<T>('' as T);
  /** The compact height of a filter bar. */
  readonly inline = input(false, { transform: booleanAttribute });

  protected readonly control = viewChild<ElementRef<HTMLSelectElement>>('control');

  protected onChange(event: Event): void {
    // The option chosen, by its value written as the page has it: the option's own value, of its own type.
    const written = (event.target as HTMLSelectElement).value;
    const option = this.options().find((each) => String(each.value) === written);
    this.value.set(option ? option.value : this.none());
  }
}
