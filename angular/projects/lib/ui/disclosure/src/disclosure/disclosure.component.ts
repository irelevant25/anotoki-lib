import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, booleanAttribute, contentChild, effect, inject, input, model, signal, viewChild } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui/dom';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { ANOTOKI_ACCORDION, AccordionItem } from '../accordion-host';
import { DisclosurePanelDirective } from '../disclosure-panel.directive';

/**
 * A button that shows and hides what is under it - "Notes from the source", "Trouble importing?", a group of lines:
 * `<anotoki-disclosure heading="Notes from Wanderer's Troupe">…</anotoki-disclosure>`.
 *
 * The button says whether it is open (aria-expanded) and what it opens (aria-controls); Enter and Space work it, as
 * any button. Inside a heading of the page's outline with `headingLevel` (an accordion's items are headings, the
 * WAI-ARIA accordion pattern); a button alone without. `[(open)]` binds whether it is open.
 *
 * Its content, given as it is, is made at once and hidden while closed. Given as `<ng-template anotokiDisclosurePanel>`
 * it is made only once opened - hundreds of lines, editors that load - and dropped when closed, or kept once made
 * (`keep`), hidden while closed. A card's look, or `plain`: a quiet line in the link's ink ("More options").
 */
@Component({
  selector: 'anotoki-disclosure',
  imports: [IconComponent, NgTemplateOutlet],
  templateUrl: './disclosure.component.html',
  styleUrl: './disclosure.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A disclosure inside this one's panel belongs to no accordion around them both.
  providers: [{ provide: ANOTOKI_ACCORDION, useValue: null }],
  host: { class: 'anotoki-disclosure', '[class.anotoki-disclosure--open]': 'open()', '[class.anotoki-disclosure--plain]': 'plain()' },
})
export class DisclosureComponent implements AccordionItem {
  private readonly accordion = inject(ANOTOKI_ACCORDION, { optional: true, skipSelf: true });

  /** The button's words. */
  readonly heading = input.required<string>();
  /** Open, both ways. */
  readonly open = model(false);
  /** The level of the heading the button sits in (an accordion's items); null: a button alone. */
  readonly headingLevel = input<2 | 3 | 4 | 5 | 6 | null>(null);
  /** Content given as a template, kept once made (hidden while closed) rather than made again at every opening. */
  readonly keep = input(false, { transform: booleanAttribute });
  /** No card around it: a quiet line in the link's ink. */
  readonly plain = input(false, { transform: booleanAttribute });

  protected readonly panel = contentChild(DisclosurePanelDirective);
  /** Opened once: content kept (`keep`) stays made. */
  protected readonly made = signal(false);

  private readonly id = uniqueId('anotoki-disclosure');
  protected readonly buttonId = `${this.id}-button`;
  protected readonly panelId = `${this.id}-panel`;
  private readonly buttonRef = viewChild<ElementRef<HTMLButtonElement>>('button');

  constructor() {
    this.accordion?.add(this);
    inject(DestroyRef).onDestroy(() => this.accordion?.remove(this));
    effect(() => {
      if (this.open()) {
        this.made.set(true);
      }
    });
  }

  /** Opens it, or closes it; in an accordion that opens one at a time, its others close. */
  toggle(): void {
    const opening = !this.open();
    this.open.set(opening);
    if (opening) {
      this.accordion?.opened(this);
    }
  }

  close(): void {
    this.open.set(false);
  }

  button(): HTMLButtonElement | undefined {
    return this.buttonRef()?.nativeElement;
  }
}
