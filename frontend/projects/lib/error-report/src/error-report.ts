import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { EnvironmentProviders, ErrorHandler, Injectable, InjectionToken, Injector, inject, makeEnvironmentProviders } from '@angular/core';
// The mark on the report's own request: an entry point of its own, which an interceptor reads without this file.
import { ANOTOKI_ERROR_REPORT } from '@anotoki/lib/error-report/marker';

/** What a site tells the reporter, through provideAnotokiErrorReport(). */
export interface AnotokiErrorReportConfig {
  /** The site's route for them - Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes::client(): '/api/client-errors' by default. */
  endpoint?: string;
  /** At most this many reports a page load: 5 by default. The console hears of every error. */
  perPage?: number;
  /** The site's own say, after the reporter's rules: false keeps an error to the console. */
  report?: (error: unknown) => boolean;
}

/** One report, as ErrorLogRoutes::client() takes it: every text scrubbed (see describeError()). */
export interface ErrorReport {
  type: string;
  message: string;
  /** The page's path - never its query or its fragment. */
  page: string;
  /** The stack's frames, at most twelve. */
  stack: string[];
}

export const ANOTOKI_ERROR_REPORT_CONFIG = new InjectionToken<AnotokiErrorReportConfig>('ANOTOKI_ERROR_REPORT_CONFIG');

export const DEFAULT_ERROR_REPORT_ENDPOINT = '/api/client-errors';

/** The most characters of a message, and of a frame, a report holds; the most frames. */
const MESSAGE_LIMIT = 1000;
const FRAME_LIMIT = 200;
const FRAMES = 12;
/** The most bytes a report's body takes, 7 KB: under the route's 8 KB (ErrorLogRoutes::CLIENT_BODY_LIMIT). */
const BODY_LIMIT = 7168;
/** A stored value shorter than this is a word ("dark", "en"), not something to take out of a message. */
const STORED_MIN = 8;
/** The most of a text scrubText() reads (the server's Redactor::TEXT_LIMIT). */
const TEXT_LIMIT = 4096;

/**
 * The browser's errors, reported: every error goes to the console as Angular's own ErrorHandler has it, and is
 * reported - once, while the page load's budget lasts - to the site's error log. The report never blocks the page
 * (it is sent after the error is handled), never throws, and never reports itself: an error raised while a report
 * is made, an HTTP failure (the server writes its own, and a visitor's network is not the site's) and the report's
 * own failure are the console's alone. A 429 from the route ends reporting for the page load.
 */
@Injectable()
export class AnotokiErrorReporter extends ErrorHandler {
  private readonly injector = inject(Injector);
  private readonly config = inject(ANOTOKI_ERROR_REPORT_CONFIG, { optional: true }) ?? {};
  private readonly seen = new Set<string>();
  private sent = 0;
  private stopped = false;
  private busy = false;

  override handleError(error: unknown): void {
    try {
      super.handleError(error);
    } catch {
      // A console that cannot be written to: the report still goes.
    }
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const report = this.reportOf(error);
      if (report !== null) {
        setTimeout(() => this.send(report), 0);
      }
    } catch {
      // A report that cannot be made is no error of the page's.
    } finally {
      this.busy = false;
    }
  }

  private reportOf(error: unknown): ErrorReport | null {
    if (this.stopped || this.sent >= (this.config.perPage ?? 5) || error instanceof HttpErrorResponse) {
      return null;
    }
    // The same error again (a template failing on every check) is known before anything is read or scrubbed. The
    // key stays in this page's memory, as the error itself does; it is never sent.
    const part = (value: unknown): string => String(value).slice(0, 400);
    const key = typeof error === 'object' && error !== null ? ['name', 'message', 'stack'].map((name) => part((error as Record<string, unknown>)[name])).join('|') : `${typeof error}|${part(error)}`;
    if (this.seen.has(key) || (this.config.report && this.config.report(error) === false)) {
      return null;
    }
    this.seen.add(key);
    this.sent++;
    return describeError(error, storedValues(), typeof location === 'undefined' ? '/' : location.pathname);
  }

  private send(report: ErrorReport): void {
    if (this.busy || this.stopped || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return;
    }
    this.busy = true;
    try {
      const http = this.injector.get(HttpClient, null);
      http?.post(this.config.endpoint ?? DEFAULT_ERROR_REPORT_ENDPOINT, report, { context: new HttpContext().set(ANOTOKI_ERROR_REPORT, true) }).subscribe({
        error: (failure: unknown) => {
          if (failure instanceof HttpErrorResponse && failure.status === 429) {
            this.stopped = true;
          }
        },
      });
    } catch {
      // An interceptor that threw: the console has the error already.
    } finally {
      this.busy = false;
    }
  }
}

