/*
 * The browser's storage, as the family uses it: never throwing. localStorage
 * and sessionStorage can be missing, switched off, full or refused (a private
 * window, an embedded frame) - a page is never broken over it: what is not
 * kept is held in memory for as long as the page lives.
 */

function store(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return globalThis[kind] ?? null;
  } catch {
    return null;
  }
}

function read(kind: 'localStorage' | 'sessionStorage', key: string): string | null {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(kind: 'localStorage' | 'sessionStorage', key: string, value: string | null): void {
  try {
    if (value === null) {
      store(kind)?.removeItem(key);
    } else {
      store(kind)?.setItem(key, value);
    }
  } catch {
    // Nothing to do: it just will not outlive the page.
  }
}

/** This device's: localStorage. */
export const readDevice = (key: string): string | null => read('localStorage', key);
export const writeDevice = (key: string, value: string | null): void => write('localStorage', key, value);

/** This tab's: sessionStorage. */
export const readTab = (key: string): string | null => read('sessionStorage', key);
export const writeTab = (key: string, value: string | null): void => write('sessionStorage', key, value);
