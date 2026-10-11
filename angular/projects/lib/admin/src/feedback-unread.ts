import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ANOTOKI_ADMIN_CONFIG, adminBase } from './config';

/**
 * How many feedback messages nobody has opened yet - for the badge a site
 * puts beside its admin navigation's "Feedback" (GET {feedback}/unread; no
 * mail is sent for a message, so this is how the site's ADMIN hears of one).
 *
 * ```ts
 * protected readonly unread = inject(FeedbackUnread);   // in the admin panel's layout
 * constructor() { void this.unread.refresh(); }
 * // { id: 'feedback', label: 'Feedback', path: '/admin/feedback', badge: this.unread.count() || null }
 * ```
 *
 * The Feedback page keeps it in step as messages are opened and marked. It
 * asks the server only for the site's ADMIN; for anybody else, and while the
 * feedback table waits for an update, it is null.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackUnread {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ANOTOKI_ADMIN_CONFIG, { optional: true });
  private readonly _count = signal<number | null>(null);
  /** The latest ask: an answer to an earlier one never overwrites a later one's. */
  private asked = 0;

  /** How many messages are new; null until the server said (or for anybody but the site's ADMIN). */
  readonly count = this._count.asReadonly();

  /** Asks the server again. Never rejects: a failure leaves the count as it was (null when there was none). */
  async refresh(): Promise<void> {
    if (!this.config?.isAdmin()) {
      this._count.set(null);
      return;
    }
    const mine = ++this.asked;
    try {
      const answer = await firstValueFrom(this.http.get<{ unread?: unknown }>(`${adminBase(this.config, 'feedback')}/unread`));
      if (mine === this.asked) {
        this._count.set(typeof answer?.unread === 'number' && answer.unread >= 0 ? answer.unread : null);
      }
    } catch {
      // The badge is a hint: a page that could not ask keeps what it showed.
    }
  }

  /** What a page that read it knows (the Feedback page's counts): no request. */
  set(count: number | null): void {
    this.asked++;
    this._count.set(count === null ? null : Math.max(0, Math.floor(count)));
  }
}