/**
 * Reports the browser's errors to the site's error log (AnotokiErrorReporter, the app's ErrorHandler). With
 * provideBrowserGlobalErrorListeners() - Angular's default since 20 - the errors outside Angular's own code
 * (window's error, a promise nobody caught) arrive too.
 */
export function provideAnotokiErrorReport(config: AnotokiErrorReportConfig = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ANOTOKI_ERROR_REPORT_CONFIG, useValue: config },
    { provide: ErrorHandler, useClass: AnotokiErrorReporter },
  ]);
}

/**
 * An error as a report: its type (an identifier, else "Error"), its message and its frames scrubbed (scrubText()),
 * the page's path with any segment that could be somebody's or a secret replaced. A value thrown that is no Error
 * is named by its kind, never written out - it may hold anything.
 */
export function describeError(error: unknown, stored: readonly string[] = [], path = '/'): ErrorReport {
  let type = 'Error';
  let message = '';
  let stack = '';
  if (typeof error === 'string') {
    message = error;
  } else if (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string') {
    const named = (error as { name?: unknown }).name;
    type = typeof named === 'string' && /^[A-Za-z_$][A-Za-z0-9_$.]{0,63}$/.test(named) ? named : 'Error';
    message = (error as { message: string }).message;
    const frames = (error as { stack?: unknown }).stack;
    stack = typeof frames === 'string' ? frames : '';
  } else {
    message = `A value that is no Error was thrown (${error === null ? 'null' : typeof error})`;
  }

  // A frame as the browsers write one - "at f (url:1:2)", "f@url:1:2", "global code@url:1:2" - never the stack's
  // first line, which repeats the message (and a message's later lines with it). Everything is cut to what a report
  // keeps (or a little more) BEFORE it is scrubbed - a rule run over a megabyte would freeze the page - and loses
  // the run the cut went through (before()).
  const header = message === '' ? type : `${type}: ${message}`;
  const frames = (stack.startsWith(header) ? stack.slice(header.length) : stack)
    .split('\n', 100)
    .map((line) => before(line, FRAME_LIMIT * 2).trim())
    .filter((line) => /^at\s|^[^@]*@\S*:\d+(?::\d+)?$/.test(line))
    .slice(0, FRAMES)
    .map((line) => cut(scrubText(line, stored), FRAME_LIMIT));

  const report: ErrorReport = {
    type,
    message: cut(scrubText(before(message, MESSAGE_LIMIT * 2), stored), MESSAGE_LIMIT) || '(no message)',
    page: scrubPath(before(path, FRAME_LIMIT * 4, '/'), stored),
    stack: frames,
  };
  const size = (each: ErrorReport): number => new TextEncoder().encode(JSON.stringify(each)).length;
  while (report.stack.length > 0 && size(report) > BODY_LIMIT) {
    report.stack.pop();
  }
  if (size(report) > BODY_LIMIT) {
    report.message = cut(report.message, 200);
  }
  return report;
}

/**
 * A text with what could be somebody's or a secret taken out, as the server's Redactor does (it does so again):
 * every value the page keeps in its storage and its cookies, a URL's query and fragment (its line and column
 * kept), a token (a JWT, a Bearer credential, a long run of letters and digits), name=value secrets (a quoted one
 * the text ends inside, to its end), an address. At most its first 4,096 characters are read, as the server's: some
 * rules take time that grows with the square of what they read - and the run the cut went through goes with what is
 * not read (before()).
 */
