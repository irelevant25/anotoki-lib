import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui/dom';

/**
 * A label drawn as the kit's fields draw theirs, tied to a control that is no field of the kit's:
 *
 * - a group of controls - a row of the page's buttons, toggles of its own -: the words name the group (role="group",
 *   aria-labelledby), and each control is heard with them ("Lessons, group");
 * - one native control of the page's (`for`, its id): the words are its real `<label>`;
 * - a control that names itself with the same words (`selfNamed`) - the kit's segmented control, named by its `label` -:
 *   the words are shown, and kept from screen readers, said once rather than twice.
 *
 * Stacked (the label over the control, at the fields' gap; the control as tall as a field, its content on the middle, so
 * a segmented control lines up with the selects beside it) or `inline` (the label before it). `hint` is a quieter line
 * under it, the group's description; for the other two the page ties it to its control itself (`hintId`, through the
 * `anotokiLabelledGroup` reference).
 */
@Component({
  selector: 'anotoki-labelled-group',
  exportAs: 'anotokiLabelledGroup',
  templateUrl: './labelled-group.component.html',
  styleUrl: './labelled-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-labelled-group',
    '[class.anotoki-labelled-group--inline]': 'inline()',
    '[attr.role]': 'namesTheGroup() ? "group" : null',
    '[attr.aria-labelledby]': 'namesTheGroup() ? labelId : null',
    '[attr.aria-describedby]': 'namesTheGroup() && hint() ? hintId : null',
  },
})
export class LabelledGroupComponent {
  /** The words: the group's or the control's name, as the page shows it. */
  readonly label = input.required<string>();
  /** The id of the one native control inside (an `<input>`, `<select>` or `<textarea>` of the page's): the words are its label. */
  readonly for = input<string | null>(null);
  /** The control inside is named by the same words itself: the words are shown, and not said a second time. */
  readonly selfNamed = input(false, { transform: booleanAttribute });
  /** A quieter line under the control. */
  readonly hint = input<string | null>(null);
  /** The label before the control, on its line, not over it. */
  readonly inline = input(false, { transform: booleanAttribute });

  private readonly id = uniqueId('anotoki-labelled-group');
  /** The label's id. */
  readonly labelId = `${this.id}-label`;
  /** The hint's id, for a control the page ties it to (`for`, `selfNamed`): `[attr.aria-describedby]="group.hintId"`. */
  readonly hintId = `${this.id}-hint`;

  protected readonly namesTheGroup = computed(() => !this.for() && !this.selfNamed());
}
