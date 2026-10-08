import { DOCUMENT, Injectable, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { mediaQuery } from '@anotoki/lib/ui';
import { ANOTOKI_SHELL_CONFIG, AnotokiThemeMode, DEFAULT_THEME_COLOR, DEFAULT_THEME_STORAGE_KEY } from './config';
import { latestChoiceSaver } from './latest-choice-saver';

/** The theme a page is drawn in. */
export type ResolvedTheme = 'light' | 'dark';

/**
 * Light, dark, or as the device is set - the anotoki account's choice while
 * somebody is signed in (one theme on every site), this device's otherwise.
 *
 * The theme shown is written to `<html data-theme>` (what the family's tokens
 * key on), to its color-scheme (what the kit's light-dark() fallbacks follow)
 * and to `<meta name="theme-color">`. "As the device is set" keeps following
 * the system while the page is open. The mode shown is kept in localStorage
 * (nothing for automatic), where the kit's theme-boot.js reads it before the
 * first paint, so a dark choice never flashes light while the app loads.
 *
 * The account's theme is shown from the service's first moment, and whenever
 * it changes (a choice on another site, another tab) - but not while a choice
 * made here is being saved, when the account still answers with the earlier
 * one. A choice is shown at once and saved to the account, one save at a time
 * and the latest last (latestChoiceSaver); a refusal puts the account's theme
 * back and sets `refused` (the theme switch says so under itself).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(ANOTOKI_SHELL_CONFIG, { optional: true })?.theme;
  private readonly storageKey = this.config?.storageKey ?? DEFAULT_THEME_STORAGE_KEY;
  private readonly themeColor = this.config?.themeColor ?? DEFAULT_THEME_COLOR;
  private readonly systemDark = mediaQuery('(prefers-color-scheme: dark)');
  private readonly account: Signal<AnotokiThemeMode | null> = computed(() => normalMode(this.config?.account?.()));

  private readonly _mode = signal<AnotokiThemeMode>(this.stored());
  private readonly _refused = signal(false);

  /** The mode shown: light, dark or auto. */
  readonly mode = this._mode.asReadonly();
  /** The theme the page is drawn in. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const mode = this._mode();
    return mode === 'auto' ? (this.systemDark() ? 'dark' : 'light') : mode;
  });
  /** The account did not take the last choice (its theme is shown again). */
  readonly refused = this._refused.asReadonly();

  private readonly save = latestChoiceSaver<AnotokiThemeMode>(
    (mode) => {
      const account = untracked(this.account);
      return account === null || account === mode || !this.config?.save ? Promise.resolve() : this.config.save(mode);
    },
    () => {
      const account = untracked(this.account);
      if (account) {
        this.show(account);
      }
      this._refused.set(true);
    },
  );

  /** The account's theme last seen: only a change of it is shown (an answer that repeats an earlier one is not news). */
  private seen: AnotokiThemeMode | null = null;

  constructor() {
    // The account's theme from the first frame.
    const account = untracked(this.account);
    if (account) {
      this.seen = account;
      this.show(account);
    }

    effect(() => {
      const theme = this.resolved();
      const root = this.document.documentElement;
      root.setAttribute('data-theme', theme);
      root.style.colorScheme = theme;
      this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.themeColor[theme]);
    });

    effect(() => {
      const account = this.account();
      untracked(() => {
        if (account === null) {
          // Signed out: the note about a refused choice goes with the account.
          this._refused.set(false);
        } else if (account !== this.seen && !this.save.saving()) {
          this.show(account);
        }
        this.seen = account;
      });
    });
  }

  /** The person's choice: shown at once and, while the account has a theme, saved to it. */
  set(mode: AnotokiThemeMode): void {
    this._refused.set(false);
    this.show(mode);
    this.save(mode);
  }

  /** The note about a refused choice has been seen. */
  dismissRefusal(): void {
    this._refused.set(false);
  }

  private show(mode: AnotokiThemeMode): void {
    this._mode.set(mode);
    try {
      if (mode === 'auto') {
        this.document.defaultView?.localStorage.removeItem(this.storageKey);
      } else {
        this.document.defaultView?.localStorage.setItem(this.storageKey, mode);
      }
    } catch {
      // Storage switched off: the choice holds for this page.
    }
  }

  private stored(): AnotokiThemeMode {
    try {
      const value = this.document.defaultView?.localStorage.getItem(this.storageKey);
      return value === 'light' || value === 'dark' ? value : 'auto';
    } catch {
      return 'auto';
    }
  }
}

function normalMode(mode: unknown): AnotokiThemeMode | null {
  return mode === 'light' || mode === 'dark' || mode === 'auto' ? mode : null;
}
