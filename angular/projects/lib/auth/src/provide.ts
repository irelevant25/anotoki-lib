import { EnvironmentProviders, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { ANOTOKI_AUTH_CONFIG, AnotokiAuthConfig } from './config';
import { AccountPreferences } from './preferences';

/**
 * Configures the module. The factory runs in an injection context, so it can
 * inject the site's own services; so do the functions it gives.
 *
 * With `preferences`, the site's theme, dates and language follow the account
 * from the start (AccountPreferences).
 */
export function provideAnotokiAuth(factory: () => AnotokiAuthConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ANOTOKI_AUTH_CONFIG, useFactory: factory },
    provideEnvironmentInitializer(() => {
      if (inject(ANOTOKI_AUTH_CONFIG).preferences) {
        inject(AccountPreferences);
      }
    }),
  ]);
}
