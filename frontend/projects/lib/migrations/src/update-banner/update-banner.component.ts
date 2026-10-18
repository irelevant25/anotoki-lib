import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ANOTOKI_MIGRATIONS_CONFIG } from '../config';
import { SiteStatus } from '../site-status.service';

/**
 * One line for a site that keeps answering while an update waits (the IAM):
 * its ADMIN reads that a database update is waiting, with a link to the
 * Migrations page; nobody else sees anything. Asks the server once, when an
 * ADMIN is there and nothing has asked yet.
 */
@Component({
  selector: 'anotoki-update-banner',
  imports: [RouterLink],
  templateUrl: './update-banner.component.html',
  styleUrl: './update-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateBannerComponent {
  private readonly status = inject(SiteStatus);
  protected readonly config = inject(ANOTOKI_MIGRATIONS_CONFIG);

  protected readonly visible = computed(() => this.status.state() === 'update-pending' && this.config.isAdmin());

  constructor() {
    effect(() => {
      if (this.config.isAdmin() && untracked(this.status.state) === 'unknown') {
        void this.status.check();
      }
    });
  }
}
