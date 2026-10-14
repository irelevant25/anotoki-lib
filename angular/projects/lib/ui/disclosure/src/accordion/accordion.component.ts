import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { ANOTOKI_ACCORDION, AccordionHost, AccordionItem } from '../accordion-host';

/**
 * Several disclosures, one under another - the WAI-ARIA accordion pattern:
 * `<anotoki-accordion><anotoki-disclosure heading="…" [headingLevel]="3">…</anotoki-disclosure>…</anotoki-accordion>`.
 *
 * One open at a time (opening one closes the others; all may be closed), or many (`multiple`). Down and Up move the
 * focus between its disclosures' buttons, round the ends; Home and End to the first and the last. Only its own
 * disclosures belong to it: one inside another's panel is that panel's own.
 */
@Component({
  selector: 'anotoki-accordion',
  templateUrl: './accordion.component.html',
  styleUrl: './accordion.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: ANOTOKI_ACCORDION, useExisting: AccordionComponent }],
  host: { class: 'anotoki-accordion', '(keydown)': 'onKeydown($event)' },
})
export class AccordionComponent implements AccordionHost {
  /** Many open at once; one at a time otherwise. */
  readonly multiple = input(false, { transform: booleanAttribute });

  private readonly items = new Set<AccordionItem>();

  add(item: AccordionItem): void {
    this.items.add(item);
  }

  remove(item: AccordionItem): void {
    this.items.delete(item);
  }

  opened(item: AccordionItem): void {
    if (this.multiple()) {
      return;
    }
    for (const other of this.items) {
      if (other !== item) {
        other.close();
      }
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Its own disclosures' buttons, in the page's order: a key pressed anywhere else (a panel's field) is not its own.
    const buttons = [...this.items]
      .map((item) => item.button())
      .filter((button): button is HTMLButtonElement => !!button)
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) {
      return;
    }
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (index + 1) % buttons.length;
        break;
      case 'ArrowUp':
        next = (index - 1 + buttons.length) % buttons.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = buttons.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    buttons[next].focus();
  }
}
