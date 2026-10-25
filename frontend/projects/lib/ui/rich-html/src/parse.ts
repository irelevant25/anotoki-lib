/*
 * A text's HTML read into a tree - by the library itself, never by the browser (no markup handed to it to read: the
 * kit draws text, and what it reads here is drawn node by node, each through the allow-list, rules.ts). Written to read
 * what the editors write (a browser's contenteditable, TipTap) exactly as a browser does, and anything else safely: the
 * same steps in the PHP half (Anotoki\Lib\RichHtml\Parser), so that both ends make the same tree of the same text -
 * a test holds them to the same cases (backend/tests/RichHtml/cases.json).
 *
 * What it does of HTML's own rules: tags and their attributes (quoted or not, the first of a name kept, names in lower
 * case), character references (numeric ones, and the named ones of entities.ts), comments and declarations dropped,
 * the elements whose content is never markup (script, style, textarea, ...) skipped whole to their end, void elements
 * (br, img, ...) closed at once, a paragraph closed by a block that starts in it, a list item by the next, a heading by
 * the next, an end tag closing what it names unless a block stands between (an inline end tag never closes a block's
 * ancestor). What it leaves out of HTML's rules (the "adoption agency" of misnested formatting, tables' foster parents)
 * changes nothing a text needs, and nothing of what it reads is ever drawn but through the allow-list.
 */

import { ENTITIES } from './entities';

/** A run of words. */
export interface RichText {
  readonly text: string;
}

/** An element: its tag (lower case), its attributes in their order (names in lower case), what it holds. */
export interface RichElement {
  readonly tag: string;
  readonly attrs: readonly (readonly [name: string, value: string])[];
  readonly children: readonly RichNode[];
}

/** What a text is made of. */
export type RichNode = RichText | RichElement;

/** An element while it is built: its children are added as the text is read. */
interface Building {
  readonly tag: string;
  readonly attrs: (readonly [string, string])[];
  readonly children: RichNode[];
}

/** Elements with no content and no end tag. */
const VOID = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

/** Elements whose content is never markup: skipped whole, to their end tag (or to the end of the text). */
const RAW = ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext'];

/** Blocks: a paragraph open where one starts is closed first. */
const CLOSES_P = [
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dd',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'ul',
];

/** Where a search for an open element stops: it never reaches out of a table's cell or an object. */
const SCOPE = ['table', 'td', 'th', 'caption', 'template', 'object', 'applet', 'marquee', 'button'];

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/** Elements an inline end tag never closes through: HTML's "special" ones a text may hold. */
function isSpecial(tag: string): boolean {
  return CLOSES_P.includes(tag) || SCOPE.includes(tag) || tag === 'tbody' || tag === 'thead' || tag === 'tfoot' || tag === 'tr';
}

/** HTML's characters of white space between attributes. */
const SPACE = /[\t\n\f\r ]/;

/** The C1 references HTML reads as the windows-1252 characters of those numbers (&#150; is an en dash). */
const WINDOWS_1252: Readonly<Record<number, number>> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

/** A text's character references, as HTML reads them: numeric ones with or without their semicolon, named ones with it. */
export function decodeReferences(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  return text.replace(/&(?:#([0-9]{1,8})|#[xX]([0-9a-fA-F]{1,8})|([A-Za-z][A-Za-z0-9]{1,31}));?/g, (whole: string, decimal?: string, hex?: string, name?: string) => {
    if (name !== undefined) {
      return whole.endsWith(';') && Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : whole;
    }
    let code = decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex ?? '0', 16);
    code = WINDOWS_1252[code] ?? code;
    if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      return '\ufffd';
    }
    return String.fromCodePoint(code);
  });
}

