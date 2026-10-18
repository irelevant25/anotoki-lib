import type { RichTextLibraryKey } from '@anotoki/lib/words/rich-text';

/** What a button of the toolbar asks the editor to do. */
export type TextCommand = 'bold' | 'italic' | 'underline' | 'strike' | 'bulletList' | 'orderedList' | 'indent' | 'outdent' | 'link' | 'clear' | 'undo' | 'redo';

/** A button of the toolbar, or '|': a line between two groups of them. */
export type ToolbarTool = TextCommand | '|';

/** The toolbar's buttons where the site names none: genshin's editor's and the survey's that every editor has. */
export const DEFAULT_TOOLS: readonly ToolbarTool[] = ['bold', 'italic', 'underline', '|', 'bulletList', 'orderedList', '|', 'link', 'clear'];

/** The formats a press turns on and off - each button says whether it is on (aria-pressed); the rest act once. */
export const TOGGLES: readonly TextCommand[] = ['bold', 'italic', 'underline', 'strike', 'bulletList', 'orderedList', 'link'];

/** Each button's icon: the toolbar's own copies of the family's (icons.ts). */
export const TOOL_ICONS: Readonly<Record<TextCommand, string>> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strike',
  bulletList: 'listBullets',
  orderedList: 'listOrdered',
  indent: 'indent',
  outdent: 'outdent',
  link: 'link',
  clear: 'eraser',
  undo: 'undo',
  redo: 'redo',
};

/** Each button's words: its name and its tooltip. */
export const TOOL_WORDS: Readonly<Record<TextCommand, RichTextLibraryKey>> = {
  bold: 'anotoki.richText.bold',
  italic: 'anotoki.richText.italic',
  underline: 'anotoki.richText.underline',
  strike: 'anotoki.richText.strike',
  bulletList: 'anotoki.richText.bulletList',
  orderedList: 'anotoki.richText.orderedList',
  indent: 'anotoki.richText.indent',
  outdent: 'anotoki.richText.outdent',
  link: 'anotoki.richText.link',
  clear: 'anotoki.richText.clear',
  undo: 'anotoki.richText.undo',
  redo: 'anotoki.richText.redo',
};

/**
 * A link's address as the kit lets it into a text - or null. A web address (http:, https:) or a mail's (mailto:), an
 * address of the site's own ('/guides/1', '#notes', '?page=2'), or a site's name with no scheme ('example.com/page',
 * made https:). Never another scheme - javascript:, data:, vbscript:, file: - nor one written to hide it: spaces,
 * control characters, quotes or angle brackets anywhere, or '//' with no scheme. What the kit lets in is no defence
 * either: the server cleans every text it keeps.
 */
export function safeLinkAddress(address: string): string | null {
  const text = address.trim();
  if (text === '' || /[\s"'<>`\\\u0000-\u001f\u007f]/.test(text) || text.startsWith('//')) {
    return null;
  }
  if (/^(https?:\/\/|mailto:)/i.test(text)) {
    return text;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    return null;
  }
  if (/^[/#?]/.test(text)) {
    return text;
  }
  return `https://${text}`;
}
