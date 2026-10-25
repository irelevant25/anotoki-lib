import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** What a site tells the site settings' pieces on its pages, through provideAnotokiSiteSettings(). */
export interface AnotokiSiteSettingsConfig {
  /** The public settings' path (the PHP half's SiteSettingsRoutes::public()): '/api/site-settings'. */
  url?: string;
  /** This site's roles, from the token (ADMIN, EDITOR, MEMBER): who sees a page. A signal works, and is followed. */
  roles: () => readonly string[];
  /** Whether somebody is signed in: a page for people signed in. */
  signedIn: () => boolean;
  /**
   * Where the browser remembers the announcement its reader hid - a mark of its words, never the words - so that it
   * stays hidden until they change: the site's own name, 'anotoki-survey:announcement'. The Privacy page names it
   * (the legal facts' storage preset 'announcement').
   */
  storageKey: string;
}

export const ANOTOKI_SITE_SETTINGS_CONFIG = new InjectionToken<AnotokiSiteSettingsConfig>('ANOTOKI_SITE_SETTINGS_CONFIG');

export const DEFAULT_SITE_SETTINGS_URL = '/api/site-settings';

/**
 * Configures the site settings' pieces. The factory runs in an injection context, so it can inject the site's own
 * services (its sign-in):
 *
 * ```ts
 * provideAnotokiSiteSettings(() => {
 *   const auth = inject(AnotokiAuth);
 *   return { roles: () => auth.roles(), signedIn: () => auth.signedIn(), storageKey: 'anotoki-survey:announcement' };
 * }),
 * provideAppInitializer(() => inject(SiteSettings).load()),
 * ```
 */
export function provideAnotokiSiteSettings(factory: () => AnotokiSiteSettingsConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_SITE_SETTINGS_CONFIG, useFactory: factory }]);
}
