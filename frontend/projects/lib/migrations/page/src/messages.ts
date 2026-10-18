import { HttpErrorResponse } from '@angular/common/http';
import { ɵjsonObject as jsonObject } from '@anotoki/lib/migrations';

/*
 * The Migrations page's own helpers, kept with the page: in @anotoki/lib/migrations
 * they would sit in the gate's file, which a site's first load holds whole.
 */

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

// Marked pure: a site's build keeps a top-level `new` it is not told is pure, whether a date is shown or not.
const DATE_FORMAT = /* @__PURE__ */ new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** '2026-10-06T10:01:02Z' -> '6 Oct 2026, 10:01' (in the browser's time zone). */
export function defaultFormatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}
