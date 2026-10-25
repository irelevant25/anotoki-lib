import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';

// The icons the editor's own buttons draw: the family's highlighter (the same paths as @anotoki/lib/ui/icons'
// iconHighlighter, a spec holds it to it), and the HTML source's angle brackets. Its own copies, never imported from
// ui/icons - a site that loads it up front for its own would carry the editor's in its first load, one file one chunk.
const iconHighlighter: IconPaths = ['M9 11l-6 6v3h9l3-3', 'M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'];
const iconSourceCode: IconPaths = ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'];

/** The icons the editor draws beside the kit's own and the toolbar's. */
const EDITOR_ICONS: IconSet = { highlighter: iconHighlighter, sourceCode: iconSourceCode };

/** Registers the editor's icons - each only where the site has none of that name: a site's own drawing of one stays. */
export function registerHtmlEditorIcons(icons: AnotokiIcons): void {
  icons.register(Object.fromEntries(Object.entries(EDITOR_ICONS).filter(([name]) => !icons.has(name))));
}
