import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ANOTOKI_MIGRATIONS_CONFIG, DEFAULT_RETRY_SECONDS, DEFAULT_SETUP_URL } from '../config';
import { RELOAD_PAGE } from '../reload';
import { SiteStatus } from '../site-status.service';
import { siteStatusWords } from '../words';

/** Which page shows: the administrator's, or one of the visitors'. */
type View = 'admin' | 'updating' | 'not-set-up' | 'unavailable';

let nextId = 0;

/**
 * The page shown instead of the site while it is not ready.
 *
 * - An update waits: visitors and signed-in people read, in their language,
 *   that the site is being updated - no error, no code, no button but a quiet
 *   "Sign in" while nobody is signed in (how an administrator gets in); the
 *   site's ADMIN reads that an update is waiting, with "Open Migrations".
 * - Never set up: "This site is not set up yet" and the setup page.
 * - Set up once but not answering, or unavailable: "not available right now" -
 *   never the setup page.
 *
 * The visitors' pages ask again every retrySeconds and reload once the site
 * is ready.
 */
@Component({
  selector: 'anotoki-site-status',
  imports: [RouterLink],
  templateUrl: './site-status.component.html',
  styleUrl: './site-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteStatusComponent {
  private readonly status = inject(SiteStatus);
  private readonly reload = inject(RELOAD_PAGE);
  protected readonly config = inject(ANOTOKI_MIGRATIONS_CONFIG);

  protected readonly id = `anotoki-site-status-${++nextId}`;
  protected readonly setupUrl = this.config.setupUrl ?? DEFAULT_SETUP_URL;

  protected readonly view = computed<View | null>(() => {
    switch (this.status.state()) {
      case 'update-pending':
        return this.config.isAdmin() ? 'admin' : 'updating';
      case 'not-set-up':
        return this.status.installed() ? 'unavailable' : 'not-set-up';
      case 'unavailable':
        return 'unavailable';
      default:
        return null;
    }
  });

  /** The pages that wait for the site, asking again by themselves. */
  protected readonly waiting = computed(() => this.view() === 'updating' || this.view() === 'unavailable');
  protected readonly text = computed(() => siteStatusWords(this.config.language(), this.config.words));
  protected readonly signedIn = computed(() => this.config.isSignedIn());
  protected readonly checking = signal(false);

  constructor() {
    const every = Math.max(1, this.config.retrySeconds ?? DEFAULT_RETRY_SECONDS) * 1000;
    effect((onCleanup) => {
      if (!this.waiting()) {
        return;
      }
      const timer = setInterval(() => void this.recheck(), every);
      onCleanup(() => clearInterval(timer));
    });
  }

  /** Asks the server again; the site is back: the page starts afresh. */
  protected async recheck(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    try {
      if ((await this.status.check()) === 'ready') {
        this.reload();
      }
    } finally {
      this.checking.set(false);
    }
  }

  protected signIn(): void {
    this.config.signIn();
  }
}
