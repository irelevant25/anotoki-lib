import { signal } from '@angular/core';

/** "Are you sure?", in the page's own words. */
export interface Question {
  title: string;
  message?: string | null;
  /** The yes. */
  confirmLabel: string;
  /** The no; "Cancel" by default. */
  cancelLabel?: string;
  /** `danger` for anything that removes or gives up what cannot be had back. */
  tone?: 'primary' | 'danger';
}

/**
 * A page's questions, one at a time, as promises - drawn by the page itself
 * (<anotoki-translations-question>, an <anotoki-dialog> in its template), so
 * the pages need nothing in the site's root. Asking while another is open
 * answers the first "no": it can only have been left open by accident.
 */
export class Questions {
  readonly pending = signal<(Question & { answer: (yes: boolean) => void }) | null>(null);

  ask(question: Question): Promise<boolean> {
    this.pending()?.answer(false);
    return new Promise<boolean>((answer) => this.pending.set({ ...question, answer }));
  }

  answer(yes: boolean): void {
    const pending = this.pending();
    if (pending) {
      this.pending.set(null);
      pending.answer(yes);
    }
  }
}
