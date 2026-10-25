import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { ANOTOKI_LIB_VERSION } from '@anotoki/lib';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { SiteFooterComponent, SiteFooterFan } from '@anotoki/lib/footer';
import { ShellComponent, TopBarComponent, TopBarLink, TopBarMenuItem } from '@anotoki/lib/shell';
import { AnnouncementComponent } from '@anotoki/lib/site-settings';
import { TranslationService } from '@anotoki/lib/translations';
import { AnotokiWords } from '@anotoki/lib/ui';
import { ConfirmHostComponent, DialogComponent } from '@anotoki/lib/ui/dialog';
import { ToastHostComponent } from '@anotoki/lib/ui/toast';
import { filter } from 'rxjs';

/** The query, as the legal pages' sample facts read it: ?fan=1 the fan clause, ?feedback=0 a site that takes none. */
const params = new URLSearchParams(location.search);

/** The admin frame's pages (0.10.0) and the closed sign (0.11.0): pages of their own, never the showcase's bar and footer. */
const FRAMED = /^\/(admin-frame|maintenance)(\/|\?|#|$)/;

/**
 * The showcase's frame: the family's bar and frame around the gallery, as a
 * site's app component holds them - a thin wrapper wording the bar - and the
 * family's footer under every page (0.6.3: the library's version, What's new,
 * Send feedback, the legal pages' links). It tells the translations where the
 * page is after every navigation, as a site's title strategy does (the admin
 * pages are English).
 */
@Component({
  selector: 'show-root',
  imports: [RouterOutlet, ShellComponent, TopBarComponent, ConfirmHostComponent, ToastHostComponent, DialogComponent, SiteFooterComponent, AnnouncementComponent],
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
    { id: 'people', label: 'People', path: '/people', lang: 'en' },
    // The admin tools, the new feedback beside them (FeedbackUnread) - as a site's admin navigation shows it.
    { id: 'admin', label: 'Admin tools', path: '/admin/errors', under: ['/admin'], lang: 'en', badge: this.unread.count() || null },
    { id: 'feedback', label: 'Feedback form', path: '/feedback', lang: 'en' },
    // What its number counts, in the site's own words ("Reviews, 12 reviews due"); without them the kit's "12 new".
    { id: 'reviews', label: this.i18n.t('nav.reviews'), path: '/reviews', badge: 12, badgeLabel: this.words.language() === 'sk' ? '12 na zopakovanie' : '12 reviews due' },
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
  /** The page is the admin frame's (/admin-frame, 0.10.0): drawn in that frame alone. */
  protected readonly framed = signal(FRAMED.test(location.pathname));

  /** The footer: the library's version, Send feedback unless ?feedback=0, the fan clause with ?fan=1. */
  protected readonly version = ANOTOKI_LIB_VERSION;
  protected readonly feedback = params.get('feedback') !== '0';
  protected readonly fan: SiteFooterFan | null = params.get('fan') === '1' ? 'hoyoverse' : null;
  /** The showcase's own What's new, as a site opens its own when the footer says so. */
  protected readonly whatsNewOpen = signal(false);
  protected readonly whatsNewTitle = computed(() => (this.words.language() === 'sk' ? 'Čo je nové' : "What's new"));
  protected readonly whatsNewText = computed(() =>
    this.words.language() === 'sk'
      ? 'anotoki-lib 0.6.3: spoločná pätička všetkých stránok anotoki - práve táto.'
      : "anotoki-lib 0.6.3: the family's footer - this one - under every page of every site.",
  );

  constructor() {
    // The new feedback beside the admin tools' link, as a site's admin navigation reads it once.
    void this.unread.refresh();
    const router = inject(Router);
    router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.i18n.noteAddress(event.urlAfterRedirects));
    // Into the admin frame's pages and out of them: the showcase's bar and footer go, or come back, as the way starts.
    router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.framed.set(FRAMED.test(event.url)));
  }
}
