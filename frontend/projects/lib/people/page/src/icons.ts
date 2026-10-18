import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';

// The family's icons this page draws, its own copies (the same paths as @anotoki/lib/ui/icons, a spec holds them
// to it): never imported from there - a site that loads ui/icons up front for its own would carry the lazy page's
// icons in its first load, one file being one chunk.
const iconUsers: IconPaths = ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'];

/** The icons the page draws beside the kit's own. */
const PAGE_ICONS: IconSet = { users: iconUsers };

/** Registers the page's icons - each only where the site has none of that name: a site's own drawing of one stays. */
export function registerPageIcons(icons: AnotokiIcons): void {
  icons.register(Object.fromEntries(Object.entries(PAGE_ICONS).filter(([name]) => !icons.has(name))));
}
