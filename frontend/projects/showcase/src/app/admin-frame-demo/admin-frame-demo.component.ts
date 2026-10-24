import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ANOTOKI_LIB_VERSION } from '@anotoki/lib';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { AdminFrameComponent, SideNavGroup } from '@anotoki/lib/admin/frame';
import { SiteFooterComponent } from '@anotoki/lib/footer';
import { UpdateBannerComponent } from '@anotoki/lib/migrations';
import { ThemeToggleComponent } from '@anotoki/lib/shell';
import { ToastService } from '@anotoki/lib/ui/toast';

/**
 * The admin panel's frame (0.10.0) as a site's admin layout draws it - genshin's, for every site: the panel's name, who
 * is signed in, Back, Sign out, the theme and the pages in groups on the left; the update line, the page and the
 * family's footer on the right. A page of its own, outside the showcase's bar and footer (/admin-frame).
 */
@Component({
  selector: 'show-admin-frame-demo',
  imports: [AdminFrameComponent, RouterOutlet, SiteFooterComponent, ThemeToggleComponent, UpdateBannerComponent],
  templateUrl: './admin-frame-demo.component.html',
  styleUrl: './admin-frame-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFrameDemoComponent {
  private readonly toasts = inject(ToastService);
  private readonly unread = inject(FeedbackUnread);

  protected readonly brand = { name: 'Showcase Admin', path: '/admin-frame' };
  protected readonly person = { name: 'Mira Nováková', email: 'mira@example.test' };
  protected readonly back = { label: 'Back to the gallery', path: '/' };
  protected readonly version = ANOTOKI_LIB_VERSION;

  /** The pages: the dashboard alone, then three groups - the new feedback beside Feedback (the showcase's count), the accounts elsewhere. */
  protected readonly groups = computed<SideNavGroup[]>(() => [
    { links: [{ id: 'dashboard', label: 'Dashboard', path: '/admin-frame', exact: true, icon: 'sparkle' }] },
    {
      label: 'Database',
      links: [
        { id: 'characters', label: 'Characters', path: '/admin-frame/characters', icon: 'user' },
        { id: 'weapons', label: 'Weapons', path: '/admin-frame/weapons', icon: 'shield' },
        { id: 'materials', label: 'Materials', path: '/admin-frame/materials', icon: 'gamepad' },
      ],
    },
    {
      label: 'Localization',
      links: [
        { id: 'languages', label: 'Languages', path: '/admin-frame/languages', icon: 'languages' },
        { id: 'translations', label: 'Translations', path: '/admin-frame/translations', icon: 'search' },
      ],
    },
    {
      label: 'System',
      links: [
        { id: 'settings', label: 'Site settings', path: '/admin-frame/settings', icon: 'wrench' },
        { id: 'feedback', label: 'Feedback', path: '/admin-frame/feedback', icon: 'lightbulb', badge: this.unread.count() || null },
        { id: 'backups', label: 'Backups', path: '/admin-frame/backups', icon: 'save' },
        { id: 'accounts', label: 'Accounts & access', href: 'https://iam.example.test/admin', newTab: true, icon: 'users' },
      ],
    },
  ]);

  /** Signing out takes a moment here: Sign out says "Saving…" meanwhile, and the showcase stays. */
  protected readonly signOut = () =>
    new Promise<void>((done) =>
      setTimeout(() => {
        this.toasts.info('A site signs you out here; the showcase stays.');
        done();
      }, 2500),
    );

  protected whatsNew(): void {
    this.toasts.info("anotoki-lib 0.10.0: the admin panel's frame - this one - for every site.");
  }
}
