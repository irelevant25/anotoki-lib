import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, Signal, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { currentLink } from '@anotoki/lib/ui/current-link';
import { mediaQuery, uniqueId } from '@anotoki/lib/ui/dom';
import { DrawerComponent } from '@anotoki/lib/ui/drawer';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { COUNT, SideNavGroup, SideNavLink } from '../side-nav-item';

/**
 * The side navigation of an area with many pages - genshin's admin panel: a dashboard, then its pages in groups
 * (Database, Lookup tables, Localization, System) -
 *
 * ```html
 * <anotoki-side-nav #nav="anotokiSideNav" label="Admin panel" heading="Genshin Admin" [groups]="groups()" [phoneMax]="860" />
 * ```
 *
 * A named `nav`: each group's heading names its list (or, with `headingLevel`, is a heading of the page's outline), and
 * a `collapsible` group's heading is a button that shows and hides its links (aria-expanded, aria-controls; the links
 * out of the tab order while hidden; the group that holds the page's link opens by itself). A link has an optional
 * icon and badge - the badge seen as it is and heard after the label: the site's `badgeLabel`, or for a number the
 * kit's "{count} new" ("Feedback, 3 new", the top bar's words), or a word as it is. The page's link is
 * `aria-current="page"`: the router's (with `exact`, its address alone; the most specific when several match), or the
 * one `current` names.
 *
 * Up to `phoneMax` (px, the site's own measure; null: never) it moves into the kit's drawer: in its place a button
 * (the menu icon and its words: `buttonLabel`, else the navigation's name) with aria-expanded, aria-haspopup="dialog"
 * and aria-controls while the drawer is there - or the site's own button anywhere in its page, `[anotokiSideNavTrigger]="nav"`
 * (genshin's phone bar), and then none of its own. The drawer (`heading`, else the name) takes the focus as it opens and
 * gives it back to the button as it closes - on a link, on Escape, on the backdrop and on its Close; while it is shut
 * nothing of the navigation is in the page, so nothing of it is in the tab order.
 */
@Component({
  selector: 'anotoki-side-nav',
  exportAs: 'anotokiSideNav',
  imports: [ButtonComponent, DrawerComponent, IconComponent, NgTemplateOutlet, RouterLink],
  templateUrl: './side-nav.component.html',
  styleUrl: './side-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-side-nav', '[class.anotoki-side-nav--phone]': 'phone()' },
})
export class SideNavComponent {
  protected readonly words = inject(AnotokiWords);
  private readonly injector = inject(Injector);

  /** The navigation's name ("Admin panel"). */
  readonly label = input.required<string>();
  readonly groups = input.required<readonly SideNavGroup[]>();
  /** Up to this width (px) it is a phone's: a button and the drawer. Null: always beside the page. */
  readonly phoneMax = input<number | null>(860);
  /** The drawer's heading ("Genshin Admin"); the navigation's name by default. */
  readonly heading = input<string | null>(null);
  /** The words of its own button on a phone ("Menu"); the navigation's name by default. */
  readonly buttonLabel = input<string | null>(null);
  /** The groups' headings as headings of the page's outline, at this level; null (the default): each names its list alone. */
  readonly headingLevel = input<2 | 3 | 4 | 5 | 6 | null>(null);
  /** The id of the link to mark as the page's, whatever the address says; null (the default): the router's address says. */
  readonly current = input<string | null>(null);

  private readonly narrow = mediaQuery(() => `(max-width: ${this.phoneMax() ?? 0}px)`);
  /** It is a phone's: a button and the drawer in place of the column. */
  readonly phone: Signal<boolean> = computed(() => this.phoneMax() !== null && this.narrow());

  private readonly opened = signal(false);
  /** The drawer is open. */
  readonly isOpen: Signal<boolean> = this.opened.asReadonly();

  private readonly id = uniqueId('anotoki-side-nav');
  /** The id of the navigation in the drawer, while it is there: what the buttons that open it control. */
  readonly drawerNavId = `${this.id}-drawer`;
  protected readonly navId = `${this.id}-nav`;

  private readonly links = computed(() => this.groups().flatMap((group) => group.links));
  /** The page's link. */
  protected readonly page = currentLink(this.links, this.current);
  /** Which link that is, whatever objects the groups are made of this time (a site's computed makes new ones as a count changes). */
  private readonly pageKey = computed(() => {
    const page = this.page();
    return page ? (page.id ?? JSON.stringify(page.path ?? null)) : null;
  });

