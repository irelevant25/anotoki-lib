import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { StatTilesComponent } from '../stat-tiles/stat-tiles.component';

/**
 * One figure: a number, what it counts under it, and a quieter note under that ("since 6 Oct") -
 * `<anotoki-stat-tile label="Known notes" value="12/40" />`. A number given as a number is written the page's way
 * (`1 234` in Slovak, `1,234` in English); a string is shown as it is ("87 %", "12/40", "—"). In a grid of tiles
 * (<anotoki-stat-tiles>) it is one of its list's items, read number first - "12/40 Known notes".
 */
@Component({
  selector: 'anotoki-stat-tile',
  templateUrl: './stat-tile.component.html',
  styleUrl: './stat-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-stat-tile', '[attr.role]': 'inGrid ? "listitem" : null' },
})
export class StatTileComponent {
  private readonly words = inject(AnotokiWords);
  protected readonly inGrid = inject(StatTilesComponent, { optional: true }) !== null;

  /** What the number counts. */
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  /** A quieter line under the label. */
  readonly note = input<string | null>(null);

  protected readonly shown = computed(() => {
    const value = this.value();
    if (typeof value !== 'number') {
      return value;
    }
    try {
      return new Intl.NumberFormat(this.words.language()).format(value);
    } catch {
      return String(value);
    }
  });
}
