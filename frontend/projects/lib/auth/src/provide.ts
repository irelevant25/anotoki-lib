import { EnvironmentProviders, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { ANOTOKI_AUTH_CONFIG, AnotokiAuthConfig, SignInSession, provideSignInWords } from '@anotoki/lib/auth/core';
import { AnotokiAuth } from './auth.service';
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
    provideSignInWords(),
    // The screens (@anotoki/lib/auth/screens) ask the session through its port, never the service itself.
    { provide: SignInSession, useExisting: AnotokiAuth },
    provideEnvironmentInitializer(() => {
      if (inject(ANOTOKI_AUTH_CONFIG).preferences) {
        inject(AccountPreferences);
      }
    }),
  ]);
}
