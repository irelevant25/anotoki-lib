import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, input, model, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui';
import { FieldBase } from '../field-base';

export interface SelectOption {
  value: string;
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
 * ARIA. Values are strings; a page that wants a number converts it.
 */
@Component({
  selector: 'anotoki-select',
  imports: [IconComponent],
  templateUrl: './select.component.html',
  styleUrl: './select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-select', '[class.is-inline]': 'inline()' },
})
export class SelectComponent extends FieldBase {
  readonly value = model<string>('');
  readonly options = input.required<readonly SelectOption[]>();
  /** A first, empty option ("Any", "Choose…"); null for none. */
  readonly placeholder = input<string | null>(null);
  /** The compact height of a filter bar. */
  readonly inline = input(false, { transform: booleanAttribute });

  protected readonly control = viewChild<ElementRef<HTMLSelectElement>>('control');

  protected onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
