import { AnotokiIcons, IconSet } from '@anotoki/lib/ui';
import { iconArrowUp, iconDatabase, iconDownload, iconLanguages, iconMail, iconTrash, iconUndo } from '@anotoki/lib/ui/icons';

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
