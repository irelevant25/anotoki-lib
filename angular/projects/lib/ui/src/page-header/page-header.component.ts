import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The top of a page: the one `<h1>`, a lead line, and the page's main actions
 * at the right (under it on a phone). Content marked `pageEyebrow` goes above
 * the heading (a back link), `pageMeta` under the lead (badges, dates).
 *
 * The heading takes the focus (tabindex="-1", no ring), so a site can move the
 * focus to it after a navigation and a screen reader starts at the new page.
 */
@Component({
  selector: 'anotoki-page-header',
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-page-header' },
})
export class PageHeaderComponent {
  readonly heading = input.required<string>();
  readonly lead = input<string | null>(null);
  /** The heading's id: what a site's router focus and a page's aria-labelledby point at. */
  readonly headingId = input('page-title');
}
