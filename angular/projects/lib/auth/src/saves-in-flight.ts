import { Injectable, signal } from '@angular/core';

/** The longest a sign-in or a sign-out waits for the writes still on their way before it goes all the same. */
export const SAVES_WAIT_MS = 30_000;

/**
 * The site's own API writes (anything but GET and HEAD) still on their way,
 * counted by anotokiAuthInterceptor.
 *
 * A sign-in waits for them before the browser leaves for the IAM, as it would
 * have to for any page it leaves: a visitor's first save brings the new
 * visitor key in its answer, and a page left before that answer arrives never
 * keeps the key - the visitor's work would be out of reach of the move after
 * the sign-in. A write that hangs is waited for SAVES_WAIT_MS at most.
 */
@Injectable({ providedIn: 'root' })
export class SavesInFlight {
  private readonly _count = signal(0);
  private _waiting: (() => void)[] = [];

  /** How many are on their way now. */
  readonly count = this._count.asReadonly();

  /** One write leaves; the function it answers is called once it has its answer (or failed, or was dropped) - more than once does nothing. */
  begin(): () => void {
    let ended = false;
    this._count.update((count) => count + 1);
    return () => {
      if (ended) {
        return;
      }
      ended = true;
      this._count.update((count) => count - 1);
      if (this._count() === 0) {
        const waiting = this._waiting;
        this._waiting = [];
        waiting.forEach((resolve) => resolve());
      }
    };
  }

  /** Resolves once no write is on its way - at once when none is, and after `maxMs` at the latest. */
  settled(maxMs = SAVES_WAIT_MS): Promise<void> {
    if (this._count() === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this._waiting = this._waiting.filter((waiting) => waiting !== done);
        resolve();
      };
      const timer = setTimeout(done, maxMs);
      this._waiting.push(done);
    });
  }
}
