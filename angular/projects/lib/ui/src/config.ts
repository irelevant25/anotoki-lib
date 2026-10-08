import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { AnotokiWordKey, AnotokiWordTable } from './words';

/** One icon: the `d` of each path, on a 24-unit grid, drawn with a stroke (or filled). */
export type IconPaths = readonly string[];

/** Icons by name. */
export type IconSet = Readonly<Record<string, IconPaths>>;

/** What a site tells the kit, through provideAnotokiUi(). Everything is optional. */
export interface AnotokiUiConfig {
  /**
   * The language on the page ('en' in an admin panel): the language the kit's
   * own words are in. A signal works, and is followed. Default 'en'.
   */
  language?: () => string;
  /** Per language, the site's words over the built-in ones: `{ sk: { 'topbar.account': 'Váš anotoki účet' } }`. */
  words?: Readonly<Record<string, AnotokiWordTable>>;
  /**
   * The site's own string for a kit word, or null / '' for the kit's - where a
   * translations module plugs in: `(key) => i18n.has('anotoki.' + key) ? i18n.t('anotoki.' + key) : null`.
   * Signals read here are followed. It comes first, before `words`.
   */
  lookup?: (key: AnotokiWordKey) => string | null | undefined;
  /** Icons the site's own templates name, beside the kit's: `{ trash: iconTrash, piano: [...] }`. */
  icons?: IconSet;
}

export const ANOTOKI_UI_CONFIG = new InjectionToken<AnotokiUiConfig>('ANOTOKI_UI_CONFIG');

/**
 * More icons, from anywhere a provider can be given (a lazy route's own icons):
 * `{ provide: ANOTOKI_ICONS, multi: true, useValue: { trash: iconTrash } }`.
 */
export const ANOTOKI_ICONS = new InjectionToken<readonly IconSet[]>('ANOTOKI_ICONS');

/**
 * Configures the kit. The factory runs in an injection context, so it can
 * inject the site's own services (its translations):
 *
 * ```ts
 * provideAnotokiUi(() => {
 *   const i18n = inject(TranslationService);
 *   return { language: () => i18n.language(), icons: { trash: iconTrash } };
 * })
 * ```
 *
 * Without it every kit word reads English and only the kit's own icons exist.
 */
export function provideAnotokiUi(factory: () => AnotokiUiConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_UI_CONFIG, useFactory: factory }]);
}
