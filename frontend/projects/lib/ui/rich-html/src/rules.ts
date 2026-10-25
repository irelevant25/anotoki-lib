/*
 * The allow-list of a text's HTML - the one the family's editors write and its pages show, the same in the PHP half
 * (Anotoki\Lib\RichHtml\RichHtml), which a site's server cleans every text it keeps with: what is not named here does
 * not survive. Elements: paragraphs and lines (p, div, br), headings h2 to h4, lists (ul, ol, li), and the words' own
 * formats (b, strong, i, em, u, s, strike, mark, span, font, a). Elements whose content is no text to read (scripts,
 * styles, frames, forms, pictures, media, svg, math) go with all they hold; every other is unwrapped to what it holds.
 * Attributes: a link's address - a web address with its host, or a mail address, nothing else (no javascript:, no data:,
 * no address of the site's own) - and every link opening in a new tab with no way back to the page (rel="noopener
 * noreferrer"); a numbered list's start; <font>'s size (1 to 7), face and colour; inline styles of five properties alone
 * - color, background-color, font-size, font-family, margin-left - each value written as those properties take it and
 * bounded (no url(), no expression, no negative margin, no size past 72 px); and the class names a site names for its
 * texts (genshin's guides' "tag"), none by default. Nothing here can run, load anything or move out of the text's box:
 * no event handler, no position, no transform, no width, no z-index.
 */

import { RichElement, RichNode, parseRichHtml } from './parse';

/** What a site adds to the allow-list: the class names its texts may carry (its own styles for them). */
export interface RichHtmlOptions {
  readonly classes?: readonly string[];
}

/** The elements a text keeps, with what they hold. */
export const RICH_HTML_ELEMENTS: readonly string[] = ['p', 'div', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'mark', 'span', 'font', 'a'];

/** The elements a text loses with everything inside them: what they hold is no text to read. Every other is unwrapped. */
export const RICH_HTML_DROPPED: readonly string[] = [
  'script',
  'style',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'noscript',
  'noembed',
  'noframes',
  'textarea',
  'select',
  'option',
  'button',
  'input',
  'form',
  'head',
  'title',
  'meta',
  'link',
  'base',
  'img',
  'picture',
  'video',
  'audio',
  'source',
  'track',
  'canvas',
  'map',
  'area',
  'dialog',
  'xmp',
  'plaintext',
];

/** The style properties a text keeps: what the editors' sizes, fonts, colours and indent write. */
export const RICH_HTML_STYLES: readonly string[] = ['color', 'background-color', 'font-size', 'font-family', 'margin-left'];

/** A colour: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba() of numbers, or a colour's name. */
const COLOR = /^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([0-9.,%\t\n\f\r /]{1,60}\)|[a-z]{3,20})$/i;
/** A font's names: letters, digits, spaces, commas, hyphens and quotes - no parenthesis, no semicolon, no escape. */
const FONT = /^[a-z0-9 ,'"-]{1,100}$/i;
const FONT_SIZE_WORD = /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i;
const LENGTH = /^(\d{1,4}(?:\.\d{1,4})?)(px|pt|em|rem|%)$/i;
/** The largest of each unit a size may be: 72 px, and as much in the others. */
const FONT_SIZE_MAX: Readonly<Record<string, number>> = { px: 72, pt: 54, em: 4.5, rem: 4.5, '%': 450 };
/** The deepest an indent may be: 400 px, and as much in em. */
const MARGIN_MAX: Readonly<Record<string, number>> = { px: 400, em: 25, rem: 25 };

/** Characters a text never keeps: controls but tab and line feed, and those that turn the text's direction. */
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/** A value without the spaces round it: HTML's and CSS's own (space, tab, line feed, form feed, carriage return) alone, as the PHP half trims it. */
function trimSpaces(value: string): string {
  return value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
}

/** A style's value as its property takes it, or null where it does not. */
function styleValue(property: string, value: string): string | null {
  switch (property) {
    case 'color':
    case 'background-color':
      return COLOR.test(value) ? value : null;
    case 'font-family':
      return FONT.test(value) ? value : null;
    case 'font-size': {
      if (FONT_SIZE_WORD.test(value)) {
        return value;
      }
      const length = LENGTH.exec(value);
      const size = length ? Number(length[1]) : 0;
      return length && size > 0 && size <= FONT_SIZE_MAX[length[2].toLowerCase()] ? value : null;
    }
    case 'margin-left': {
      if (value === '0') {
        return value;
      }
      const length = LENGTH.exec(value);
      const max = length ? MARGIN_MAX[length[2].toLowerCase()] : undefined;
      return length && max !== undefined && Number(length[1]) <= max ? value : null;
    }
    default:
      return null;
  }
}

/** A style attribute's declarations the allow-list keeps, written as a browser writes them: "color: red; font-size: 12px;". */
function cleanStyle(style: string): string {
  const kept = new Map<string, string>();
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const property = trimSpaces(declaration.slice(0, colon)).toLowerCase();
    const value = styleValue(property, trimSpaces(declaration.slice(colon + 1)));
    if (value !== null && RICH_HTML_STYLES.includes(property)) {
      // The last of a property is the one in force, as in CSS; in the place of its first.
      kept.set(property, value);
    }
  }
  return [...kept].map(([property, value]) => `${property}: ${value};`).join(' ');
}

/**
 * Where a link of a text may point: a web address with its host (http:, https:) or a mail address (mailto:, with an
 * @), at most 2000 characters, with no space, control, quote, angle bracket, backtick or backslash in it - or null.
 * Never javascript:, data:, vbscript:, file:, an address of the site's own ("/guides"), nor "//host" with no scheme.
 */
