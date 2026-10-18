/*
 * @anotoki/lib/ui/rich-text - <anotoki-rich-text-toolbar>: the buttons over a text editor as the ARIA toolbar pattern
 * has them (one Tab stop, the arrow keys between them, aria-pressed for a format that is on), the kit's icons and names;
 * `[anotokiToolbarItem]`, a site's own control in its row; and `[anotokiRichTextEditable]`, which carries the commands
 * out on a plain contenteditable and lets in no markup from outside. The toolbar holds no text and inserts none - and
 * the site cleans what its editor holds before it shows it, its server what it keeps. Its words
 * (`anotoki.richText.*`) are @anotoki/lib/words/rich-text, read by the toolbar itself.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export type { TextCommand, ToolbarTool } from './src/commands';
export { DEFAULT_TOOLS, safeLinkAddress } from './src/commands';
export { RichTextToolbarComponent } from './src/toolbar/rich-text-toolbar.component';
export { ToolbarItemDirective } from './src/toolbar-item.directive';
export { RichTextEditableDirective } from './src/editable.directive';
