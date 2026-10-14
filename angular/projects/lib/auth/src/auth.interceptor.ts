import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, defer, finalize, from, switchMap, tap, throwError } from 'rxjs';
import { AnotokiAuth } from './auth.service';
import { ANOTOKI_AUTH_BROWSER, ANOTOKI_AUTH_CONFIG, AnotokiAuthConfig, DEFAULT_PREFIXES, DEFAULT_SKIP, VisitorKeyStore } from '@anotoki/lib/auth/core';
import { ANOTOKI_ERROR_REPORT } from '@anotoki/lib/error-report/marker';
import { CARRIES_VISITOR_KEY, Caller, ISSUED_AS, VISITOR_KEY_HEADER } from './issued-as';
import { SavesInFlight } from './saves-in-flight';

/**
 * Who a request to the site's own API is (its prefixes, of this origin; never
 * another host's - a token or a key sent there is handed to a stranger), decided
 * when it is issued: its ISSUED_AS, or else what the page is shown as as it is
 * handed over (AnotokiAuth.caller()), never whether a token happens to be there
 * when it leaves (Japanese Academy's interceptor, for every site):
 *
 * - **A person's**: the access token. When there is none to send (the session
 *   ended, a refresh failed, somebody else signed in in another tab) the request
 *   is **never sent**: it fails here as a 401 sign_in_required - it never goes
 *   out as a visitor's, and never makes one. A 401 to a token that looked good:
 *   one fresh token, one retry - for the same person only. A visitor key is
 *   taken off (but on the move, CARRIES_VISITOR_KEY); an answer that brings one
 *   fails as a 502 - the server never saw the token, so the save is not theirs.
 * - **A visitor's**, while the site lets visitors in, under the visitor
 *   prefixes: the key this browser holds now, never a token. A first save that
 *   makes a visitor goes alone, the others waiting for the key it brings (when
 *   the site's store and makesVisitor say how). A key an answer brings is kept;
 *   a 401 visitor_unknown forgets the key that was sent (only while it is still
 *   the one held) and tries once more with what the browser holds then; a 401
 *   sign_in_required says the site requires signing in now
 *   (AnotokiAuth.noteSignInRequired(): the key stays).
 * - **Nobody's**: neither.
 *
 * Every write (anything but GET and HEAD) is counted while it is on its way
 * (SavesInFlight): a sign-in waits for them before it leaves the page. The
 * site's own headers (`headers`) go on every request it handles.
 *
 * A report of the page's own error (ANOTOKI_ERROR_REPORT, @anotoki/lib/error-report)
 * is sent as any request is - a person's with the token (or, with none to send,
 * not at all), a visitor's with the key - and its failure is handed back as it
 * came: no fresh token and no retry, no page following a session that ended (no
 * sign-in, nothing cleared, no reload), no key forgotten, no sign-in noted as
 * required. A report is no request to sign in again for.
 */
export const anotokiAuthInterceptor: HttpInterceptorFn = (original, next) => {
  const config = inject(ANOTOKI_AUTH_CONFIG);
  const browser = inject(ANOTOKI_AUTH_BROWSER);
  const path = apiPath(original.url, browser.origin(), config);
  if (path === null) {
    return next(original);
  }
  const auth = inject(AnotokiAuth);
  const saves = inject(SavesInFlight);

  let request = original;
  const extra = config.headers?.() ?? {};
  if (Object.keys(extra).length > 0) {
    request = request.clone({ setHeaders: extra });
  }
  const issued = original.context.get(ISSUED_AS);
  const caller: Caller = issued === null || issued === 'caller' ? auth.caller() : issued;
  const report = original.context.get(ANOTOKI_ERROR_REPORT);

  let sent: Observable<HttpEvent<unknown>>;
  if (caller === 'person') {
    sent = asPerson(request, next, auth, report);
  } else if (caller === 'visitor') {
    const prefixes = config.api?.visitorPrefixes;
    const visitorPath = prefixes === undefined || prefixes.some((prefix) => under(path, prefix));
    sent = asVisitor(request, next, auth, visitorPath ? auth.visitors() : null, config, false, report);
  } else {
    sent = next(bare(request));
  }

  return counted(request, sent, saves);
};

/**
 * The path of a request of the site's API - same origin, under a prefix, not skipped - or null.
 * A skip ending with / skips what is under it; any other is one path (its query aside).
 */
