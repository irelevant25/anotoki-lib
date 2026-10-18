/*
 * What the tabs' specs share: the geometry jsdom has none of. Only the specs import this; it is not part of the package.
 */

/** A strip's row as the fake lays it out, and what the strip asked of it. */
export interface FakeRow {
  /** Where a strip's scroller is scrolled to (px from its start). */
  left(scroller: Element): number;
  /** Every scrollBy() a strip asked for, in order. */
  readonly moves: ScrollToOptions[];
  /** Puts jsdom back as it was. */
  stop(): void;
}

/**
 * A browser's geometry for the kit's tab strips, from before the first frame: each scroller `width` px wide, its tabs
 * (or links) `tab` px wide each, side by side from its start - scrollWidth, clientWidth, scrollLeft (kept between its
 * start and its end), scrollBy() (which tells the strip with a scroll event, as a browser does) and the boxes the strip
 * measures. Every other element has no size. `stop()` undoes it.
 */
export function fakeRow({ width = 300, tab = 150 }: { width?: number; tab?: number } = {}): FakeRow {
  const prototype = Element.prototype as unknown as Record<string, unknown>;
  const names = ['clientWidth', 'scrollWidth', 'scrollLeft', 'getBoundingClientRect'] as const;
  const before = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(Element.prototype, name)]));
  const ownScrollBy = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollBy');
  const lefts = new WeakMap<Element, number>();
  const moves: ScrollToOptions[] = [];

  const isScroller = (element: Element) => element.classList.contains('anotoki-tab-strip__scroller');
  const items = (scroller: Element) => Array.from(scroller.querySelectorAll('[role=tab], a'));
  const total = (scroller: Element) => items(scroller).length * tab;
  const clamp = (scroller: Element, value: number) => Math.min(Math.max(0, total(scroller) - width), Math.max(0, value));

  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? width : 0;
    },
  });
  Object.defineProperty(Element.prototype, 'scrollWidth', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? Math.max(width, total(this)) : 0;
    },
  });
  Object.defineProperty(Element.prototype, 'scrollLeft', {
    configurable: true,
    get(this: Element) {
      return lefts.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      lefts.set(this, clamp(this, value));
    },
  });
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value(this: Element): DOMRect {
      const scroller = this.closest('.anotoki-tab-strip__scroller');
      if (scroller === this) {
        return new DOMRect(0, 0, width, 44);
      }
      const item = scroller ? this.closest('[role=tab], a') : null;
      const index = scroller && item ? items(scroller).indexOf(item) : -1;
      return index < 0 ? new DOMRect(0, 0, 0, 0) : new DOMRect(index * tab - (lefts.get(scroller!) ?? 0), 0, tab, 44);
    },
  });
  prototype['scrollBy'] = function (this: Element, options: ScrollToOptions): void {
    moves.push(options);
    lefts.set(this, clamp(this, (lefts.get(this) ?? 0) + (options.left ?? 0)));
    this.dispatchEvent(new Event('scroll'));
  };

  return {
    left: (scroller) => lefts.get(scroller) ?? 0,
    moves,
    stop(): void {
      for (const [name, descriptor] of before) {
        if (descriptor) {
          Object.defineProperty(Element.prototype, name, descriptor);
        } else {
          delete prototype[name];
        }
      }
      if (ownScrollBy) {
        Object.defineProperty(Element.prototype, 'scrollBy', ownScrollBy);
      } else {
        delete prototype['scrollBy'];
      }
    },
  };
}
