import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/** How many stay on screen at once; older ones make way. */
const MOST = 4;

/**
 * Short words about something that just happened - "Password changed." -
 * drawn by <anotoki-toast-host /> in a polite live region.
 *
 * For outcomes only. Anything the person has to act on, or read carefully,
 * belongs on the page, where it does not vanish after a few seconds. A
 * warning stays 8 seconds and an error 9: more likely to need reading twice.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private next = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly _toasts = signal<readonly Toast[]>([]);

  readonly toasts = this._toasts.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach((timer) => clearTimeout(timer)));
  }

  /** Shows a message; `duration` 0 keeps it until it is dismissed. Its id, to dismiss it early. */
  show(message: string, tone: ToastTone = 'info', duration = 5000): number {
    const id = ++this.next;
    const kept = [...this._toasts(), { id, message, tone }];
    for (const old of kept.slice(0, Math.max(0, kept.length - MOST))) {
      this.forget(old.id);
    }
    this._toasts.set(kept.slice(-MOST));
    if (duration > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), duration),
      );
    }
    return id;
  }

  success(message: string): number {
    return this.show(message, 'success');
  }

  info(message: string): number {
    return this.show(message, 'info');
  }

  warning(message: string): number {
    return this.show(message, 'warning', 8000);
  }

  error(message: string): number {
    return this.show(message, 'danger', 9000);
  }

  dismiss(id: number): void {
    this.forget(id);
    this._toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private forget(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
