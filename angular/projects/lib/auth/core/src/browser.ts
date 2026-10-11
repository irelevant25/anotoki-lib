import { DOCUMENT, InjectionToken, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * What the module asks of the browser beyond the client's storage - a token
 * of its own only so the tests can stand in for it (jsdom has no navigation,
 * no frames, no prerendering); not part of the public API.
 */
export interface AuthBrowser {
  /** A real browser - not a server rendering the page. */
  readonly isBrowser: boolean;
  /** document.cookie: what the module reads of it is the IAM's sign-in hint, and only that. */
  cookie(): string;
  /** The page is the top window, not in a frame. */
  topLevel(): boolean;
  /** The page is being prerendered (Speculation Rules): nobody is looking yet. */
  prerendering(): boolean;
  /** The page's origin (https://genshin.anotoki.eu). */
  origin(): string;
  /** The path, query and fragment the page is at. */
  path(): string;
  /** Leaves the page for $url. */
  navigate(url: string): void;
  /** Loads the page afresh. */
  reload(): void;
  now(): number;
}

export const ANOTOKI_AUTH_BROWSER = new InjectionToken<AuthBrowser>('anotoki auth: the browser', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    const window = document.defaultView;
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID)) && window !== null;
    return {
      isBrowser,
      cookie: () => (isBrowser ? document.cookie : ''),
      topLevel: () => {
        try {
          return window !== null && window.top === window;
        } catch {
          // A frame of another origin cannot even ask.
          return false;
        }
      },
      prerendering: () => (document as Document & { prerendering?: boolean }).prerendering === true,
      origin: () => window?.location.origin ?? '',
      path: () => (window ? window.location.pathname + window.location.search + window.location.hash : '/'),
      navigate: (url: string) => window?.location.assign(url),
      reload: () => window?.location.reload(),
      now: () => Date.now(),
    };
  },
});
