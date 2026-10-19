/*
 * @anotoki/lib/auth/marker - whom a request is for, and nothing else: ISSUED_AS, the Caller type and issuedAs().
 * What a request's maker sets and anotokiAuthInterceptor reads. Its own entry point so that a request's maker -
 * the feedback form (@anotoki/lib/feedback/form) - names it without the auth module (a site's build places whole
 * files in its chunks, and a site that takes feedback may not sign in at all). It imports nothing of the package.
 * @anotoki/lib/auth re-exports it: a site imports it there.
 */

export type { Caller } from './src/marker';
export { ISSUED_AS, issuedAs } from './src/marker';
