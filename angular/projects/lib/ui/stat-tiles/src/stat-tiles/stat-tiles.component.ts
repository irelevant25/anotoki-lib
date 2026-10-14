import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A grid of figures in tiles - Stats' known notes, accuracy, streak; the end of a round - as many to a row as fit,
 * each at least `min` wide (one a row on the narrowest phone): `<anotoki-stat-tiles><anotoki-stat-tile …/></anotoki-stat-tiles>`.
 * A list (role="list") of its tiles, so a screen reader says how many there are.
 */
@Component({
  selector: 'anotoki-stat-tiles',
  templateUrl: './stat-tiles.component.html',
  styleUrl: './stat-tiles.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-stat-tiles', role: 'list', '[style.--_stat-tiles-min]': 'min()' },
})
export class StatTilesComponent {
  /** The narrowest a tile gets before a row holds one fewer: a CSS length. */
  readonly min = input('9rem');
}
