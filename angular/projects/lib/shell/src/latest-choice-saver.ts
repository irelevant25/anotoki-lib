import { Signal, signal } from '@angular/core';

/** Saves the latest of a person's choices, one save at a time (latestChoiceSaver()). */
export interface ChoiceSaver<T> {
  (value: T): void;
  /** A save is on its way. */
  readonly saving: Signal<boolean>;
}

/**
 * The family's rule for saving a choice made on the page (a theme, a language)
 * to the account: one save at a time, and the latest choice is the one saved.
 *
 * Two saves in flight together could be answered in either order and leave
 * the account on a choice the page no longer shows. So a choice made while a
 * save is on its way waits for it to settle - only the latest such choice -
 * and an earlier save's refusal that a later choice has overtaken is no news:
 * `onRefused` hears only about a refusal of the latest choice.
 *
 * `save` decides whether there is anything to save at all (an account that
 * has the choice already, nobody signed in): it can resolve at once.
 *
 * ```ts
 * readonly saveLanguage = latestChoiceSaver(
 *   (code: string) => (this.account()?.language === code ? Promise.resolve() : this.api.saveLanguage(code)),
 *   () => this.languageNotSaved.set(true),
 * );
 * ```
 */
export function latestChoiceSaver<T>(save: (value: T) => Promise<unknown>, onRefused?: (error: unknown, value: T) => void): ChoiceSaver<T> {
  const saving = signal(false);
  let waiting: { value: T } | null = null;

  const run = (value: T): void => {
    saving.set(true);
    let answer: Promise<unknown>;
    try {
      answer = Promise.resolve(save(value));
    } catch (error) {
      answer = Promise.reject(error);
    }
    answer.then(
      () => settle(),
      (error: unknown) => {
        if (!settle()) {
          onRefused?.(error, value);
        }
      },
    );
  };

  /** The save is over: the waiting choice, if any, is saved now - and then this one's answer is no news. */
  const settle = (): boolean => {
    const next = waiting;
    waiting = null;
    saving.set(false);
    if (next) {
      run(next.value);
      return true;
    }
    return false;
  };

  const saver = ((value: T): void => {
    if (saving()) {
      waiting = { value };
      return;
    }
    run(value);
  }) as ChoiceSaver<T>;
  Object.defineProperty(saver, 'saving', { value: saving.asReadonly() });
  return saver;
}
