import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input, output } from '@angular/core';
import { AnotokiWords, ButtonComponent, IconComponent } from '@anotoki/lib/ui';

/**
 * "51-100 of 230", with Previous and Next - in the page's language (an admin
 * panel's English where the site says so). The range is a polite live region:
 * a screen reader hears where it is after a move.
 */
@Component({
  selector: 'anotoki-pagination',
  imports: [ButtonComponent, IconComponent],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-pagination' },
})
export class PaginationComponent {
  protected readonly words = inject(AnotokiWords);

  /** The page shown, from 1. */
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  /** A page is on its way: neither button can be pressed. */
  readonly busy = input(false, { transform: booleanAttribute });

  readonly pageChange = output<number>();

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / Math.max(1, this.pageSize()))));
  protected readonly first = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly last = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  protected readonly range = computed(() => (this.total() === 0 ? this.words.t('ui.nothingToShow') : this.words.t('ui.range', { first: this.first(), last: this.last(), total: this.total() })));
}
