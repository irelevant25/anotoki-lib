/*
 * @anotoki/lib/auth/screens - the auth module's two screens: the callback page (<anotoki-auth-callback>) and the
 * screen of a sign-in that failed (<anotoki-sign-in-failure>). An entry point of their own, so a site's first load
 * does not carry them: a route loads them as it is opened -
 *
 *   { path: 'auth/callback', loadComponent: () => import('@anotoki/lib/auth/screens').then((m) => m.AuthCallbackComponent) }
 *
 * They ask the session through SignInSession (provideAnotokiAuth() provides it), never the service itself.
 * @anotoki/lib/auth still names them, for a route of before - which then carries them in the first load.
 */

export { AuthCallbackComponent } from './src/callback/auth-callback.component';
export { SignInFailureComponent } from './src/failure/sign-in-failure.component';
