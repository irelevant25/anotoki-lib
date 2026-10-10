import { EnvironmentInjector, Injectable, computed, effect, inject, runInInjectionContext, signal, untracked } from '@angular/core';
import { AnotokiAuth } from './auth.service';
import { AnotokiPreferenceChanges, AnotokiPreferences } from './client/types';
import { ANOTOKI_AUTH_CONFIG, SitePreferences } from './config';

/** A preference the anotoki account keeps for every anotoki site. */
export type AccountPreference = keyof AnotokiPreferenceChanges;

/**
 * What became of one choice sent to the account:
 *   saved       the account has it, and every anotoki site follows it now
 *   refused     the IAM said no, or could not be reached; `code` says which ('network', 'access_denied', ...)
 *               - the account's value is shown again; a language's invalid_request stays the site's own
 *   superseded  a later choice of the same preference took its place: that one's fate is the news
 *   device      there is no account to keep it - nobody is signed in, the IAM keeps no preferences, or it
 *               does not offer that language: the choice stays the site's own
 */
export interface PreferenceSave {
  readonly outcome: 'saved' | 'refused' | 'superseded' | 'device';
  readonly code?: string;
}

interface Waiting {
  readonly name: AccountPreference;
  readonly value: unknown;
  readonly settle: (result: PreferenceSave) => void;
}

/** What the site shows: the account's choices, those on their way over them. Both null: the device's own. */
export interface ShownPreferences {
  preferences: AnotokiPreferences | null;
  locale: string | null;
}

/**
 * The anotoki account's theme, date order, clock and language - what they are,
 * and saving the reader's choices to them (genshin's AccountPreferences, for
 * every site).
 *
 * They are the account's, not the site's (the IAM's migration 015): one choice
 * every anotoki site follows, its admin area included. They apply only while
 * somebody is signed in here and the IAM keeps them; otherwise every one is
 * the site's own, as for a visitor - and the account's language waits for the
 * same thing: following it while a choice made here could not be saved back
 * would undo that choice at the next page load.
 *
 * One save at a time, the latest choice of each preference last, one
 * preference a request: two saves on their way together could be answered in
 * either order, and the later answer - which still says what the account held
 * before the other was saved - would put the page back on a choice the person
 * had left; and a language the IAM refuses never takes a theme chosen in the
 * same moment down with it.
 *
 * With the site's `preferences` (SitePreferences), the page follows: apply()
 * is given what to show - the account's choices, a choice on its way shown as
 * made, a refused one taken back - whenever any of it changes: another tab, a
 * refresh, a save.
 */
@Injectable({ providedIn: 'root' })
export class AccountPreferences {
  private readonly auth = inject(AnotokiAuth);
  private readonly config = inject(ANOTOKI_AUTH_CONFIG);
  private readonly injector = inject(EnvironmentInjector);

  /** The account's theme, date order and clock - null for a visitor, or an IAM that keeps none. */
  readonly preferences = computed(() => this.auth.preferences());
  /** Whether the account's choices are the page's, and a choice made here is saved to it. */
  readonly kept = computed(() => this.preferences() !== null);
  /** The account's language, when the account's choices apply. Not a promise the site has it. */
  readonly language = computed(() => (this.kept() ? this.auth.locale() : null));

  /** The choices on their way or waiting, by preference: shown as made. */
  private readonly pending = signal<Partial<Record<AccountPreference, unknown>>>({});
  /** A language kept for the visit only: one the IAM does not offer, or refused as invalid. */
  private readonly ownLanguage = signal<string | null>(null);

  /** What the page shows of the account now. */
  readonly shown = computed<ShownPreferences>(() => {
    const preferences = this.preferences();
    if (preferences === null) {
      return { preferences: null, locale: null };
    }
    const pending = this.pending();
    const shown: AnotokiPreferences = { ...preferences };
    for (const name of ['theme', 'date_format', 'time_format'] as const) {
      if (name in pending) {
        (shown as unknown as Record<string, unknown>)[name] = pending[name];
      }
    }
    const language = 'language' in pending ? (pending.language as string) : (this.ownLanguage() ?? this.auth.locale());
    return { preferences: shown, locale: language };
  });

