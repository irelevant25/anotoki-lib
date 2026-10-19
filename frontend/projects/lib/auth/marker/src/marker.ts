import { HttpContext, HttpContextToken } from '@angular/common/http';

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
 * Whom a request is for, when its maker says so: a Caller; `caller` - whoever the page is shown to as the request
 * is issued (AnotokiAuth.caller()); or `anybody` - a request the server takes from anybody (the feedback form's
 * message): the person's, with the token, while somebody is signed in; the visitor's, with the key, while the page
 * is shown to a visitor; nobody's otherwise - never refused for want of a token, and never one that makes the page
 * follow a session or a sign-in (its failure is its maker's to say). A request that does not say is decided as
 * `caller`, by anotokiAuthInterceptor as it is handed over - which, for HttpClient, is the moment it is issued -
 * never from whether a token happens to be there when it leaves.
 *
 * An entry point of its own (@anotoki/lib/auth/marker): a request's maker names it without the auth module - the
 * feedback form, in a site that may sign in or not - and a site's build places whole files in its chunks.
 * @anotoki/lib/auth names it too, where a site has always taken it.
 *
 * Marked pure, as every top-level `new` of the library but an InjectionToken: a site's build keeps one it is not
 * told is pure, used or not.
 */
export const ISSUED_AS = /* @__PURE__ */ new HttpContextToken<Caller | 'caller' | 'anybody' | null>(() => null);

/** A request's context saying whom it is for. */
export function issuedAs(caller: Caller | 'caller' | 'anybody', context: HttpContext = new HttpContext()): HttpContext {
  return context.set(ISSUED_AS, caller);
}
