import { EnvironmentProviders, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { provideLibraryWords } from '@anotoki/lib/ui/config';
import { SIGN_IN_LIBRARY_WORDS } from '@anotoki/lib/words/sign-in';
import { ANOTOKI_AUTH_CONFIG, AnotokiAuthConfig } from './config';
import { AccountPreferences } from './preferences';

/**
 * Configures the module. The factory runs in an injection context, so it can
 * inject the site's own services; so do the functions it gives.
 *
 * With `preferences`, the site's theme, dates and language follow the account
 * from the start (AccountPreferences).
 *
 * It registers the sign-in page's words (`anotoki.signIn.*`) with the
 * translations module: they reach a site's words with this module, and with
 * nothing else.
 */
export function provideAnotokiAuth(factory: () => AnotokiAuthConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ANOTOKI_AUTH_CONFIG, useFactory: factory },
    provideLibraryWords(SIGN_IN_LIBRARY_WORDS),
    provideEnvironmentInitializer(() => {
      if (inject(ANOTOKI_AUTH_CONFIG).preferences) {
        inject(AccountPreferences);
      }
    }),
  ]);
}
