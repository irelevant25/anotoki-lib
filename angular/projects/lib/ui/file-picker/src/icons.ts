import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';

// The family's icons the picker draws, its own copies (the same paths as @anotoki/lib/ui/icons' iconUpload and
// iconFileText, a spec holds them to them): never imported from there - a site that loads ui/icons up front for its
// own would carry the picker's icons in its first load, one file being one chunk.
const iconUpload: IconPaths = ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'];
const iconFileText: IconPaths = ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'];

/** The icons the picker draws beside the kit's own. */
const PICKER_ICONS: IconSet = { upload: iconUpload, fileText: iconFileText };

/** Registers the picker's icons - each only where the site has none of that name: a site's own drawing of one stays. */
export function registerFilePickerIcons(icons: AnotokiIcons): void {
  icons.register(Object.fromEntries(Object.entries(PICKER_ICONS).filter(([name]) => !icons.has(name))));
}
