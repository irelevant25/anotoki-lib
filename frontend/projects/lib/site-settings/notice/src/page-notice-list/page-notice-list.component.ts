import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AlertComponent, AlertTone } from '@anotoki/lib/ui/alert';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { SITE_SETTINGS_LIBRARY_WORDS, SiteSettingsLibraryKey } from '@anotoki/lib/words/site-settings';

/**
 * What an administrator is told about the page they are on - the site settings' PageNotice, which this part cannot
 * import (ng-packagr allows no cycle): switched off, or shown to some readers alone.
 */
type PageTold = { readonly kind: 'off' } | { readonly kind: 'limited'; readonly visibility: 'USER' | 'EDITOR' | 'ADMIN' };

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
 * The administrators' notice, as it is drawn: a callout for each thing there is to say - the site is closed for
 * maintenance (everybody else sees the closed sign), this page is switched off (everybody else gets a page that is not
 * there), this page is shown to some readers alone. <anotoki-page-notice> (@anotoki/lib/site-settings) decides whether
 * there is anything to tell - to the site's ADMIN alone, ever - and loads this part only then, handing it what to say.
 *
 * One under another, in the notice's place. Its words are the library's (`anotoki.siteSettings.*`), read by the notice
 * itself - the site's string first.
 */
@Component({
  selector: 'div.anotoki-page-notice__list',
  imports: [AlertComponent],
  templateUrl: './page-notice-list.component.html',
  styleUrl: './page-notice-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-page-notice__list' },
})
export class PageNoticeListComponent {
  private readonly word = pieceWords(SITE_SETTINGS_LIBRARY_WORDS);

  /** The site is closed for maintenance, as the public settings said when they were read. */
  readonly maintenance = input(false);
  /** This page is switched off, or kept for some readers; null for neither. */
  readonly page = input<PageTold | null>(null);

  protected readonly notices = computed<Notice[]>(() => {
    const notices: Notice[] = [];
    const say = (id: string, tone: AlertTone, title: SiteSettingsLibraryKey, text: { text: string; lang: string | null }): void => {
      const heading = this.word(title);
      notices.push({ id, tone, title: heading.text, text: text.text, lang: heading.lang ?? text.lang });
    };
    if (this.maintenance()) {
      say('maintenance', 'warning', 'anotoki.siteSettings.maintenanceOnTitle', this.word('anotoki.siteSettings.maintenanceOnText'));
    }
    const page = this.page();
    if (page?.kind === 'off') {
      say('off', 'warning', 'anotoki.siteSettings.pageOffTitle', this.word('anotoki.siteSettings.pageOffText'));
    } else if (page?.kind === 'limited') {
      say('limited', 'info', 'anotoki.siteSettings.pageLimitedTitle', this.word('anotoki.siteSettings.pageLimitedText', { audience: this.word(AUDIENCES[page.visibility]).text }));
    }
    return notices;
  });
}
