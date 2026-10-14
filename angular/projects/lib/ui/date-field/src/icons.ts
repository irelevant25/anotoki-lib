import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';

// The family's icon the field draws, its own copy (the same paths as @anotoki/lib/ui/icons' iconCalendar, a spec holds
// it to them): never imported from there - a site that loads ui/icons up front for its own would carry the field's
// icons in its first load, one file being one chunk.
const iconCalendar: IconPaths = ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'];

/** The icons the field draws beside the kit's own. */
const FIELD_ICONS: IconSet = { calendar: iconCalendar };

/** Registers the field's icons - each only where the site has none of that name: a site's own drawing of one stays. */
export function registerDateFieldIcons(icons: AnotokiIcons): void {
  icons.register(Object.fromEntries(Object.entries(FIELD_ICONS).filter(([name]) => !icons.has(name))));
}
