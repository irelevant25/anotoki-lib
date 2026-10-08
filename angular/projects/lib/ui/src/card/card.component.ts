import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

/**
 * A card: a surface with an optional heading row.
 *
 * Content marked `cardActions` sits at the right of the heading (under it on a
 * phone); everything else is the body. `flush` drops the body's padding for a
 * table that should run edge to edge. The heading is an `<h2>`, or an `<h3>`
 * for a card inside a section that has its own `<h2>` (`headingLevel`).
 */
@Component({
  selector: 'anotoki-card',
  templateUrl: './card.component.html',
  styleUrl: './card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-card', '[class.is-flush]': 'flush()', '[attr.data-tone]': 'tone()' },
})
export class CardComponent {
  readonly heading = input<string | null>(null);
  readonly subheading = input<string | null>(null);
  /** The heading's id, for a section that names itself by it (aria-labelledby). */
  readonly headingId = input<string | null>(null);
  readonly headingLevel = input<2 | 3>(2);
  readonly flush = input(false, { transform: booleanAttribute });
  /** `danger` for the card of something that cannot be undone (deleting an account). */
  readonly tone = input<'danger' | null>(null);
}
