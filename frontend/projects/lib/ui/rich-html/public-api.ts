/*
 * @anotoki/lib/ui/rich-html (0.11.0) - a text's HTML, made safe: <anotoki-rich-html [html]>, the family's one safe view
 * of what its editors write (a guide, a voice line, a survey's question), and the allow-list under it -
 * cleanRichHtml(), richHtmlText(), richHtmlIsBlank(), richLinkAddress() - which the PHP half holds word for word
 * (Anotoki\Lib\RichHtml\RichHtml): a site's server cleans every text it keeps with the same rules. The HTML is read by
 * the library and drawn node by node: never handed to the browser as markup, never past Angular's sanitizer. No words of
 * its own.
 *
 * The parts under it (the tree, its reading and writing, the page's elements drawn and read) are named too, for the
 * HTML editor (@anotoki/lib/ui/html-editor) and a site's own code.
 */

export type { RichElement, RichNode, RichText } from './src/parse';
export { decodeReferences, parseRichHtml } from './src/parse';
export type { RichHtmlOptions } from './src/rules';
export { RICH_HTML_DROPPED, RICH_HTML_ELEMENTS, RICH_HTML_STYLES, cleanRichHtml, cleanRichNodes, richHtmlIsBlank, richHtmlText, richLinkAddress, writeRichHtml } from './src/rules';
export { drawRichNodes, readRichDom } from './src/dom';
export { RichHtmlComponent } from './src/rich-html/rich-html.component';
