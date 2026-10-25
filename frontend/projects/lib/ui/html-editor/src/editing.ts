/*
 * What the HTML editor does to its text beyond the browser's own editing (the kit's [anotokiRichTextEditable]): the
 * indent of plain blocks, the highlighter's marks, a colour taken off. The elements it makes are the allow-list's
 * (margin-left on a block, <mark>), so what the editor holds is what the page will show.
 */

/** The blocks an indent moves: the lines of the text, never a list's items (a list is indented by its own levels). */
const BLOCKS = 'p, div, h2, h3, h4';

/** The colour the highlighter is first given by the browser, then made a <mark>: one nobody chooses. */
export const MARK_SENTINEL = 'rgb(1, 2, 3)';

/** The nearest element of `root` - never `root` itself - at or above a node that the selector names, or null. */
export function closestIn(node: Node | null, root: HTMLElement, selector: string): HTMLElement | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  const found = element?.closest<HTMLElement>(selector) ?? null;
  return found && found !== root && root.contains(found) ? found : null;
}

/** Whether a node is inside a list of the text. */
export function inList(node: Node | null, root: HTMLElement): boolean {
  return closestIn(node, root, 'li, ul, ol') !== null;
}

/** The blocks of the text a range touches, in their order - none of them inside a list. */
export function selectedBlocks(root: HTMLElement, range: Range): HTMLElement[] {
  const start = closestIn(range.startContainer, root, BLOCKS);
  const end = closestIn(range.endContainer, root, BLOCKS);
  if (start === null && end === null) {
    return [];
  }
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS)).filter((block) => !block.closest('li, ul, ol'));
  const from = start ? blocks.indexOf(start) : -1;
  const to = end ? blocks.indexOf(end) : -1;
  if (from === -1 || to === -1) {
    return [start, end].filter((block): block is HTMLElement => block !== null && blocks.includes(block));
  }
  return blocks.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** Moves blocks a step in (1) or out (-1): their margin-left in steps of `step` pixels, none at nought - and at most 400. */
export function indentBlocks(blocks: readonly HTMLElement[], direction: 1 | -1, step: number): void {
  for (const block of blocks) {
    const current = parseFloat(block.style.marginLeft) || 0;
    const next = Math.min(400, Math.max(0, current + direction * step));
    if (next === 0) {
      block.style.removeProperty('margin-left');
    } else {
      block.style.marginLeft = `${next}px`;
    }
    if (!block.getAttribute('style')) {
      block.removeAttribute('style');
    }
  }
}

/** Puts an element's children in its place. */
export function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

/** The elements of the text a range touches - those inside it, and those the ends of it are in. */
export function touched(root: HTMLElement, range: Range, selector: string): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const end of [range.startContainer, range.endContainer]) {
    const at = closestIn(end, root, selector);
    if (at) {
      found.add(at);
    }
  }
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    if (range.intersectsNode(element)) {
      found.add(element);
    }
  }
  return [...found];
}

/**
 * The browser's highlight of the sentinel colour, made the highlighter's <mark>: a span coloured by nothing else is
 * replaced by a mark; anything else loses that ground and holds a mark round what it held.
 */
export function sentinelToMarks(root: HTMLElement): void {
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
    if (element.style.backgroundColor !== MARK_SENTINEL) {
      continue;
    }
    element.style.removeProperty('background-color');
    const mark = element.ownerDocument.createElement('mark');
    if (element.localName === 'span' && !element.getAttribute('style') && element.attributes.length <= 1) {
      element.parentNode?.replaceChild(mark, element);
      while (element.firstChild) {
        mark.appendChild(element.firstChild);
      }
      continue;
    }
    if (!element.getAttribute('style')) {
      element.removeAttribute('style');
    }
    while (element.firstChild) {
      mark.appendChild(element.firstChild);
    }
    element.appendChild(mark);
  }
}

/**
 * A colour taken off the elements a range touches: the words' own (`fore`: the color style and <font color>) or the
 * ground behind them (`back`: background-color); an element left with nothing to say - a span or a font without an
 * attribute - is unwrapped.
 */
export function removeColour(root: HTMLElement, range: Range, which: 'fore' | 'back'): void {
  for (const element of touched(root, range, '*')) {
    if (which === 'fore') {
      element.style.removeProperty('color');
      element.removeAttribute('color');
    } else {
      element.style.removeProperty('background-color');
    }
    if (!element.getAttribute('style')) {
      element.removeAttribute('style');
    }
    if ((element.localName === 'span' || element.localName === 'font') && element.attributes.length === 0) {
      unwrap(element);
    }
  }
}
