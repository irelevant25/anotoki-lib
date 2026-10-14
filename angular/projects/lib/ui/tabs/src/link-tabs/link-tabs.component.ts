import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { currentLink } from '@anotoki/lib/ui/current-link';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { LinkTabItem, badgeHeard, hasBadge } from '../tab-item';
import { TabStripComponent } from '../tab-strip/tab-strip.component';

/**
 * A row of links drawn as the kit's tabs - the pages of a section, each its own address: Japanese Academy's Kanji
 * (Dashboard, Lessons, Reviews, Practice, Browse) -
 *
 * ```html
 * <anotoki-link-tabs label="Kanji" [links]="links" [current]="screen.tab()" />
 * ```
 *
 * A named `nav` of ordinary links (`routerLink`): each its own Tab stop, Enter follows it - never the ARIA tabs pattern,
 * which is for panels of one page. The page's link is `aria-current="page"`: the one the router's address is (with
 * `exact`, that address alone; else it or one under it - the most specific when several are), or the one `current`
 * names whatever the address says (a screen drawn over another, the address unchanged). Icons and badges as the tabs'
 * ("Reviews, 12 due"); a row that does not fit scrolls sideways in the kit's strip, the page's link brought into view.
 */
@Component({
  selector: 'anotoki-link-tabs',
  imports: [BadgeComponent, IconComponent, RouterLink, TabStripComponent],
  templateUrl: './link-tabs.component.html',
  styleUrl: './link-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-link-tabs' },
})
export class LinkTabsComponent {
  readonly links = input.required<readonly LinkTabItem[]>();
  /** The navigation's name ("Kanji"). */
  readonly label = input.required<string>();
  /** The id of the link to mark as the page's, whatever the address says; null (the default): the router's address says. */
  readonly current = input<string | null>(null);

  protected readonly hasBadge = hasBadge;
  protected readonly badgeHeard = badgeHeard;
  protected readonly page = currentLink(this.links, this.current);
  protected readonly pageId = computed(() => this.page()?.id ?? null);
}
