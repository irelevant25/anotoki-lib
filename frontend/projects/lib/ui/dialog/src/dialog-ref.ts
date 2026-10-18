import { InjectionToken, TemplateRef, signal } from '@angular/core';

/** What AnotokiDialog.open() gives the component it draws: `inject(ANOTOKI_DIALOG_DATA)`. */
export const ANOTOKI_DIALOG_DATA = new InjectionToken<unknown>('ANOTOKI_DIALOG_DATA');

/**
 * A dialog opened by AnotokiDialog.open(): the component drawn in it injects
 * this to close it (with a result), to hold it open while it works (`busy`),
 * and to set its heading.
 */
export class AnotokiDialogRef<R = unknown> {
  /** The dialog's heading; the component may change it. */
  readonly heading = signal('');
  /** A request the dialog started is on its way: Escape, the backdrop and the close button wait. */
  readonly busy = signal(false);
  /** The row of buttons at the bottom, from the component's `<ng-template anotokiDialogFooter>`. */
  readonly footer = signal<TemplateRef<unknown> | null>(null);

  /** Settles when the dialog closes: with the result it was closed with, or undefined when it was dismissed. */
  readonly closed: Promise<R | undefined>;

  private resolve!: (result: R | undefined) => void;
  private done = false;
  /** Takes the dialog off the page (set by AnotokiDialog). */
  destroy: () => void = () => undefined;

  constructor(heading = '') {
    this.heading.set(heading);
    this.closed = new Promise<R | undefined>((resolve) => (this.resolve = resolve));
  }

  /** Closes the dialog; `closed` settles with `result`. */
  close(result?: R): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.destroy();
    this.resolve(result);
  }

  get isClosed(): boolean {
    return this.done;
  }
}
