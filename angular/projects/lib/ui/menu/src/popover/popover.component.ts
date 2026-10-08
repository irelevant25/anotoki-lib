import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, input, viewChild } from '@angular/core';
import { tabbable } from '@anotoki/lib/ui';
import { AnchoredPanel } from '../anchored';

/**
 * A box of controls that opens under its button and is not a menu - a
 * device's settings, a filter panel:
 *
 * ```html
 * <button anotokiButton [anotokiPopoverTrigger]="piano">Piano</button>
 * <anotoki-popover #piano label="The piano">...</anotoki-popover>
 * ```
 *
 * A disclosure: the button says aria-expanded; the box is a labelled group,
 * placed right after its button in the page, so Tab moves from the button
 * into it. Opening leaves the focus on the button (`autoFocus` moves it to the
 * box's first control); Escape closes it with the focus back on the button;
 * the focus leaving both, or a click outside, closes it.
 */
@Component({
  selector: 'anotoki-popover',
  exportAs: 'anotokiPopover',
  templateUrl: './popover.component.html',
  styleUrl: './popover.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-popover' },
})
export class PopoverComponent extends AnchoredPanel {
  /** The box's name. */
  readonly label = input.required<string>();
  /** The focus moves into the box as it opens. */
  readonly autoFocus = input(false, { transform: booleanAttribute });
  /** At least as wide as this, in rem. */
  readonly minWidth = input(14);

  protected readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected override afterOpen(panel: HTMLElement): void {
    if (this.autoFocus()) {
      (tabbable(panel)[0] ?? panel).focus();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    }
  }

  /** The focus went somewhere that is neither the box nor its button. */
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next) {
      return;
    }
    if (this.panel()?.nativeElement.contains(next) || this.trigger?.contains(next)) {
      return;
    }
    this.close(false);
  }
}