  private sending: Waiting | null = null;
  private readonly waiting = new Map<AccountPreference, Waiting>();

  constructor() {
    const site = this.config.preferences ? runInInjectionContext(this.injector, this.config.preferences) : null;
    if (site) {
      effect(() => {
        if (this.auth.state() === 'starting') {
          return;
        }
        const shown = this.shown();
        untracked(() => site.apply(shown.preferences, shown.locale));
      });
    }
  }

  /**
   * Saves one choice to the account - the caller has shown it already. Never rejects: what became of it is
   * the answer, and the caller says it in its own words, or not at all.
   */
  async save<K extends AccountPreference>(name: K, value: AnotokiPreferenceChanges[K]): Promise<PreferenceSave> {
    if (!this.kept()) {
      return { outcome: 'device' };
    }
    if (name === 'language') {
      const offered = await this.auth.uiLocalesSupported().catch(() => null);
      if (offered !== null && !offersLanguage(offered, String(value))) {
        this.ownLanguage.set(String(value));
        return { outcome: 'device' };
      }
    }
    return new Promise<PreferenceSave>((settle) => {
      this.waiting.get(name)?.settle({ outcome: 'superseded' });
      this.waiting.set(name, { name, value, settle });
      this.pending.update((pending) => ({ ...pending, [name]: value }));
      if (!this.sending) {
        this.send();
      }
    });
  }

  /**
   * Whether a choice of this preference is on its way or waiting to go: an answer to an earlier save, or a
   * token refreshed meanwhile, still says what the account held before the latest choice.
   */
  saving(name: AccountPreference): boolean {
    return this.sending?.name === name || this.waiting.has(name);
  }

  private send(): void {
    for (const waiting of this.waiting.values()) {
      this.waiting.delete(waiting.name);

      if (!this.kept()) {
        // Signed out while it waited: there is no account any more.
        this.done(waiting, { outcome: 'device' });
        continue;
      }
      if (this.has(waiting.name, waiting.value)) {
        // Chosen back to what the account already holds before it went.
        this.done(waiting, { outcome: 'saved' });
        continue;
      }

      this.sending = waiting;
      this.auth.savePreferences({ [waiting.name]: waiting.value } as AnotokiPreferenceChanges).then(
        () => this.sent(waiting, { outcome: 'saved' }),
        (error: unknown) => this.sent(waiting, { outcome: 'refused', code: errorCode(error) }),
      );
      return;
    }
  }

  private sent(waiting: Waiting, result: PreferenceSave): void {
    this.sending = null;
    if (waiting.name === 'language') {
      // A language the account does not take is no news: it stays the site's own, for the visit.
      this.ownLanguage.set(result.outcome === 'refused' && result.code === 'invalid_request' ? String(waiting.value) : null);
    }
    this.done(waiting, this.waiting.has(waiting.name) ? { outcome: 'superseded' } : result);
    this.send();
  }

  /** Settles a choice; the page shows the account's value again unless a later choice of it waits. */
  private done(waiting: Waiting, result: PreferenceSave): void {
    if (!this.waiting.has(waiting.name)) {
      this.pending.update((pending) => {
        const rest = { ...pending };
        delete rest[waiting.name];
        return rest;
      });
    }
    waiting.settle(result);
  }

  private has(name: AccountPreference, value: unknown): boolean {
    if (name === 'language') {
      return this.language() === value;
    }
    const preferences = this.preferences();
    return preferences !== null && preferences[name] === value;
  }
}

/** Whether the IAM offers a language: by its whole code, else its first subtag - as the IAM reads ui_locales. */
function offersLanguage(offered: string[], code: string): boolean {
  const wanted = code.trim().toLowerCase();
  const list = offered.map((each) => each.toLowerCase());
  return list.includes(wanted) || list.includes(wanted.split('-')[0]);
}

/** The IAM's error code on a refusal (the client puts it on `code`), or 'unknown'. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : 'unknown';
}
