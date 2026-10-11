import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { ShellComponent, TopBarComponent, TopBarLink, TopBarMenuItem } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { AnotokiWords } from '@anotoki/lib/ui';
import { ConfirmHostComponent } from '@anotoki/lib/ui/dialog';
import { ToastHostComponent } from '@anotoki/lib/ui/toast';
import { filter } from 'rxjs';

/**
 * The showcase's frame: the family's bar and frame around the gallery, as a
 * site's app component holds them - a thin wrapper wording the bar. It tells
 * the translations where the page is after every navigation, as a site's
 * title strategy does (the admin pages are English).
 */
@Component({
  selector: 'show-root',
  imports: [RouterOutlet, ShellComponent, TopBarComponent, ConfirmHostComponent, ToastHostComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly words = inject(AnotokiWords);
  private readonly i18n = inject(TranslationService);
  private readonly unread = inject(FeedbackUnread);

  protected readonly brand = computed(() => ({ area: 'kit', link: '/', label: 'anotoki kit: the showcase' }));
  protected readonly links = computed<TopBarLink[]>(() => [
    { id: 'gallery', label: 'Gallery', path: '/' },
    { id: 'translations', label: 'Translations', path: '/translations', lang: 'en' },
    { id: 'languages', label: 'Languages', path: '/languages', lang: 'en' },
    { id: 'migrations', label: 'Migrations', path: '/migrations', lang: 'en' },
    // The admin tools, the new feedback beside them (FeedbackUnread) - as a site's admin navigation shows it.
    { id: 'admin', label: 'Admin tools', path: '/admin/errors', under: ['/admin'], lang: 'en', badge: this.unread.count() || null },
    { id: 'feedback', label: 'Feedback form', path: '/feedback', lang: 'en' },
    { id: 'reviews', label: this.i18n.t('nav.reviews'), path: '/reviews', badge: 12 },
  ]);
  protected readonly person = computed(() => ({ name: 'Mira Nováková', email: 'mira@example.test', role: this.words.t('topbar.roleAdmin') }));
  protected readonly items = computed<TopBarMenuItem[]>(() => [
    { id: 'account', label: this.words.t('topbar.account'), icon: 'user', href: 'https://iam.example.test/account', newTab: true },
    { id: 'admin', label: this.words.t('topbar.admin'), icon: 'shield', path: '/translations' },
  ]);
  protected readonly mark = computed(() => ({ badge: 12, label: this.words.language() === 'sk' ? 'Ponuka: 12 opakovaní' : 'Menu: 12 reviews due' }));
  /** ?frame=88rem: the frame as wide as a site says (the shell's maxWidth); the kit's 84rem without it. */
  protected readonly frameWidth = new URLSearchParams(location.search).get('frame');
  /** Signing out takes a moment here: the item says "Saving…" meanwhile. */
  protected readonly signOut = () => new Promise<void>((done) => setTimeout(done, 2500));

  constructor() {
    // The new feedback beside the admin tools' link, as a site's admin navigation reads it once.
    void this.unread.refresh();
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.i18n.noteAddress(event.urlAfterRedirects));
  }
}
