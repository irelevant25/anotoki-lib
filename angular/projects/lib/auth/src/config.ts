import { InjectionToken } from '@angular/core';
import { AnotokiAuthClient, AnotokiAuthEnvironment, AnotokiAuthOptions } from '@anotoki/lib/auth/core';
import { createAuthClient } from './client/oidc-client';

/** Makes the IAM client: createAuthClient, which a site's specs replace (@anotoki/lib/auth/testing). */
export const ANOTOKI_AUTH_CLIENT_FACTORY = new InjectionToken<(options: AnotokiAuthOptions, environment: AnotokiAuthEnvironment) => AnotokiAuthClient>('ANOTOKI_AUTH_CLIENT_FACTORY', {
  providedIn: 'root',
  factory: () => createAuthClient,
});
