import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, isDevMode } from '@angular/core';

/** What may not be inside a link: another control, which a keyboard and a screen reader cannot reach as such. */
const INTERACTIVE = 'a[href], button, input, select, textarea, details, iframe, [tabindex], [contenteditable]';

/**
 * A card that is one link as a whole - a character in a grid of them, a build -
 * on a real `<a>`: `<a anotokiLinkCard [routerLink]="['/builds', game, key]">…</a>`.
 *
 * An attribute component, as the kit's button is, so the link stays a link: the
 * router's, the browser's (a new tab, its address on hover), the keyboard's
 * Enter. The whole card is the target, and its focus ring is round the card.
 * Its name is everything it holds, read in order: keep the content short and
 * its first words the ones that say where it goes (a heading inside is fine),
 * and put nothing interactive inside - no link, button or field: a control
 * inside a link is out of a keyboard's and a screen reader's reach (development
 * warns once). An action that belongs to the item goes beside the card.
 *
 * `tone="highlight"`: the page's call to action, as the card's.
 */
@Component({
  selector: 'a[anotokiLinkCard]',
  templateUrl: './link-card.component.html',
  styleUrl: './link-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-link-card', '[attr.data-tone]': 'tone()' },
})
export class LinkCardComponent {
  readonly tone = input<'highlight' | null>(null);

  constructor() {
    if (isDevMode()) {
      const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
      afterNextRender(() => {
        const inside = element.querySelector(INTERACTIVE);
        if (inside) {
          console.warn('[anotokiLinkCard] the card is one link, and holds a control of its own - put it beside the card: a keyboard and a screen reader cannot reach it inside a link.', inside);
        }
      });
    }
  }
}