export function apiPath(url: string, origin: string, config: Pick<AnotokiAuthConfig, 'api' | 'config'>): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, origin + '/');
  } catch {
    return null;
  }
  if (parsed.origin !== origin) {
    return null;
  }
  const path = parsed.pathname;
  const prefixes = config.api?.prefixes ?? DEFAULT_PREFIXES;
  if (!prefixes.some((prefix) => path.startsWith(prefix))) {
    return null;
  }
  const skip = [...(config.api?.skip ?? DEFAULT_SKIP), ...(typeof config.config === 'string' ? [config.config.split(/[?#]/)[0]] : [])];
  if (skip.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry))) {
    return null;
  }
  return path;
}

/** Whether a path is the prefix or under it (/api/surveys: /api/surveys and /api/surveys/12, never /api/surveysx). */
function under(path: string, prefix: string): boolean {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  return path === base || path.startsWith(base + '/');
}

/**
 * A person's request: with the token, or not at all. `report`: an error report's - with the token as any, its
 * failure handed back as it came (no fresh token, no retry, the page not told to follow).
 */
function asPerson(request: HttpRequest<unknown>, next: HttpHandlerFn, auth: AnotokiAuth, report: boolean): Observable<HttpEvent<unknown>> {
  const carriesKey = request.context.get(CARRIES_VISITOR_KEY);
  if (!carriesKey) {
    request = request.clone({ headers: request.headers.delete(VISITOR_KEY_HEADER) });
  }
  return from(auth.token()).pipe(
    switchMap((token) => {
      if (!token) {
        if (!report) {
          auth.refused();
        }
        return throwError(() => notSignedIn(request));
      }
      const whose = auth.subject();
      const send = (bearer: string): Observable<HttpEvent<unknown>> =>
        next(request.clone({ setHeaders: { Authorization: `Bearer ${bearer}` } })).pipe(
          tap((event) => {
            if (!carriesKey && event instanceof HttpResponse && event.headers.has(VISITOR_KEY_HEADER)) {
              console.error("[anotoki auth] a visitor key in the answer to a person's request: not kept, and the request failed", request.url);
              throw madeVisitor(request, event);
            }
          }),
        );
      if (report) {
        return send(token);
      }
      return send(token).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
            return throwError(() => error);
          }
          return from(auth.refresh(token)).pipe(
            switchMap((renewed) => {
              if (!renewed || renewed === token || auth.subject() !== whose) {
                auth.refused();
                return throwError(() => error);
              }
              return send(renewed);
            }),
          );
        }),
      );
    }),
  );
}

/**
 * A visitor's request: with the key held as it leaves, if any; with no key, behind the first save that may
 * make the visitor. `retried`: this is the one try again after a key the server no longer knew. `report`: an
 * error report's - with the key as any, its failure handed back as it came (no key forgotten, no retry, no
 * sign-in noted as required).
 */
function asVisitor(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AnotokiAuth,
  store: VisitorKeyStore | null,
  config: AnotokiAuthConfig,
  retried: boolean,
  report: boolean,
): Observable<HttpEvent<unknown>> {
  const plain = bare(request);
  if (store === null || auth.loginRequired()) {
    return report
      ? next(plain)
      : next(plain).pipe(
          catchError((error: unknown) => {
            refusedAsVisitor(error, auth, store, null);
            return throwError(() => error);
          }),
        );
  }

  const send = (sent: HttpRequest<unknown>, key: string | null): Observable<HttpEvent<unknown>> => {
    const answered = next(sent).pipe(
      tap((event) => {
        const made = !key && event instanceof HttpResponse ? event.headers.get(VISITOR_KEY_HEADER) : null;
        if (made) {
          store.remember(made);
        }
      }),
    );
    return report
      ? answered
      : answered.pipe(
          catchError((error: unknown) => {
            if (refusedAsVisitor(error, auth, store, key) === 'forgotten' && !retried) {
              return asVisitor(request, next, auth, store, config, true, report);
            }
            return throwError(() => error);
          }),
        );
  };

  return defer(() => {
    const key = store.current();
    if (key) {
      return send(plain.clone({ setHeaders: { [VISITOR_KEY_HEADER]: key } }), key);
    }
    const pending = store.firstSave?.() ?? null;
    if (pending) {
      // Another request may be making the visitor right now: after its answer, with the key it brought.
      return from(pending).pipe(switchMap(() => asVisitor(request, next, auth, store, config, retried, report)));
    }
    if (store.beginFirstSave && config.makesVisitor?.(request)) {
      const done = store.beginFirstSave();
      return send(plain, null).pipe(finalize(done));
    }
    return send(plain, null);
  });
}

/** A visitor's 401: sign-in required now (the key stays), or a key the server no longer knows (forgotten, when it was the one sent). */
function refusedAsVisitor(error: unknown, auth: AnotokiAuth, store: VisitorKeyStore | null, key: string | null): 'forgotten' | null {
  if (error instanceof HttpErrorResponse && error.status === 401) {
    const code = codeOf(error);
    if (code === 'sign_in_required') {
      auth.noteSignInRequired();
    } else if (code === 'visitor_unknown' && key && store) {
      store.forget(key, true);
      return 'forgotten';
    }
  }
  return null;
}

/** Neither a token nor a key. */
function bare(request: HttpRequest<unknown>): HttpRequest<unknown> {
  return request.clone({ headers: request.headers.delete('Authorization').delete(VISITOR_KEY_HEADER) });
}

/** A write, counted from the moment it is handed over until it has its answer (or fails, or is dropped). */
function counted(request: HttpRequest<unknown>, sent: Observable<HttpEvent<unknown>>, saves: SavesInFlight): Observable<HttpEvent<unknown>> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return sent;
  }
  return defer(() => {
    const end = saves.begin();
    return sent.pipe(finalize(end));
  });
}

/** What a person's request with no token to send answers, without being sent: what the API would say. */
function notSignedIn(request: HttpRequest<unknown>): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 401,
    statusText: 'Unauthorized',
    url: request.urlWithParams,
    error: { code: 'sign_in_required', message: 'Please sign in.' },
  });
}

/**
 * A person's request answered with a visitor key: the server never saw its token (a host that drops
 * Authorization) and kept the save under a new visitor nobody holds the key to. Not this person's save:
 * it fails, so the page says it was not saved instead of going on as if it were.
 */
function madeVisitor(request: HttpRequest<unknown>, answer: HttpResponse<unknown>): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 502,
    statusText: 'Bad Gateway',
    url: answer.url ?? request.urlWithParams,
    error: { code: 'server_error', message: 'The server did not get the sign-in token: this was not saved for you.' },
  });
}

/** The API's own code in a refusal, or null. */
function codeOf(error: HttpErrorResponse): string | null {
  let body: unknown = error.error;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : null;
}