export function scrubText(text: string, stored: readonly string[] = []): string {
  let out = before(text, TEXT_LIMIT);
  for (const value of stored) {
    out = out.split(value).join('{stored}');
  }
  return out
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s?#'"`<>()]*)[?#][^\s'"`<>()]*?((?::\d+){1,2})?(?=$|[\s'"`<>()])/gi, '$1$2')
    .replace(/\?[A-Za-z0-9_.[\]-]+=[^\s#'"`<>()]*?((?::\d+){1,2})?(?=$|[\s#'"`<>()])/g, '$1')
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '{token}')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 {…}')
    .replace(
      /\b(pass(?:word|wd)?|pwd|secret|client_secret|token|access_token|refresh_token|id_token|api[_-]?key|access[_-]?key|authorization|cookie|session(?:[_-]?id)?|sid|ticket|code_verifier|signature|sig)\b(["']?\s*(?:=>|[=:])\s*)("(?:[^"\\]|\\.)*(?:"|$)|'(?:[^'\\]|\\.)*(?:'|$)|[^\s&,;"']+)/gi,
      '$1$2{…}',
    )
    .replace(/[^\s@<>()[\]{}"',;:/\\]+@[^\s@<>()[\]{}"',;:/\\]+\.[^\s@<>()[\]{}"',;:/\\.]+/g, '{email}')
    .replace(/(?<![A-Za-z0-9_+=-])[A-Za-z0-9_+=-]{24,}(?![A-Za-z0-9_+=-])/g, (run) => (/\d/.test(run) && /[A-Za-z]/.test(run) ? '{token}' : run));
}

/**
 * Every value the page keeps where a script reads it - localStorage, sessionStorage, the cookies, and the texts
 * inside a stored JSON value - of eight characters and more, the longest first: none of them is ever in a report.
 */
export function storedValues(): string[] {
  const values = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === 'string' && value.length >= STORED_MIN && value.length <= 4096 && values.size < 400) {
      values.add(value);
    }
  };
  const walk = (value: unknown, depth: number): void => {
    if (typeof value === 'string') {
      add(value);
    } else if (depth < 4 && typeof value === 'object' && value !== null) {
      for (const each of Object.values(value).slice(0, 100)) {
        walk(each, depth + 1);
      }
    }
  };
  for (const area of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = globalThis[area];
      for (let index = 0; index < Math.min(storage.length, 100); index++) {
        const value = storage.getItem(storage.key(index) ?? '');
        add(value);
        if (value !== null && /^\s*[[{]/.test(value)) {
          try {
            walk(JSON.parse(value), 0);
          } catch {
            // Not JSON after all: kept whole above.
          }
        }
      }
    } catch {
      // Storage the browser keeps shut (a sandboxed frame, a private window): nothing of it to take out.
    }
  }
  try {
    for (const pair of (typeof document === 'undefined' ? '' : document.cookie).split(';')) {
      const value = pair.slice(pair.indexOf('=') + 1).trim();
      add(value);
      try {
        add(decodeURIComponent(value));
      } catch {
        // Not percent-encoded: kept as it is above.
      }
    }
  } catch {
    // No cookies to read.
  }
  return [...values].sort((a, b) => b.length - a.length);
}

/**
 * The page's path without its query and fragment, a stored value in it and each segment that could be somebody's
 * (an address) or a secret (what scrubText() takes out, a long code with digits) replaced by {…}.
 */
function scrubPath(path: string, stored: readonly string[]): string {
  let whole = path.split(/[?#]/)[0] || '/';
  for (const value of stored) {
    whole = whole.split(value).join('{…}');
  }
  const segments = whole
    .split('/')
    .map((segment) => (segment !== '{…}' && (scrubText(segment) !== segment || /@|%40/.test(segment) || (/^[A-Za-z0-9_-]{16,}$/.test(segment) && /\d/.test(segment))) ? '{…}' : segment));
  return cut(segments.join('/'), FRAME_LIMIT);
}

/**
 * A text's first `limit` characters, taken BEFORE it is scrubbed - without the run of characters the cut went
 * through, back to the last white space (`/\S*$/`; a path, to its last `/`): half a token, an address or a stored
 * value is something no rule knows any more, and would be sent as it is. The server does the same
 * (Redactor::text()). Read back a character at a time: in time that grows with the run alone.
 */
function before(text: string, limit: number, separator?: '/'): string {
  if (text.length <= limit) {
    return text;
  }
  const kept = text.slice(0, limit);
  if (separator !== undefined) {
    return kept.slice(0, kept.lastIndexOf(separator) + 1);
  }
  let end = kept.length;
  while (end > 0 && !/\s/.test(kept[end - 1])) {
    end--;
  }
  return kept.slice(0, end);
}

function cut(text: string, limit: number): string {
  const characters = Array.from(text);
  return characters.length <= limit ? text : characters.slice(0, limit - 1).join('') + '…';
}
