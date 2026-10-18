import { ChangeDetectionStrategy, Component, ElementRef, viewChild } from '@angular/core';
import { AnchoredPanel } from '@anotoki/lib/ui/menu';

/**
 * The combobox's list box, drawn under its field while open - in the top layer (ui/menu's AnchoredPanel), as wide as
 * the field, kept on the screen, closed by a click outside. The focus never goes into it: it stays in the field, the
 * active option told by aria-activedescendant - so a press in it never takes the focus either, and closing gives
 * nothing back.
 */
@Component({
  selector: 'anotoki-combobox-panel',
  templateUrl: './combobox-panel.component.html',
  styleUrl: './combobox-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-combobox-panel' },
})
export class ComboboxPanelComponent extends AnchoredPanel {
  protected readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Closes it; the focus is in the field already. */
  override close(): void {
    super.close(false);
  }

  /** As wide as the field it hangs from, then under it (or over it, where there is more room). */
  protected override place(): void {
    const panel = this.panel()?.nativeElement;
    if (panel && this.trigger) {
      panel.style.width = `${Math.round(this.trigger.getBoundingClientRect().width)}px`;
    }
    super.place();
  }
}
