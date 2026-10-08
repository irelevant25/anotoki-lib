import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SiteStatus, SiteStatusComponent } from '@anotoki/lib/migrations';
import { MigrationsPageComponent } from '@anotoki/lib/migrations/page';

/**
 * The migrations module in the kit's look: the status page a site shows while
 * its database waits for an update (the visitor's with ?visitor=1), and the
 * administrators' Migrations page - against the showcase's imagined server.
 */
@Component({
  selector: 'show-migrations-demo',
  imports: [MigrationsPageComponent, SiteStatusComponent],
  templateUrl: './migrations-demo.component.html',
  styleUrl: './migrations-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MigrationsDemoComponent {
  constructor() {
    inject(SiteStatus).report('update_pending');
  }
}
