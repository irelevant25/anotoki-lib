import { ChangeDetectionStrategy, Component, EnvironmentProviders, Provider, inject } from '@angular/core';
import { ANOTOKI_AUTH_BROWSER, ANOTOKI_AUTH_CLIENT_FACTORY, AnotokiAuth, AnotokiAuthEnvironment, AnotokiAuthError, AnotokiAuthOptions, AuthBrowser, provideAnotokiAuth } from '@anotoki/lib/auth';
import { SignInFailureComponent } from '@anotoki/lib/auth/screens';
import { FakeAuthClient } from '@anotoki/lib/auth/testing';
import { TranslationService } from '@anotoki/lib/translations';

/**
 * The sign-in failure's screen on a route of the site's own, as a site routes
 * it (the auth module's `failureRoute`): a sign-in that came back without one -
 * ?code=access_denied by default, or state_mismatch, storage_unavailable,
 * server_error, unavailable (no sign-in to be had) - in the page's language
 * (?lang=sk). The auth module is the route's own here, with an IAM in memory:
 * the showcase signs nobody in.
 */
@Component({
  selector: 'show-sign-in-demo',
  imports: [SignInFailureComponent],
  templateUrl: './sign-in-demo.component.html',
  styleUrl: './sign-in-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInDemoComponent {}

/** The route's own auth module: a failed sign-in of the code the address names. */
export function signInDemoProviders(): (Provider | EnvironmentProviders)[] {
  const code = new URLSearchParams(location.search).get('code') ?? 'access_denied';
  const browser: AuthBrowser = {
    isBrowser: true,
    cookie: () => '',
    topLevel: () => true,
    prerendering: () => false,
    origin: () => location.origin,
    path: () => location.pathname + location.search,
    navigate: (url) => console.info('[showcase] the sign-in would go to', url),
    reload: () => console.info('[showcase] the page would load afresh'),
    now: () => Date.now(),
  };
  return [
    AnotokiAuth,
    provideAnotokiAuth(() => {
      const i18n = inject(TranslationService);
      return {
        config: () => (code === 'unavailable' ? null : { issuer: 'https://iam.example.test', client_id: 'showcase', login_required: false }),
        language: () => i18n.language(),
        translate: (key) => i18n.libraryWord(key),
        hint: false,
      };
    }),
    {
      provide: ANOTOKI_AUTH_CLIENT_FACTORY,
      useValue: (options: AnotokiAuthOptions, environment: AnotokiAuthEnvironment) => {
        const client = new FakeAuthClient(options, environment);
        const error: AnotokiAuthError = Object.assign(new Error('The IAM said no'), { code });
        client.initResult = { returnTo: '/', error, silent: false };
        return client;
      },
    },
    { provide: ANOTOKI_AUTH_BROWSER, useValue: browser },
  ];
}
