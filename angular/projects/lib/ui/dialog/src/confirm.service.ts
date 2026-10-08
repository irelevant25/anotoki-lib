import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message?: string | null;
  /** The yes; "Confirm" in the page's language by default. */
  confirmLabel?: string;
  /** The no; "Cancel" in the page's language by default. */
  cancelLabel?: string;
  /** `danger` for anything that ends, removes or cannot be undone. */
  tone?: 'primary' | 'danger';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (answer: boolean) => void;
}

/**
 * "Are you sure?", as a promise: `if (await confirm.ask({ ... })) { ... }`.
 *
 * One question at a time: asking while another is open answers the first
 * "no" - it can only have been left open by accident. The dialog is drawn
 * once, by <anotoki-confirm-host /> in the app's root, the focus starting on
 * the no: for the questions this mostly asks, the safe answer is the one a
 * stray Enter gives.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _pending = signal<PendingConfirm | null>(null);

  readonly pending = this._pending.asReadonly();

  ask(options: ConfirmOptions): Promise<boolean> {
    this._pending()?.resolve(false);
    return new Promise<boolean>((resolve) => this._pending.set({ ...options, resolve }));
  }

  settle(answer: boolean): void {
    const pending = this._pending();
    if (pending) {
      this._pending.set(null);
      pending.resolve(answer);
    }
  }
}
