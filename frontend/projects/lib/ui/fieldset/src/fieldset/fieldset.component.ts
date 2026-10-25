import { ChangeDetectionStrategy, Component, booleanAttribute, input, numberAttribute } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui/dom';

/**
 * Fields that belong together under one name: `<anotoki-fieldset legend="Base stats" [columns]="3">…fields…</anotoki-fieldset>`
 * (genshin's field container, for every site's forms).
 *
 * A real `<fieldset>` named by its `<legend>` - a screen reader says the name as the focus enters the group - with
 * `hint` under the name (tied to the group by aria-describedby). The fields stand in a grid of at most `columns`
 * columns (3), each at least `minWidth` wide (15rem, as the styles' `.form-grid`): fewer where the page is narrower,
 * one under another on a phone. A quiet box round them (the surface's second ground, the decorative edge), or none
 * with `plain` - the name then a label of the fields'. `hideLegend` keeps the name for screen readers alone; a plain
 * grid with no name at all is the styles' `.form-grid`, never a fieldset.
 */
@Component({
  selector: 'anotoki-fieldset',
  templateUrl: './fieldset.component.html',
  styleUrl: './fieldset.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-fieldset',
    '[class.anotoki-fieldset--plain]': 'plain()',
    '[style.--_fieldset-columns]': 'columns()',
    '[style.--_fieldset-min]': 'minWidth()',
  },
})
export class FieldsetComponent {
  /** The group's name. */
  readonly legend = input.required<string>();
  /** A quieter line under the name, tied to the group. */
  readonly hint = input<string | null>(null);
  /** At most this many columns of fields. */
  readonly columns = input(3, { transform: numberAttribute });
  /** The narrowest a field's column may be: a CSS length. */
  readonly minWidth = input('15rem');
  /** No box round the fields. */
  readonly plain = input(false, { transform: booleanAttribute });
  /** The name for screen readers alone. */
  readonly hideLegend = input(false, { transform: booleanAttribute });

  protected readonly hintId = uniqueId('anotoki-fieldset-hint');
}
