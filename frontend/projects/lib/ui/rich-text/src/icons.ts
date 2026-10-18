import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';

// The family's icons the toolbar draws, its own copies (the same paths as @anotoki/lib/ui/icons' iconBold, iconItalic,
// ..., a spec holds them to them): never imported from there - a site that loads ui/icons up front for its own would
// carry the toolbar's icons in its first load, one file being one chunk.
const iconBold: IconPaths = ['M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'];
const iconItalic: IconPaths = ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'];
const iconUnderline: IconPaths = ['M6 4v6a6 6 0 0 0 12 0V4', 'M4 20h16'];
const iconStrike: IconPaths = ['M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 0 8H6', 'M4 12h16'];
const iconListBullets: IconPaths = ['M3 6h.01', 'M3 12h.01', 'M3 18h.01', 'M8 6h13', 'M8 12h13', 'M8 18h13'];
const iconListOrdered: IconPaths = ['M10 6h11', 'M10 12h11', 'M10 18h11', 'M4 6h1v4', 'M4 10h2', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'];
const iconIndent: IconPaths = ['M21 6H11', 'M21 12H11', 'M21 18H11', 'M3 8l4 4-4 4'];
const iconOutdent: IconPaths = ['M21 6H11', 'M21 12H11', 'M21 18H11', 'M7 8l-4 4 4 4'];
const iconLink: IconPaths = ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'];
const iconEraser: IconPaths = ['M4 7V4h16v3', 'M5 20h6', 'M13 4 8 20', 'M15 15l5 5', 'M20 15l-5 5'];
const iconUndo: IconPaths = ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'];
const iconRedo: IconPaths = ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'];

/** The icons the toolbar draws beside the kit's own. */
const TOOLBAR_ICONS: IconSet = {
  bold: iconBold,
  italic: iconItalic,
  underline: iconUnderline,
  strike: iconStrike,
  listBullets: iconListBullets,
  listOrdered: iconListOrdered,
  indent: iconIndent,
  outdent: iconOutdent,
  link: iconLink,
  eraser: iconEraser,
  undo: iconUndo,
  redo: iconRedo,
};

/** Registers the toolbar's icons - each only where the site has none of that name: a site's own drawing of one stays. */
export function registerRichTextIcons(icons: AnotokiIcons): void {
  icons.register(Object.fromEntries(Object.entries(TOOLBAR_ICONS).filter(([name]) => !icons.has(name))));
}
