/*
 * @anotoki/lib/ui/html-editor (0.11.0) - <anotoki-html-editor>: the family's one editor of a text's HTML (genshin's
 * guides and voice lines, the survey's questions and screens) - the kit's rich-text toolbar over the text, with the
 * editor's own buttons where a page asks for them (headings, the highlighter, sizes, fonts, colours, the HTML source,
 * a preview), a link asked in a dialog of its own, plain-text paste, pictures handed to the page. Its value is the
 * allow-list's HTML (@anotoki/lib/ui/rich-html), the same a site's server keeps (Anotoki\Lib\RichHtml\RichHtml). Its
 * words (`anotoki.htmlEditor.*`) are @anotoki/lib/words/html-editor, read by the editor itself.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export type { HtmlEditorHeading } from './src/html-editor/html-editor.component';
export { HTML_EDITOR_TOOLS, HtmlEditorComponent } from './src/html-editor/html-editor.component';
export { typedLinkAddress } from './src/link-dialog/link-dialog.component';
