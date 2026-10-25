import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SiteStatus, SiteStatusComponent } from '@anotoki/lib/migrations';
import { closedStatus } from '../site-settings-server';

/**
 * The closed sign (0.11.0): what everybody but the site's ADMIN reads while its administrators have closed it for
 * maintenance - a page of its own, no header and no footer, as the gate draws it in a site (the status page loads the
 * sign, @anotoki/lib/migrations/maintenance). The administrators' words are the imagined server's (the admin page's
 * Getting in rewords them); at /maintenance/staff - the showcase's staff route - the sign offers Sign in.
 */
@Component({
  selector: 'show-maintenance-demo',
  imports: [SiteStatusComponent],
  templateUrl: './maintenance-demo.component.html',
  styleUrl: './maintenance-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceDemoComponent {
  constructor() {
    const status = closedStatus() as { state: string; installed: boolean; maintenance_message: unknown };
    inject(SiteStatus).report(status.state, status.installed, status.maintenance_message);
  }
}
