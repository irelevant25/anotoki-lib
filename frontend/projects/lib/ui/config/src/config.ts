import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { AnotokiWordKey, AnotokiWordTable } from './words';

/** One icon: the `d` of each path, on a 24-unit grid, drawn with a stroke (or filled). */
export type IconPaths = readonly string[];

/** Icons by name. */
export type IconSet = Readonly<Record<string, IconPaths>>;

/** The orders the anotoki account writes a date in - its `date_format` (the IAM's 015): 6.10.2026, 06/10/2026, 10/06/2026, 2026-10-06. */
export type AnotokiDateOrder = 'dmy_dot' | 'dmy_slash' | 'mdy_slash' | 'ymd_dash';

/** The anotoki account's clock - its `time_format`: 24 hours, or 12 with the language's words for am and pm. */
export type AnotokiClock = '24' | '12';

/**
 * How the account writes dates and times - the IAM's `preferences` claim, which every anotoki site follows (the auth
 * module's AccountPreferences.preferences() is one): a part left null, or no choices at all, is the page language's own
 * way. A type alone: nothing of it reaches a bundle.
 */
export interface AnotokiDateChoices {
  readonly date_format?: AnotokiDateOrder | null;
  readonly time_format?: AnotokiClock | null;
}

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
  /**
   * What Intl writes the page's dates and numbers in ('en-GB', 'sk-SK'; 0.11.0) - the translations module's forKit()
   * gives its locale(). Default the language, English as the family writes it (en-GB). A signal is followed.
   */
  locale?: () => string;
  /**
   * The account's date order and clock (0.11.0), which the kit's dates follow (@anotoki/lib/ui/dates): with the auth
   * module `() => inject(AccountPreferences).preferences()`, the IAM its session's. Null, or none given: the page
   * language's own way. A signal is followed.
   */
  dateChoices?: () => AnotokiDateChoices | null;
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
