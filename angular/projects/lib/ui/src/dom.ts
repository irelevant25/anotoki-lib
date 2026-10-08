import { Signal, effect, signal, untracked } from '@angular/core';

let counter = 0;

/**
 * An id no other element on the page has, for tying a label, a hint, a menu
 * or an error to what they belong to. A counter is enough: ids only need to
 * be unique within the one document an app renders into.
 */
export function uniqueId(prefix = 'anotoki'): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Moves a box drawn under a button (a menu, a note) sideways onto the screen
 * when it would stick out of it - near the right edge of a phone's bar, half
 * of a box centred under a button would - by its inline `translate`, the right
 * edge first and never past the left one. Call it once the box is drawn (and
 * again when it changes size); it measures afresh each time.
 */
export function keepOnScreen(element: HTMLElement | null | undefined, edge = 8): void {
  if (!element) {
    return;
  }
  element.style.translate = '';
  const box = element.getBoundingClientRect();
  const screen = element.ownerDocument.documentElement.clientWidth;
  if (box.width === 0 || screen === 0) {
    return;
  }
  let shift = 0;
  if (box.right > screen - edge) {
    shift = screen - edge - box.right;
  }
  if (box.left + shift < edge) {
    shift = edge - box.left;
  }
  if (shift !== 0) {
    element.style.translate = `${Math.round(shift)}px 0`;
  }
}

/**
 * Whether the window matches a media query, as a signal kept current while
 * the component (or service) that asked is there. The query may be a function
 * of signals - `() => '(max-width: ' + this.phoneMax() + 'px)'` - and is asked
 * again when they change. Call it in an injection context.
 *
 * The first answer is there at once (no frame drawn for the wrong width); a
 * browser without matchMedia (a test's jsdom) answers false.
 */
export function mediaQuery(query: string | (() => string)): Signal<boolean> {
  const read = typeof query === 'string' ? () => query : query;
  const matchMedia = typeof globalThis.matchMedia === 'function' ? (media: string) => globalThis.matchMedia(media) : null;
  const matches = signal(matchMedia ? matchMedia(untracked(read)).matches : false);
  if (matchMedia) {
    effect((onCleanup) => {
      const list = matchMedia(read());
      const update = (): void => matches.set(list.matches);
      update();
      list.addEventListener('change', update);
      onCleanup(() => list.removeEventListener('change', update));
    });
  }
  return matches.asReadonly();
}

/**
 * The elements a keyboard can Tab to inside `root`, in order. Nothing taken out
 * of the tab order on purpose (tabindex="-1") - a hidden username a password
 * manager files a password under is no place to start typing, nor to Tab to -
 * and nothing hidden.
 */
export function tabbable(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(isShown);
}

const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]',
]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(',');

/** Whether an element is drawn (not display: none, not in a hidden subtree). */
export function isShown(element: HTMLElement): boolean {
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility();
  }
  return element.offsetParent !== null || element.getClientRects().length > 0 || element === element.ownerDocument.activeElement;
}
