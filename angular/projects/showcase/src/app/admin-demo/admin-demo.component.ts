import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';

/**
 * The admin tools in the kit's look, as a site's admin panel routes them - a
 * navigation of their own with the unread feedback beside "Feedback"
 * (FeedbackUnread), each page from its own entry point on a lazy route -
 * against the showcase's imagined server (admin-server.ts). ?iam=1: the IAM's
 * backups (encrypted, no restore, the password "secret" the proof).
 */
@Component({
  selector: 'show-admin-demo',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-demo.component.html',
  styleUrl: './admin-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDemoComponent {
  protected readonly unread = inject(FeedbackUnread);
  protected readonly tools = [
    { path: 'errors', label: 'Error log' },
    { path: 'audit', label: 'Audit log' },
    { path: 'feedback', label: 'Feedback' },
    { path: 'backups', label: 'Backups' },
    { path: 'files', label: 'Files' },
  ];

  constructor() {
    void this.unread.refresh();
  }
}
