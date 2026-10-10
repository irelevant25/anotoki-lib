import { EnvironmentProviders, Provider } from '@angular/core';
import { ANOTOKI_AUTH_BROWSER, ANOTOKI_AUTH_CLIENT_FACTORY, AnotokiAuthConfig, AuthBrowser, VisitorKeyStore, provideAnotokiAuth } from '@anotoki/lib/auth';
import { FakeAuthClient, TestUser } from './fake-auth-client';

export interface TestAnotokiAuthOptions {
  /** Who is signed in when the test starts; null or missing: nobody. */
  user?: TestUser | null;
  /** The signed-in person's roles (ID token's roles); default ['MEMBER']. */
  roles?: string[];
  /** Whether the site requires signing in; default true. */
  loginRequired?: boolean;
  /** Whether the IAM knows the site; default true. */
  signInAvailable?: boolean;
  /** The site's visitor key store; default none. */
  visitors?: VisitorKeyStore | null;
  /** The hint cookie's document.cookie (default ''): the test browser's. The hint is off unless this is given. */
  cookie?: string;
  /** The rest of the module's configuration, over the test's. */
  config?: Partial<AnotokiAuthConfig>;
}

/** What a test sees of the module's browser and client: the navigations, the reloads, the client made. */
export interface TestAnotokiAuth {
  readonly browser: AuthBrowser & { cookies: string; navigations: string[]; reloads: number };
  /** The client the module made (after AnotokiAuth.init()). */
  client: FakeAuthClient | null;
}

/**
 * The module for a site's specs, without an IAM: a boot configuration of the
 * test's, the in-memory FakeAuthClient, and a browser that only records where
 * it was sent. Then, in the test: `await TestBed.inject(AnotokiAuth).init()`
 * (TestBed does not wait for an initializer that returns a promise).
 *
 *   const auth = testAnotokiAuth();
 *   TestBed.configureTestingModule({ providers: [...provideTestAnotokiAuth({ user: { sub: '7', roles: ['MEMBER', 'ADMIN'] } }, auth), provideHttpClient()] });
 *   await TestBed.inject(AnotokiAuth).init();
 *   auth.client?.signOut();                 // another tab signs out
 */
export function provideTestAnotokiAuth(options: TestAnotokiAuthOptions = {}, handle: TestAnotokiAuth = testAnotokiAuth(options.cookie)): (Provider | EnvironmentProviders)[] {
  const user = options.user ? { roles: options.roles ?? ['MEMBER'], ...options.user } : null;
  return [
    provideAnotokiAuth(() => ({
      config: () => ({
        issuer: 'https://iam.test',
        client_id: 'test-site',
        login_required: options.loginRequired ?? true,
        sign_in_available: options.signInAvailable ?? true,
      }),
      visitors: () => options.visitors ?? null,
      hint: options.cookie === undefined ? false : {},
      ...options.config,
    })),
    {
      provide: ANOTOKI_AUTH_CLIENT_FACTORY,
      useValue: (clientOptions: ConstructorParameters<typeof FakeAuthClient>[0], environment: ConstructorParameters<typeof FakeAuthClient>[1]) =>
        (handle.client = new FakeAuthClient(clientOptions, environment, user)),
    },
    { provide: ANOTOKI_AUTH_BROWSER, useValue: handle.browser },
  ];
}

/** A test's handle on the browser and the client; its cookies can be changed between steps. */
export function testAnotokiAuth(cookies = ''): TestAnotokiAuth {
  const browser = {
    cookies,
    navigations: [] as string[],
    reloads: 0,
    isBrowser: true,
    cookie: () => browser.cookies,
    topLevel: () => true,
    prerendering: () => false,
    origin: () => location.origin,
    path: () => location.pathname + location.search + location.hash,
    navigate: (url: string) => {
      browser.navigations.push(url);
    },
    reload: () => {
      browser.reloads++;
    },
    now: () => Date.now(),
  };
  return { browser, client: null };
}
