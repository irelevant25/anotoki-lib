import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';

// The family's icons this page draws, its own copies (the same paths as @anotoki/lib/ui/icons, a spec holds them
// to it): never imported from there - a site that loads ui/icons up front for its own would carry the lazy page's
// icons in its first load, one file being one chunk.
const iconArrowUp: IconPaths = ['M12 19V5', 'M5 12l7-7 7 7'];
const iconDatabase: IconPaths = ['M3 5a9 3 0 1 0 18 0a9 3 0 1 0-18 0', 'M3 5v14a9 3 0 0 0 18 0V5', 'M3 12a9 3 0 0 0 18 0'];
const iconDownload: IconPaths = ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'];
const iconLanguages: IconPaths = ['M5 8l6 6', 'M4 14l6-6 2-3', 'M2 5h12', 'M7 2h1', 'M22 22l-5-10-5 10', 'M14 18h6'];
const iconMail: IconPaths = ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z', 'M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'];
const iconTrash: IconPaths = ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'];
const iconUndo: IconPaths = ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'];

/** The icons the two pages draw beside the kit's own. */
const PAGE_ICONS: IconSet = {
  arrowUp: iconArrowUp,
  database: iconDatabase,
  download: iconDownload,
  languages: iconLanguages,
  mail: iconMail,
  trash: iconTrash,
  undo: iconUndo,
};

/** Registers the pages' icons - each only where the site has none of that name: a site's own drawing of one stays. */
export function registerPageIcons(icons: AnotokiIcons): void {
  icons.register(Object.fromEntries(Object.entries(PAGE_ICONS).filter(([name]) => !icons.has(name))));
}
