/*
 * A cleaned tree into the page, and a page's elements back into a cleaned tree - node by node, never as markup: each
 * element made by its tag (createElement), each attribute set by its name, each run of words a text node. What is
 * drawn has been through the allow-list first; what is read goes through it before it is anything.
 */

import { RichNode } from './parse';
import { RichHtmlOptions, cleanRichNodes } from './rules';

/** Draws a cleaned tree into an element, after what it holds already. */
export function drawRichNodes(nodes: readonly RichNode[], parent: Node, document: Document): void {
  for (const node of nodes) {
    if ('text' in node) {
      parent.appendChild(document.createTextNode(node.text));
      continue;
    }
    const element = document.createElement(node.tag);
    for (const [name, value] of node.attrs) {
      element.setAttribute(name, value);
    }
    drawRichNodes(node.children, element, document);
    parent.appendChild(element);
  }
}

/** What an element of the page holds, as a tree - its elements by their tags and attributes, its words - through the allow-list. */
export function readRichDom(root: Node, options: RichHtmlOptions = {}): RichNode[] {
  return cleanRichNodes(readNodes(root), options);
}

function readNodes(parent: Node): RichNode[] {
  const nodes: RichNode[] = [];
  parent.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      nodes.push({ text: (child as Text).data });
    } else if (child.nodeType === 1) {
      const element = child as Element;
      nodes.push({
        tag: element.localName.toLowerCase(),
        attrs: Array.from(element.attributes, (attribute) => [attribute.name.toLowerCase(), attribute.value] as const),
        children: readNodes(element),
      });
    }
  });
  return nodes;
}
