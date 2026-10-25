import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';

// The family's icons this page draws, its own copies (the same paths as @anotoki/lib/ui/icons, a spec holds them to
// it): never imported from there - a site that loads ui/icons up front for its own would carry the lazy page's icons
// in its first load, one file being one chunk.
const iconKey: IconPaths = ['M2 15.5a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0', 'M21 2l-9.6 9.6', 'M15.5 7.5l3 3L22 7l-3-3'];
const iconLayers: IconPaths = ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'];
const iconMessage: IconPaths = ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'];

const PAGE_ICONS: IconSet = { key: iconKey, layers: iconLayers, message: iconMessage };

/** Registers the page's icons - each only where the site has none of that name: a site's own drawing of one stays. */
export function registerPageIcons(icons: AnotokiIcons): void {
  icons.register(Object.fromEntries(Object.entries(PAGE_ICONS).filter(([name]) => !icons.has(name))));
}
