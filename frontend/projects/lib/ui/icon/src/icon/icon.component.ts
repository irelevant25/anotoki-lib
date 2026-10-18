import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AnotokiIcons } from '../icons';

/**
 * One icon, by name: one of the kit's own (sun, moon, menu, x, check, ...) or
 * one the site registered (provideAnotokiUi's `icons`).
 *
 * Decorative unless a `label` is given: an icon next to a word says nothing
 * the word does not, and a screen reader reading "check" before "Confirmed"
 * is noise. An icon on its own (an icon-only button) gets its name from the
 * button's aria-label instead, so it stays hidden there too.
 */
@Component({
  selector: 'anotoki-icon',
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-icon' },
})
export class IconComponent {
  private readonly icons = inject(AnotokiIcons);

  readonly name = input.required<string>();
  readonly size = input<number>(18);
  readonly strokeWidth = input<number>(1.75);
  readonly filled = input<boolean>(false);
  /** What a screen reader hears for an icon that stands alone, with no word beside it and no labelled button around it. */
  readonly label = input<string | null>(null);

  protected readonly paths = computed(() => this.icons.get(this.name()) ?? []);
}
