import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';
import {
  iconActivity,
  iconArrowUp,
  iconClock,
  iconDatabase,
  iconDownload,
  iconFileText,
  iconFilter,
  iconGrid,
  iconHistory,
  iconImage,
  iconListBullets,
  iconLock,
  iconMail,
  iconMoreHorizontal,
  iconPencil,
  iconRotateCcw,
  iconShieldCheck,
  iconTrash,
} from '@anotoki/lib/ui/icons';

// The few the family's sets lack, drawn the same way (24-unit line icons in the manner of Lucide). Plain strings: no
// function runs when the module loads.
const folder: IconPaths = ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'];
const folderPlus: IconPaths = ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z', 'M12 10v6', 'M9 13h6'];
const upload: IconPaths = ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'];
const music: IconPaths = ['M9 18V5l12-2v13', 'M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M15 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'];
const film: IconPaths = ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z', 'M7 3v18', 'M3 7.5h4', 'M3 12h18', 'M3 16.5h4', 'M17 3v18', 'M17 7.5h4', 'M17 16.5h4'];
const file: IconPaths = ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4'];
const archive: IconPaths = ['M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1z', 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8', 'M10 12h4'];
const maximize: IconPaths = ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'];

/** The icons the admin tools' pages draw beside the kit's own. */
const ADMIN_ICONS: IconSet = {
  activity: iconActivity,
  archive,
  arrowUp: iconArrowUp,
  clock: iconClock,
  database: iconDatabase,
  download: iconDownload,
  file,
  fileText: iconFileText,
  film,
  filter: iconFilter,
  folder,
  folderPlus,
  grid: iconGrid,
  history: iconHistory,
  image: iconImage,
  listBullets: iconListBullets,
  lock: iconLock,
  mail: iconMail,
  maximize,
  moreHorizontal: iconMoreHorizontal,
  music,
  pencil: iconPencil,
  rotateCcw: iconRotateCcw,
  shieldCheck: iconShieldCheck,
  trash: iconTrash,
  upload,
};

/** Registers the pages' icons - each only where the site has none of that name: a site's own drawing of one stays. */
export function registerAdminIcons(icons: AnotokiIcons): void {
  icons.register(Object.fromEntries(Object.entries(ADMIN_ICONS).filter(([name]) => !icons.has(name))));
}