/** A text's HTML as a tree: its line ends as HTML reads them (\n), every element closed. */
export function parseRichHtml(html: string | null | undefined): RichNode[] {
  const source = (html ?? '').replace(/\r\n?/g, '\n');
  const root: Building = { tag: '', attrs: [], children: [] };
  const open: Building[] = [root];
  const current = (): Building => open[open.length - 1];
  let words = '';

  /** The words read since the last tag, as a node of the open element. */
  const flush = (): void => {
    if (words !== '') {
      current().children.push({ text: decodeReferences(words) });
      words = '';
    }
  };

  /** Closes the open elements from the one at `index` of the stack up: it and all it holds. */
  const closeFrom = (index: number): void => {
    open.length = Math.max(1, index);
  };

  /** Where the nearest open element of a tag is in the stack - never past an element `stops` names; -1 where none is. */
  const openAt = (tag: string, stops: (tag: string) => boolean): number => {
    for (let index = open.length - 1; index > 0; index--) {
      if (open[index].tag === tag) {
        return index;
      }
      if (stops(open[index].tag)) {
        return -1;
      }
    }
    return -1;
  };
  const inScope = (tag: string): boolean => SCOPE.includes(tag);

  const startTag = (name: string, attrs: (readonly [string, string])[]): void => {
    if (CLOSES_P.includes(name)) {
      const p = openAt('p', inScope);
      if (p !== -1) {
        closeFrom(p);
      }
    }
    if (name === 'li') {
      for (let index = open.length - 1; index > 0; index--) {
        const tag = open[index].tag;
        if (tag === 'li') {
          closeFrom(index);
          break;
        }
        if (isSpecial(tag) && tag !== 'address' && tag !== 'div' && tag !== 'p') {
          break;
        }
      }
    }
    if (HEADINGS.includes(name) && HEADINGS.includes(current().tag)) {
      closeFrom(open.length - 1);
    }
    const element: Building = { tag: name, attrs, children: [] };
    current().children.push(element);
    if (!VOID.includes(name)) {
      open.push(element);
    }
  };

  const endTag = (name: string): void => {
    if (name === 'br') {
      // "</br>" is read as a line break.
      current().children.push({ tag: 'br', attrs: [], children: [] });
      return;
    }
    if (VOID.includes(name)) {
      return;
    }
    if (HEADINGS.includes(name)) {
      // "</h3>" closes whichever heading is open.
      for (let index = open.length - 1; index > 0 && !inScope(open[index].tag); index--) {
        if (HEADINGS.includes(open[index].tag)) {
          closeFrom(index);
          return;
        }
      }
      return;
    }
    const index = isSpecial(name) ? openAt(name, inScope) : openAt(name, isSpecial);
    if (index !== -1) {
      closeFrom(index);
    }
  };

  let at = 0;
  while (at < source.length) {
    const lt = source.indexOf('<', at);
    if (lt === -1) {
      words += source.slice(at);
      break;
    }
    words += source.slice(at, lt);
    at = lt;
    const next = source[at + 1] ?? '';

    if (source.startsWith('<!--', at)) {
      // A comment: to its end, or to the text's end.
      const end = source.indexOf('-->', at + 4);
      at = end === -1 ? source.length : end + 3;
      continue;
    }
    if (next === '!' || next === '?') {
      // A declaration, a CDATA section, a processing instruction: HTML reads them as comments, to the next '>'.
      const end = source.indexOf('>', at + 2);
      at = end === -1 ? source.length : end + 1;
      continue;
    }
    if (next === '/') {
      const after = source[at + 2] ?? '';
      if (/[A-Za-z]/.test(after)) {
        const tag = readTag(source, at + 2);
        if (tag === null) {
          // An end tag the text ends inside: nothing.
          at = source.length;
          continue;
        }
        flush();
        endTag(tag.name);
        at = tag.end;
        continue;
      }
      // "</>" is nothing; "</ ...>" a comment, to the next '>'.
      const end = after === '>' ? at + 2 : source.indexOf('>', at + 2);
      at = end === -1 ? source.length : end + 1;
      continue;
    }
    if (!/[A-Za-z]/.test(next)) {
      // A '<' that starts no tag is a word's.
      words += '<';
      at++;
      continue;
    }
    const tag = readTag(source, at + 1);
    if (tag === null) {
      // A start tag the text ends inside: nothing, as HTML drops it.
      at = source.length;
      continue;
    }
    flush();
    at = tag.end;
    if (RAW.includes(tag.name)) {
      // Its content is no markup and is never kept: skipped to its end tag - all of the rest for plaintext.
      const end = tag.name === 'plaintext' ? null : new RegExp(`</${tag.name}[\\t\\n\\f\\r />]`, 'i').exec(source.slice(at));
      if (end === null) {
        at = source.length;
        continue;
      }
      const close = source.indexOf('>', at + end.index);
      at = close === -1 ? source.length : close + 1;
      continue;
    }
    startTag(tag.name, tag.attrs);
  }
  flush();
  return root.children;
}

/** A tag read from its name's first letter: its name, its attributes, where it ends - or null where the text ends inside it. */
function readTag(source: string, from: number): { name: string; attrs: (readonly [string, string])[]; end: number } | null {
  let at = from;
  while (at < source.length && !SPACE.test(source[at]) && source[at] !== '/' && source[at] !== '>') {
    at++;
  }
  const name = lower(source.slice(from, at));
  const attrs: (readonly [string, string])[] = [];
  const seen: string[] = [];
  while (at < source.length) {
    const char = source[at];
    if (SPACE.test(char) || char === '/') {
      at++;
      continue;
    }
    if (char === '>') {
      return { name, attrs, end: at + 1 };
    }
    // An attribute's name: to a space, '/', '>' or '=' (an '=' first is a name's own).
    const start = at;
    at++;
    while (at < source.length && !SPACE.test(source[at]) && source[at] !== '/' && source[at] !== '>' && source[at] !== '=') {
      at++;
    }
    const attribute = lower(source.slice(start, at));
    while (at < source.length && SPACE.test(source[at])) {
      at++;
    }
    let value = '';
    if (source[at] === '=') {
      at++;
      while (at < source.length && SPACE.test(source[at])) {
        at++;
      }
      const quote = source[at];
      if (quote === '"' || quote === "'") {
        const close = source.indexOf(quote, at + 1);
        if (close === -1) {
          return null;
        }
        value = source.slice(at + 1, close);
        at = close + 1;
      } else {
        const begin = at;
        while (at < source.length && !SPACE.test(source[at]) && source[at] !== '>') {
          at++;
        }
        value = source.slice(begin, at);
      }
    }
    // The first of a name is the element's, as HTML keeps it.
    if (!seen.includes(attribute)) {
      seen.push(attribute);
      attrs.push([attribute, decodeReferences(value)]);
    }
  }
  return null;
}

/** A name in lower case - its ASCII letters alone, as HTML lowers a tag's or an attribute's name. */
function lower(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
