import { HttpErrorResponse } from '@angular/common/http';

/** A JSON object from a response or error body, which may also arrive as text; null otherwise. */
export function jsonObject(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** What to tell an administrator about a request that failed: the server's message when it gave one. */
export function messageOf(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = jsonObject(error.error)?.['message'];
    if (typeof message === 'string' && message !== '') {
      return message;
    }
    if (error.status === 0) {
      return 'The server could not be reached.';
    }
    return `The server answered ${error.status}${error.statusText ? ' ' + error.statusText : ''}.`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** A URL without its query and fragment, to compare two addresses of one path. */
export function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

/** Whether the router URL `url` is `route` or below it ('/admin/migrations' and '/admin/migrations/x', not '/admin/migrationsx'). */
export function isOnRoute(url: string, route: string): boolean {
  const path = withoutQuery(url);
  const base = route.endsWith('/') && route !== '/' ? route.slice(0, -1) : route;
  return path === base || path.startsWith(base.endsWith('/') ? base : base + '/');
}
