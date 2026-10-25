import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AlertComponent, AlertTone } from '@anotoki/lib/ui/alert';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { SITE_SETTINGS_LIBRARY_WORDS, SiteSettingsLibraryKey } from '@anotoki/lib/words/site-settings';
import { filter, map } from 'rxjs';
import { SiteSettings } from '../site-settings.service';

const AUDIENCES = {
  USER: 'anotoki.siteSettings.audienceUser',
  EDITOR: 'anotoki.siteSettings.audienceEditor',
  ADMIN: 'anotoki.siteSettings.audienceAdmin',
} as const;

/** One notice: its tone, its heading, its sentence - and their language where it is not the page's. */
interface Notice {
  readonly id: string;
  readonly tone: AlertTone;
  readonly title: string;
  readonly text: string;
  readonly lang: string | null;
}

/**
 * What the site's administrators are told above the page they are on - and nobody else, ever: an administrator sees
 * the site as it is, which makes the switches usable (whoever switched a page off must be able to look at it) and
 * makes a page that is off look exactly like one that is on. So this says which:
 *
 * - the site is closed for maintenance (the site settings' "Getting in", as the public settings said it when they were
 *   read - and again after the administrators' page saved): everybody else sees the closed sign;
 * - this page is switched off (Page access): everybody else gets a page that is not there;
 * - this page is shown to some readers alone: people signed in, editors and administrators, administrators.
 *
 * In the site's frame rather than on each page, following the router - between the site's header and its page, as
 * genshin's route notice; in the admin panel's frame (`[adminFrameNotice]`), the maintenance line alone. Its words
 * are the library's (`anotoki.siteSettings.*`), read by the notice itself - the site's string first.
 */
@Component({
  selector: 'anotoki-page-notice',
  imports: [AlertComponent],
  templateUrl: './page-notice.component.html',
  styleUrl: './page-notice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-page-notice' },
})
export class PageNoticeComponent {
  private readonly settings = inject(SiteSettings);
  private readonly router = inject(Router);
  private readonly word = pieceWords(SITE_SETTINGS_LIBRARY_WORDS);

  /** The page's path, without its query or fragment, after each navigation. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  protected readonly notices = computed<Notice[]>(() => {
    if (!this.settings.isAdmin()) {
      return [];
    }
    const notices: Notice[] = [];
    const say = (id: string, tone: AlertTone, title: SiteSettingsLibraryKey, text: { text: string; lang: string | null }): void => {
      const heading = this.word(title);
      notices.push({ id, tone, title: heading.text, text: text.text, lang: heading.lang ?? text.lang });
    };
    if (this.settings.maintenance()) {
      say('maintenance', 'warning', 'anotoki.siteSettings.maintenanceOnTitle', this.word('anotoki.siteSettings.maintenanceOnText'));
    }
    const page = this.settings.noticeFor(this.path());
    if (page?.kind === 'off') {
      say('off', 'warning', 'anotoki.siteSettings.pageOffTitle', this.word('anotoki.siteSettings.pageOffText'));
    } else if (page?.kind === 'limited') {
      say('limited', 'info', 'anotoki.siteSettings.pageLimitedTitle', this.word('anotoki.siteSettings.pageLimitedText', { audience: this.word(AUDIENCES[page.visibility]).text }));
    }
    return notices;
  });
}
