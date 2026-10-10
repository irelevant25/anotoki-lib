/*
 * @anotoki/lib/auth/testing - the auth module for a site's specs, without an
 * IAM: an in-memory client (FakeAuthClient), and the providers that put it and
 * a recording browser in place (provideTestAnotokiAuth). The PHP half's
 * counterpart is Anotoki\Lib\Auth\Testing (TestIam and the stand-in IAM).
 */

export type { TestUser } from './fake-auth-client';
export { FakeAuthClient, testUser } from './fake-auth-client';
export type { TestAnotokiAuth, TestAnotokiAuthOptions } from './provide-test-auth';
export { provideTestAnotokiAuth, testAnotokiAuth } from './provide-test-auth';
