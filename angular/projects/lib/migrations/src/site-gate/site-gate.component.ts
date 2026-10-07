import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { ANOTOKI_MIGRATIONS_CONFIG } from '../config';
import { isOnRoute } from '../http';
import { SiteStatus } from '../site-status.service';
import { SiteStatusComponent } from '../site-status/site-status.component';

/**
 * Wraps the site's pages (its router outlet): shows them while the site is
 * ready - or not asked yet - and the status page otherwise. An ADMIN still
 * reaches the Migrations page while an update waits, and nothing else. It
 * asks the server once, when nothing has asked yet, and follows the router.
 */
@Component({
  selector: 'anotoki-site-gate',
  imports: [SiteStatusComponent],
  templateUrl: './site-gate.component.html',
  styleUrl: './site-gate.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteGateComponent {
  private readonly status = inject(SiteStatus);
  private readonly config = inject(ANOTOKI_MIGRATIONS_CONFIG);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Whether the site's own pages show. */
  protected readonly open = computed(() => {
    const state = this.status.state();
    if (state === 'ready' || state === 'unknown') {
      return true;
    }
    return state === 'update-pending' && this.config.isAdmin() && isOnRoute(this.url(), this.config.migrationsRoute);
  });

  constructor() {
    if (this.status.state() === 'unknown') {
      void this.status.check();
    }
  }
}
