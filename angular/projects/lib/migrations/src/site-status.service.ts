import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ANOTOKI_MIGRATIONS_CONFIG, SiteState } from './config';
import { jsonObject } from './http';

/** The server's names for the states, and the pages'. */
const FROM_SERVER: Readonly<Record<string, Exclude<SiteState, 'unknown'>>> = {
  ready: 'ready',
  update_pending: 'update-pending',
  not_set_up: 'not-set-up',
  unavailable: 'unavailable',
};

/** A state by the server's name or the pages' own; null for anything else. */
function stateNamed(code: unknown): Exclude<SiteState, 'unknown'> | null {
  if (typeof code !== 'string') {
    return null;
  }
  if (Object.hasOwn(FROM_SERVER, code)) {
    return FROM_SERVER[code];
  }
  return (Object.values(FROM_SERVER) as string[]).includes(code) ? (code as Exclude<SiteState, 'unknown'>) : null;
}

/**
 * Where the site stands, for its pages: asked of the server's status path
 * (check()), and told by any API answer that says so (siteStatusInterceptor).
 */
@Injectable({ providedIn: 'root' })
export class SiteStatus {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ANOTOKI_MIGRATIONS_CONFIG);

  private readonly _state = signal<SiteState>('unknown');
  /** Never offer the setup page unless the server said the site was never installed. */
  private readonly _installed = signal(true);
  private asking: Promise<Answer> | null = null;

  readonly state = this._state.asReadonly();
  readonly installed = this._installed.asReadonly();
  /** Anything but ready (or not asked yet): the site's pages cannot work now. */
  readonly blocked = computed(() => {
    const state = this._state();
    return state !== 'ready' && state !== 'unknown';
  });

  /**
   * Asks the status path. No answer, or a failure without the status in its
   * body, counts as 'unavailable'. Calls made while one is under way share it.
   */
  check(): Promise<SiteState> {
    return this.answer().then(({ state, installed }) => {
      this.report(state, installed);
      return state;
    });
  }

  /**
   * Asks the status path for a page that reloads once the site is ready (the
   * status page): a 'ready' answer is returned and not reported. Reported, it
   * would reopen the gate, and the site's pages would be made - and send their
   * requests - in a page that is about to go. Any other answer is reported, as
   * check() does.
   */
  checkForReload(): Promise<SiteState> {
    return this.answer().then(({ state, installed }) => {
      if (state !== 'ready') {
        this.report(state, installed);
      }
      return state;
    });
  }

  /** What an API answer said: the server's code ('update_pending', 'not_set_up', ...), and whether the site was installed. */
  report(code: string, installed?: boolean): void {
    const state = stateNamed(code);
    if (state === null) {
      return;
    }
    this._state.set(state);
    if (typeof installed === 'boolean') {
      this._installed.set(installed);
    }
  }

  /** The update was applied here (the Migrations page): the site is ready without asking again. */
  markReady(): void {
    this._state.set('ready');
  }

  /** The server's answer; calls made while one is under way share it. */
  private answer(): Promise<Answer> {
    this.asking ??= this.ask().finally(() => (this.asking = null));
    return this.asking;
  }

  private async ask(): Promise<Answer> {
    let body: Record<string, unknown> | null;
    try {
      body = jsonObject(await firstValueFrom(this.http.get<unknown>(this.config.statusUrl)));
    } catch (error) {
      body = error instanceof HttpErrorResponse ? jsonObject(error.error) : null;
    }

    const state = stateNamed(body?.['state']) ?? stateNamed(body?.['code']) ?? 'unavailable';
    const installed = body?.['installed'];
    return { state, installed: typeof installed === 'boolean' ? installed : undefined };
  }
}

/** What the status path said. */
interface Answer {
  state: Exclude<SiteState, 'unknown'>;
  installed?: boolean;
}
