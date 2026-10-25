import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Type, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { ANOTOKI_MIGRATIONS_CONFIG, DEFAULT_RETRY_SECONDS, DEFAULT_SETUP_URL, DEFAULT_STAFF_ROUTE } from '../config';
import { RELOAD_PAGE } from '../reload';
import { SiteStatus } from '../site-status.service';
import { siteStatusWords } from '../words';

/** Which page shows: the administrator's, or one of the visitors'. */
type View = 'admin' | 'updating' | 'not-set-up' | 'unavailable' | 'maintenance';

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
 * - Closed for maintenance (0.11.0, the site settings' "Getting in"): the
 *   closed sign (@anotoki/lib/migrations/maintenance), loaded as the state
 *   says so - an entry point of its own with its words, so that the gate's
 *   first load carries neither. A sign that cannot be loaded (a release
 *   swapped under an open page) is "not available right now" instead.
 *
 * The waiting pages - the visitors' and the ADMIN's (another administrator may
 * apply the update meanwhile), and the closed site's - ask again every
 * retrySeconds and reload once the site is ready: without telling SiteStatus
 * first (checkForReload), or the gate would make the site's pages in this page
 * for the moment before it goes.
 */
@Component({
  selector: 'anotoki-site-status',
  imports: [ButtonComponent, NgComponentOutlet, RouterLink],
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
      case 'maintenance':
        // A sign that cannot be loaded (a release swapped under an open page): not available right now, with Try again.
        return this.closedSignFailed() ? 'unavailable' : 'maintenance';
      default:
        return null;
    }
  });

  /** The pages that wait for the site, asking again by themselves. */
  protected readonly waiting = computed(() => this.view() !== null && this.view() !== 'not-set-up');
  protected readonly text = computed(() => siteStatusWords(this.config.language(), this.config.words));
  protected readonly signedIn = computed(() => this.config.isSignedIn());
  protected readonly checking = signal(false);

  /** The closed sign, once it is loaded; and whether it could not be. */
  protected readonly closedSign = signal<Type<unknown> | null>(null);
  protected readonly closedSignFailed = signal(false);
  /** What the sign says, handed to it: it imports nothing of this module (ng-packagr allows no cycle). */
  protected readonly closedSignInputs = computed(() => ({
    message: this.status.maintenanceMessage(),
    language: this.config.language(),
    signedIn: this.config.isSignedIn(),
    staffRoute: this.config.staffRoute ?? DEFAULT_STAFF_ROUTE,
    signIn: (returnTo?: string) => this.config.signIn(returnTo),
  }));

  constructor() {
    const every = Math.max(1, this.config.retrySeconds ?? DEFAULT_RETRY_SECONDS) * 1000;
    effect((onCleanup) => {
      if (!this.waiting()) {
        return;
      }
      const timer = setInterval(() => void this.recheck(), every);
      onCleanup(() => clearInterval(timer));
    });

    let loading = false;
    effect(() => {
      if (this.view() === 'maintenance' && !loading) {
        loading = true;
        untracked(() =>
          import('@anotoki/lib/migrations/maintenance').then(
            (sign) => this.closedSign.set(sign.MaintenancePageComponent),
            () => this.closedSignFailed.set(true),
          ),
        );
      }
    });
  }

  /** Asks the server again; the site is back: the page starts afresh. */
  protected async recheck(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    try {
      if ((await this.status.checkForReload()) === 'ready') {
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
