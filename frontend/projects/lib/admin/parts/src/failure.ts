import { HttpErrorResponse } from '@angular/common/http';
import { AdminFailure } from '@anotoki/lib/admin';

/** A JSON object from an error's body, which may also arrive as text; null otherwise. */
function jsonObject(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/**
 * A failed request, read whatever the site's HTTP layer made of it: Angular's
 * HttpErrorResponse - its body any site's error shape: the library's
 * `{code, message, ...extra}`, the IAM's `{error, code}` - or a site's own
 * error object that already says status, code and message (the IAM's
 * interceptor turns every failure into one).
 */
export function readFailure(error: unknown): AdminFailure {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { status: 0, code: 'network', message: '', details: {} };
    }
    const body = jsonObject(error.error);
    const code = typeof body?.['code'] === 'string' ? (body['code'] as string) : error.status >= 500 ? 'server_error' : 'unknown';
    const said = [body?.['message'], body?.['error']].find((value): value is string => typeof value === 'string' && value !== '');
    const details: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(body ?? {})) {
      if (name !== 'code' && name !== 'message' && name !== 'error') {
        details[name] = value;
      }
    }
    return { status: error.status, code, message: said ?? '', details };
  }
  const own = error as { status?: unknown; code?: unknown; message?: unknown; details?: unknown } | null;
  if (own && typeof own === 'object' && typeof own.status === 'number' && typeof own.code === 'string') {
    return {
      status: own.status,
      code: own.code,
      message: typeof own.message === 'string' ? own.message : '',
      details: own.details && typeof own.details === 'object' ? (own.details as Record<string, unknown>) : {},
    };
  }
  return { status: -1, code: 'unknown', message: error instanceof Error ? error.message : '', details: {} };
}

/** The pages' own words for a failure: the server's sentence (English, and specific) where it gave one. */
export function defaultFailureText(failure: AdminFailure): string {
  if (failure.status === 0) {
    return 'The server could not be reached. Check the connection and try again.';
  }
  if (failure.status === 401) {
    return 'The sign-in has ended. Sign in again, then try once more.';
  }
  if (failure.message) {
    return failure.message;
  }
  if (failure.status === 403) {
    return 'You may not do this: the site keeps it for its administrators.';
  }
  if (failure.status === 404) {
    return 'It is not there any more.';
  }
  if (failure.status === 413) {
    return 'That is more than the server takes at once.';
  }
  if (failure.status === 429) {
    return 'That is a lot at once. Wait a moment, then try again.';
  }
  if (failure.status >= 500) {
    return 'Something went wrong on the server. Try again; the error log says more.';
  }
  return 'The request failed.';
}

/** Whether the server took longer than the connection waits (a proxy's 502, 504, Cloudflare's 524) or the answer never came: the work may still be running. */
export function mayStillRun(failure: AdminFailure): boolean {
  return failure.status === 0 || failure.status === 502 || failure.status === 504 || failure.status === 524;
}

/** A detail of a failure that is a number (`retry_after`, `max`), else null. */
export function failureNumber(failure: AdminFailure, name: string): number | null {
  const value = failure.details[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
