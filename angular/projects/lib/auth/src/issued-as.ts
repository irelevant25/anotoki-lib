import { HttpContext, HttpContextToken } from '@angular/common/http';

/** The header a visitor's key travels in, both ways. */
export const VISITOR_KEY_HEADER = 'X-Visitor-Key';

/**
 * Whom a request of the site's own API is for:
 *
 *   person    the person signed in: their token, or the request is never sent (a 401 sign_in_required of
 *             its own) - never a visitor's, never one that makes a visitor
 *   visitor   the browser's visitor: the visitor key while visitors are welcome, never a token
 *   nobody    neither key nor token
 */
export type Caller = 'person' | 'visitor' | 'nobody';

/**
 * Whom a request is for, when its maker says so: a Caller, or `caller` -
 * whoever the page is shown to as the request is issued (AnotokiAuth.caller()).
 * A request that does not say is decided the same way, by
 * anotokiAuthInterceptor as it is handed over - which, for HttpClient, is the
 * moment it is issued - never from whether a token happens to be there when it
 * leaves.
 */
export const ISSUED_AS = new HttpContextToken<Caller | 'caller' | null>(() => null);

/**
 * The one request that carries the person's token and the visitor's key
 * together: the move of a visitor's work into the account after a sign-in.
 * The interceptor then adds the token and leaves the key the request set
 * itself; on any other person's request a key is taken off.
 */
export const CARRIES_VISITOR_KEY = new HttpContextToken<boolean>(() => false);

/** A request's context saying whom it is for. */
export function issuedAs(caller: Caller | 'caller', context: HttpContext = new HttpContext()): HttpContext {
  return context.set(ISSUED_AS, caller);
}