  /** The site's own buttons ([anotokiSideNavTrigger]): while there is one, the navigation draws none of its own. */
  private readonly triggers = signal(0);
  protected readonly ownButton = computed(() => this.triggers() === 0);
  /** Each collapsible group's state once a person (or the page's link) opened or closed it, by its key. */
  private readonly toggled = signal<ReadonlyMap<string, boolean>>(new Map());
  /** The button that opened the drawer: the focus goes back to it. */
  private opener: HTMLElement | null = null;

  constructor() {
    // The group that holds the page's link opens, so the link marked as the page's is seen - as the page changes, not
    // as the groups are made again (a person who closed it keeps it closed while a count beside a link moves).
    effect(() => {
      this.pageKey();
      untracked(() => {
        const page = this.page();
        this.groups().forEach((group, index) => {
          if (page && this.collapsible(group) && group.links.includes(page) && !this.groupOpen(group, index)) {
            this.toggled.update((state) => new Map(state).set(this.groupKey(group, index), true));
          }
        });
      });
    });
    // A phone's width left (a turned tablet): the column is back, the drawer goes.
    effect(() => {
      if (!this.phone()) {
        untracked(() => this.opened.set(false));
      }
    });
  }

  /** Opens the drawer (on a phone's width); `opener`: the button the focus goes back to. */
  open(opener?: HTMLElement | null): void {
    if (!this.phone() || this.opened()) {
      return;
    }
    this.opener = opener ?? null;
    this.opened.set(true);
  }

  /** Closes the drawer, the focus back on the button that opened it. */
  close(): void {
    if (!this.opened()) {
      return;
    }
    this.opened.set(false);
    // The drawer gives the focus back to what had it as it opened; a browser that does not focus a button on a click
    // (Safari) had none there - so to the button itself, once the drawer is gone.
    const opener = this.opener;
    afterNextRender(
      () => {
        if (opener?.isConnected) {
          opener.focus({ preventScroll: true });
        }
      },
      { injector: this.injector },
    );
  }

  toggle(opener?: HTMLElement | null): void {
    if (this.opened()) {
      this.close();
    } else {
      this.open(opener);
    }
  }

  /** A button of the site's that opens the drawer. Internal: the trigger directive's. */
  attach(): void {
    this.triggers.update((count) => count + 1);
  }

  /** Internal: the trigger directive's. */
  detach(): void {
    this.triggers.update((count) => Math.max(0, count - 1));
  }

  protected collapsible(group: SideNavGroup): boolean {
    return !!group.label && (!!group.collapsible || !!group.collapsed);
  }

  protected groupKey(group: SideNavGroup, index: number): string {
    return group.id || group.label || `#${index}`;
  }

  protected linkKey(link: SideNavLink, index: number): string {
    return link.id || (typeof link.path === 'string' ? link.path : null) || link.href || `${link.label}#${index}`;
  }

  protected groupOpen(group: SideNavGroup, index: number): boolean {
    return !this.collapsible(group) || (this.toggled().get(this.groupKey(group, index)) ?? !group.collapsed);
  }

  protected toggleGroup(group: SideNavGroup, index: number): void {
    const open = this.groupOpen(group, index);
    this.toggled.update((state) => new Map(state).set(this.groupKey(group, index), !open));
  }

  protected labelId(index: number): string {
    return `${this.id}-group-${index}`;
  }

  protected listId(index: number): string {
    return `${this.id}-list-${index}`;
  }

  /** A link followed in the drawer closes it (a link opened elsewhere - a new tab, a new window - leaves it open). */
  protected chosen(event: MouseEvent): void {
    if (!this.opened() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (event.target instanceof Element && event.target.closest('a[href]')) {
      this.close();
    }
  }

  protected hasBadge(link: SideNavLink): boolean {
    return link.badge !== undefined && link.badge !== null && link.badge !== '' && link.badge !== 0 && link.badge !== '0';
  }

  /** What a link's badge says to the ear, after its label: the site's words, "3 new" for a number, a word as it is. */
  protected counted(link: SideNavLink): string {
    const badge = String(link.badge);
    return link.badgeLabel || (COUNT.test(badge) ? this.words.t('topbar.linkCount', { count: badge }) : badge);
  }

  /**
   * The language of what a link's badge says, where it is not the one it inherits from the link: the site's words are
   * the page's language, the kit's its own (English where nobody wrote words for the page's) - inside a link marked as
   * another language, said as such. A word badge is the link's own.
   */
  protected countedLang(link: SideNavLink): string | null {
    if (!link.badgeLabel && !COUNT.test(String(link.badge))) {
      return null;
    }
    const own = link.badgeLabel ? this.words.language() : this.words.lang();
    return own === (link.lang || this.words.language()) ? null : own;
  }
}
