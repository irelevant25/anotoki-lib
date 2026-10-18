import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { TABS_LIBRARY_WORDS } from '@anotoki/lib/words/tabs';

/** How wide the faded edge under an arrow is at the most (px, the styles' 2.75rem on a touch screen): a tab brought into view stands clear of it. */
const FADE = 44;

/** What a scroll button moves the row by: most of what is in view, so the tab cut at the edge stays seen. */
const STEP = 0.8;

/**
 * The scrolling strip under a row of tabs - the kit's tabs' and link tabs' (internal: not exported).
 *
 * Where the row does not fit (a phone, a narrow column) it scrolls sideways, never the page: the edge with more beyond
 * it fades (`anotoki-tab-strip--back`, `--forward`) under a small arrow that moves the row (`anotoki-tab-strip__more`,
 * 44 px to a finger) - the hint that more is there, which a row merely cut at the edge did not give. The arrows are for
 * the eye and the pointer alone - out of the tab order, hidden from screen readers, never taking the focus: the keyboard
 * and a screen reader reach every tab itself, and a tab that takes the focus is brought into view clear of the fade.
 * The current one (`current`: the chosen tab's, the page's link's id) is brought into view as it is drawn and whenever
 * it changes - by the strip's own scroll, never the page's.
 */
@Component({
  selector: 'anotoki-tab-strip',
  imports: [IconComponent],
  templateUrl: './tab-strip.component.html',
  styleUrl: './tab-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-tab-strip', '[class.anotoki-tab-strip--back]': 'back()', '[class.anotoki-tab-strip--forward]': 'forward()' },
})
export class TabStripComponent {
  /** What is current: a change brings the current element (aria-selected="true" or aria-current="page") into view. */
  readonly current = input<string | null>(null);

  protected readonly word = pieceWords(TABS_LIBRARY_WORDS);
  /** More tabs before those in view, and after them. */
  protected readonly back = signal(false);
  protected readonly forward = signal(false);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  /** The first bringing into view is at once; a later one glides (unless motion is reduced). */
  private shown = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const scroller = this.scroller().nativeElement;
      this.measure();
      // The strip's width (a window turned, a column resized) and the row's (tabs added, words changed, the font
      // loaded): either changes what is beyond the edges.
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(() => this.measure());
        observer.observe(scroller);
        if (scroller.firstElementChild) {
          observer.observe(scroller.firstElementChild);
        }
        destroyRef.onDestroy(() => observer.disconnect());
      }
    });

    afterRenderEffect(() => {
      this.current();
      untracked(() => {
        this.measure();
        this.reveal(this.scroller().nativeElement.querySelector('[aria-selected="true"], [aria-current="page"]'), this.shown);
        this.shown = true;
      });
    });
  }

  /** Which edges have more beyond them: read again on every scroll and resize. */
  protected measure(): void {
    const scroller = this.scroller().nativeElement;
    const start = Math.abs(scroller.scrollLeft);
    const room = scroller.scrollWidth - scroller.clientWidth;
    this.back.set(start > 1);
    this.forward.set(room - start > 1);
  }

  /** An arrow button: most of a view further back (-1) or on (1). */
  protected scrollBy(direction: -1 | 1): void {
    const scroller = this.scroller().nativeElement;
    this.move(scroller, direction * Math.max(scroller.clientWidth * STEP, FADE), true);
  }

  /** A tab took the focus (Tab, the arrow keys): it stands clear of the faded edges. */
  protected onFocusIn(event: FocusEvent): void {
    if (event.target instanceof Element) {
      this.reveal(event.target, false);
    }
  }

  /** Brings an element of the row into view, clear of the fade, by the strip's own scroll alone. */
  private reveal(element: Element | null, glide: boolean): void {
    const scroller = this.scroller().nativeElement;
    if (!element || scroller.scrollWidth <= scroller.clientWidth + 1) {
      return;
    }
    const box = element.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    // A tab wider than the view less both fades is lined up with its start.
    const clear = Math.max(0, Math.min(FADE, (view.width - box.width) / 2));
    if (box.left < view.left + clear) {
      this.move(scroller, box.left - view.left - clear, glide);
    } else if (box.right > view.right - clear) {
      this.move(scroller, box.right - view.right + clear, glide);
    }
  }

  /** Scrolls the strip by `left` px - no further than its ends, and not at all where it is at the end already. */
  private move(scroller: HTMLElement, left: number, glide: boolean): void {
    const start = Math.abs(scroller.scrollLeft);
    left = Math.max(-start, Math.min(scroller.scrollWidth - scroller.clientWidth - start, left));
    if (Math.abs(left) < 1) {
      return;
    }
    const behavior: ScrollBehavior = glide && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto';
    if (typeof scroller.scrollBy === 'function') {
      scroller.scrollBy({ left, behavior });
    } else {
      scroller.scrollLeft += left;
    }
  }
}
