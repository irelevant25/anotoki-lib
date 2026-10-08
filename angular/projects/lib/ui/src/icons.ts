import { Injectable, inject, isDevMode } from '@angular/core';
import { ANOTOKI_ICONS, ANOTOKI_UI_CONFIG, IconPaths, IconSet } from './config';

/** A circle as a path, so every icon is a list of `d` strings and nothing else. */
export function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

/** A rounded rectangle as a path. */
export function rect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

const SHIELD = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';

/**
 * The icons the kit's own components draw - 24-unit line icons in the manner
 * of Lucide, as paths. Paths only, bound with `[attr.d]`: an icon is data, so
 * nothing has to get past the sanitizer, and there is no icon font and no
 * sprite request. The family's other icons are in @anotoki/lib/ui/icons, one
 * constant each, for a site to register what its own templates name.
 */
export const KIT_ICONS = {
  sun: [circle(12, 12, 4), 'M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M6.34 17.66l-1.41 1.41', 'M19.07 4.93l-1.41 1.41'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  monitor: [rect(2, 3, 20, 14, 2), 'M8 21h8', 'M12 17v4'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', circle(12, 7, 4)],
  shield: [SHIELD],
  logIn: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
  logOut: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  check: ['M20 6 9 17l-5-5'],
  alert: ['M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  info: [circle(12, 12, 10), 'M12 16v-4', 'M12 8h.01'],
  checkCircle: [circle(12, 12, 10), 'M9 12l2 2 4-4'],
  xCircle: [circle(12, 12, 10), 'M15 9l-6 6', 'M9 9l6 6'],
  eye: ['M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0', circle(12, 12, 3)],
  eyeOff: [
    'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68',
    'M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61',
    'M14.12 14.12a3 3 0 1 1-4.24-4.24',
    'M2 2l20 20',
  ],
  copy: [rect(8, 8, 14, 14, 2), 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  arrowLeft: ['M12 19l-7-7 7-7', 'M19 12H5'],
  externalLink: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  sparkle: ['M12 2.5l1.9 7.6 7.6 1.9-7.6 1.9L12 21.5l-1.9-7.6L2.5 12l7.6-1.9z'],
  search: [circle(11, 11, 8), 'M21 21l-4.3-4.3'],
  plus: ['M5 12h14', 'M12 5v14'],
} satisfies Record<string, string[]>;

/** The name of one of the kit's own icons. */
export type KitIconName = keyof typeof KIT_ICONS;

/**
 * The icons <anotoki-icon> can draw: the kit's own, then any ANOTOKI_ICONS
 * provider, then the site's (provideAnotokiUi's `icons`) - a later one of the
 * same name wins, so a site can redraw a kit icon. An unknown name draws
 * nothing, and says so once in development.
 */
@Injectable({ providedIn: 'root' })
export class AnotokiIcons {
  private readonly icons = new Map<string, IconPaths>(Object.entries(KIT_ICONS));
  private readonly warned = new Set<string>();

  constructor() {
    for (const set of inject(ANOTOKI_ICONS, { optional: true }) ?? []) {
      this.register(set);
    }
    const own = inject(ANOTOKI_UI_CONFIG, { optional: true })?.icons;
    if (own) {
      this.register(own);
    }
  }

  /** Adds icons (a lazy page's own, say); a name already there is drawn the new way. */
  register(icons: IconSet): void {
    for (const [name, paths] of Object.entries(icons)) {
      this.icons.set(name, paths);
    }
  }

  has(name: string): boolean {
    return this.icons.has(name);
  }

  /** An icon's paths; null (and a warning, once, in development) for a name nobody registered. */
  get(name: string): IconPaths | null {
    const paths = this.icons.get(name);
    if (paths) {
      return paths;
    }
    if (isDevMode() && !this.warned.has(name)) {
      this.warned.add(name);
      console.warn(`<anotoki-icon>: no icon is called "${name}". Register it - provideAnotokiUi(() => ({ icons: { ${name}: [...] } })) - or use one of the kit's.`);
    }
    return null;
  }
}