export function richLinkAddress(address: string): string | null {
  const href = trimSpaces(address);
  if ([...href].length > 2000 || /[\x00-\x20\x7f-\xa0"'<>`\\]/.test(href)) {
    return null;
  }
  return /^(?:https?:\/\/[^/?#]+|mailto:[^?#]+@)/i.test(href) ? href : null;
}

/** An element's attribute, as written - null for one it has not. */
function attribute(element: RichElement, name: string): string | null {
  return element.attrs.find(([each]) => each === name)?.[1] ?? null;
}

/** The attributes an element of the allow-list keeps, in the allow-list's order. */
function cleanAttributes(element: RichElement, options: RichHtmlOptions, href: string | null): (readonly [string, string])[] {
  const kept: (readonly [string, string])[] = [];
  const tag = element.tag;
  if (tag === 'br') {
    return kept;
  }
  if (tag === 'a' && href !== null) {
    kept.push(['target', '_blank'], ['rel', 'noopener noreferrer'], ['href', href]);
  }
  if (tag === 'ol') {
    const start = trimSpaces(attribute(element, 'start') ?? '');
    if (/^\d{1,6}$/.test(start) && Number(start) > 1 && Number(start) <= 100000) {
      kept.push(['start', String(Number(start))]);
    }
  }
  if (tag === 'font') {
    const size = trimSpaces(attribute(element, 'size') ?? '');
    const face = trimSpaces(attribute(element, 'face') ?? '');
    const color = trimSpaces(attribute(element, 'color') ?? '');
    if (/^[1-7]$/.test(size)) {
      kept.push(['size', size]);
    }
    if (FONT.test(face)) {
      kept.push(['face', face]);
    }
    if (COLOR.test(color)) {
      kept.push(['color', color]);
    }
  }
  const allowed = options.classes ?? [];
  const classes = (attribute(element, 'class') ?? '').split(/[\t\n\f\r ]+/).filter((name, index, all) => name !== '' && allowed.includes(name) && all.indexOf(name) === index);
  if (classes.length) {
    kept.push(['class', classes.join(' ')]);
  }
  const style = cleanStyle(attribute(element, 'style') ?? '');
  if (style !== '') {
    kept.push(['style', style]);
  }
  return kept;
}

/** A tree through the allow-list: what is not named in it is dropped with its content, or unwrapped to it. */
export function cleanRichNodes(nodes: readonly RichNode[], options: RichHtmlOptions = {}, inLink = false): RichNode[] {
  const clean: RichNode[] = [];
  for (const node of nodes) {
    if ('text' in node) {
      const text = node.text.replace(CONTROLS, '');
      if (text !== '') {
        clean.push({ text });
      }
      continue;
    }
    if (RICH_HTML_DROPPED.includes(node.tag)) {
      continue;
    }
    // A link inside a link, or one to an address a text may not point at, is its words alone.
    const href = node.tag === 'a' ? richLinkAddress(attribute(node, 'href') ?? '') : null;
    if (!RICH_HTML_ELEMENTS.includes(node.tag) || (node.tag === 'a' && (href === null || inLink))) {
      clean.push(...cleanRichNodes(node.children, options, inLink));
      continue;
    }
    clean.push({
      tag: node.tag,
      attrs: cleanAttributes(node, options, href),
      children: node.tag === 'br' ? [] : cleanRichNodes(node.children, options, inLink || node.tag === 'a'),
    });
  }
  return clean;
}

/** Words as HTML writes them in a text: & < > and the no-break space escaped, as a browser writes them. */
function escapeText(text: string): string {
  return text.replace(/[&<>\u00a0]/g, (char) => (char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&nbsp;'));
}

/** An attribute's value as HTML writes it between double quotes: & " < > and the no-break space escaped. */
function escapeAttribute(text: string): string {
  return text.replace(/[&"<>\u00a0]/g, (char) => (char === '&' ? '&amp;' : char === '"' ? '&quot;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&nbsp;'));
}

/** A tree as HTML: every element closed, every value quoted, every word escaped - the same text read again is the same tree. */
export function writeRichHtml(nodes: readonly RichNode[]): string {
  let html = '';
  for (const node of nodes) {
    if ('text' in node) {
      html += escapeText(node.text);
      continue;
    }
    html += `<${node.tag}${node.attrs.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('')}>`;
    if (node.tag !== 'br') {
      html += `${writeRichHtml(node.children)}</${node.tag}>`;
    }
  }
  return html;
}

/**
 * A text's HTML through the allow-list, as HTML again: what the family's pages show, and what a site keeps - its
 * server cleans it again (Anotoki\Lib\RichHtml\RichHtml::clean(), the same rules), whatever sent it. The editors' own
 * text comes out as it went in.
 */
export function cleanRichHtml(html: string | null | undefined, options: RichHtmlOptions = {}): string {
  return writeRichHtml(cleanRichNodes(parseRichHtml(html), options));
}

const BLOCKS = ['p', 'div', 'h2', 'h3', 'h4', 'ul', 'ol', 'li'];

/** The words of a tree: a space for each line break and after each block. */
function words(nodes: readonly RichNode[]): string {
  return nodes.map((node) => ('text' in node ? node.text : node.tag === 'br' ? ' ' : words(node.children) + (BLOCKS.includes(node.tag) ? ' ' : ''))).join('');
}

/**
 * A text's words without its markup, one space between them: for a one-line summary, a list, a search, a CSV - what
 * a reader of it reads (what the allow-list drops is no words of it). The spaces are the browser's (its trim()'s).
 */
export function richHtmlText(html: string | null | undefined): string {
  return words(cleanRichNodes(parseRichHtml(html)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether a text has no words at all - what an emptied editor leaves behind (<p></p>, <p><br></p>). */
export function richHtmlIsBlank(html: string | null | undefined): boolean {
  return richHtmlText(html) === '';
}
