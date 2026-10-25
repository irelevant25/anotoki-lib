import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';

// The family's icons the player draws, its own copies (the same paths as @anotoki/lib/ui/icons' iconPlay, iconPause and
// iconStopCircle, a spec holds them to them): never imported from there - a site that loads ui/icons up front for its
// own would carry the player's icons in its first load, one file being one chunk.
const iconPlay: IconPaths = ['M6 3l14 9-14 9z'];
const iconPause: IconPaths = ['M15 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M7 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'];
const iconStopCircle: IconPaths = ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0', 'M10 9h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1z'];

/** The icons the player draws beside the kit's own. */
const PLAYER_ICONS: IconSet = { play: iconPlay, pause: iconPause, stopCircle: iconStopCircle };

/** Registers the player's icons - each only where the site has none of that name: a site's own drawing of one stays. */
export function registerAudioPlayerIcons(icons: AnotokiIcons): void {
  icons.register(Object.fromEntries(Object.entries(PLAYER_ICONS).filter(([name]) => !icons.has(name))));
}
