import { HttpContextToken } from '@angular/common/http';

// Whom a request is for - ISSUED_AS, the Caller type and issuedAs() - is @anotoki/lib/auth/marker, an entry point of
// its own that a request's maker (the feedback form) names without this module.

/** The header a visitor's key travels in, both ways. */
export const VISITOR_KEY_HEADER = 'X-Visitor-Key';

/**
 * The one request that carries the person's token and the visitor's key
 * together: the move of a visitor's work into the account after a sign-in.
 * The interceptor then adds the token and leaves the key the request set
 * itself; on any other person's request a key is taken off.
 */
export const CARRIES_VISITOR_KEY = /* @__PURE__ */ new HttpContextToken<boolean>(() => false);
