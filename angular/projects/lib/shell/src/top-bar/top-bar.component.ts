import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Signal,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { AnotokiWords, ButtonComponent, IconComponent, SpinnerComponent, mediaQuery, uniqueId } from '@anotoki/lib/ui';
import { MenuComponent, MenuItemComponent, MenuSeparatorComponent, MenuTriggerDirective } from '@anotoki/lib/ui/menu';
import { filter, map } from 'rxjs';
import { BrandComponent } from '../brand/brand.component';
import { LanguageSwitcherComponent } from '../language-switcher/language-switcher.component';
import { ThemeService } from '../theme.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

/** The brand at the start of the bar, worded by the site. */
export interface TopBarBrand {
  /** The part of the family after "anotoki": "survey", "account", "Japanese". */
  area: string;
  /** The area on a phone, where it is shorter ("Piano" for "Piano Academy"); the area itself by default. */
  short?: string | null;
  /** The part of the site: "admin panel" in an admin panel - "anotoki survey · admin panel". */
  panel?: string | null;
  /** Where it leads: the area's home. */
  link: string;
  /** The link's name, holding the words shown: "anotoki survey: the open surveys". */
  label: string;
  /** The page is the brand's own (the home page): aria-current. */
  current?: boolean;
  /** The wordmark's language, where it is not the page's. */
  lang?: string | null;
}

/** A section of the site, as a link in the bar (in the phone's menu on a phone). */
export interface TopBarLink {
  id: string;
  label: string;
  path: string;
  /** Address beginnings that are part of the section too (a survey's editor under Surveys). */
  under?: readonly string[];
  /** The label's language, where it is not the page's (an admin panel's English). */
  lang?: string | null;
  /** A number beside the label (reviews due); its words are the site's to make part of the label. */
  badge?: string | number | null;
}

/** Who is signed in, worded by the site. */
export interface TopBarPerson {
  name: string;
  /** Shown under the name unless it is the name. */
  email?: string | null;
  /** "Administrator", "Editor" - the site words the role it means. */
  role?: string | null;
}

/** An item of the person's menu, between its head and Sign out. */
export interface TopBarMenuItem {
  id: string;
  label: string;
  /** One of the kit's icons, or one the site registered. */
  icon?: string;
  /** A route of the site. */
  path?: string;
  /** An address elsewhere (the anotoki account). */
  href?: string;
  /** Opens in a new tab (with an icon that says so). */
  newTab?: boolean;
  lang?: string | null;
}

/** Sign in or Sign out; a promise keeps its item waiting ("Saving…") until it settles. */
export type TopBarAction = () => unknown;

/** What stands on the phone's menu button: a badge (and the button's name saying it), or a dot with a description. */
export interface TopBarPhoneMark {
  badge?: string | number | null;
  dot?: boolean;
  /** The button's name with the badge: "Menu: 125 reviews due". */
  label?: string | null;
  /** What the dot means, for a screen reader: "Not saved yet". */
  description?: string | null;
}

/** A note heading both menus ("Not saved yet" and why). */
export interface TopBarMenuNote {
  title: string;
  text?: string | null;
}

type Waiting = 'signIn' | 'signOut' | null;

/**
 * The anotoki family's top bar: one row, in this order - the brand (linking
 * home); the site's sections as links (the section the page is in marked, the
 * page's own link aria-current); then the site's widgets, the language (where
 * the site's pages are translated), the theme, and the person's menu (name,
 * address, role; the site's items; Sign out) - or Sign in.
 *
 * Up to `phoneMax` it is a phone's bar: the brand short, the language, the
 * theme and one menu button holding the links, a separator and the person's
 * menu (or Sign in) - no menu button when there is nothing to hold. Above it,
 * only the person's name gives way (hidden below `nameMin`). Each site
 * measures its own `phoneMax` with its real labels, in English and Slovak
 * plus a scrollbar; in development the bar warns when its row overflows above
 * it (a reminder to measure again).
 *
 * Its menus are the kit's (@anotoki/lib/ui/menu), with all of the family's
 * rules: the focus in, the arrows, Home and End, Escape back to the button,
 * Tab and Shift+Tab closing with the focus on the button, a click outside.
 * A menu closes when the bar folds or unfolds, when the person changes, and
 * when the links do. Sign in and Sign out that return a promise keep their
 * item, disabled, with a spinner and "Saving…", the menu open and the focus
 * on its button, until it settles.
 *
 * `isolateKeys`: no key pressed in the bar reaches `document` (a quiz's Enter
 * must not answer a card) - Escape is handled inside.
 *
 * The bar injects nothing of a site's: its words come in worded (the kit's own
 * from AnotokiWords), its actions as functions. A site keeps a thin wrapper
 * (its `layouts/top-bar`) where its roles, status and words meet the bar.
 */
@Component({
  selector: 'anotoki-top-bar',
  exportAs: 'anotokiTopBar',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    BrandComponent,
    ButtonComponent,
    IconComponent,
    SpinnerComponent,
    LanguageSwitcherComponent,
    ThemeToggleComponent,
    MenuComponent,
    MenuItemComponent,
    MenuSeparatorComponent,
    MenuTriggerDirective,
  ],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-top-bar' },
})
export class TopBarComponent {
  protected readonly words = inject(AnotokiWords);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly brand = input.required<TopBarBrand>();
  readonly links = input<readonly TopBarLink[]>([]);
  /** The links' name; the kit's "Main navigation" by default. */
  readonly navLabel = input<string | null>(null);
  /** Who is signed in; null: nobody. */
  readonly person = input<TopBarPerson | null>(null);
  readonly menuItems = input<readonly TopBarMenuItem[]>([]);
  /** Null: Sign in is not offered. */
  readonly signIn = input<TopBarAction | null>(null);
  readonly signOut = input<TopBarAction | null>(null);
  /** The language switcher - where the site's pages are translated (never in an admin panel). */
  readonly languages = input(false, { transform: booleanAttribute });
  /** Up to this width (px) the bar is a phone's: the site's measured PHONE_BAR_MAX. */
  readonly phoneMax = input(760);
  /** From this width (px) the person's name shows beside the initial; phoneMax + 201 by default. */
  readonly nameMin = input<number | null>(null);
  /** Up to this width (px) the brand is short ("survey" with "admin panel" under it); phoneMax by default. */
  readonly shortBrandMax = input<number | null>(null);
  /** The row's width: 84rem, or 49rem for narrow pages; --anotoki-topbar-max-width overrides. */
  readonly width = input<'wide' | 'narrow'>('wide');
  readonly phoneMark = input<TopBarPhoneMark | null>(null);
  readonly menuNote = input<TopBarMenuNote | null>(null);
  readonly isolateKeys = input(true, { transform: booleanAttribute });

  /** The language now on the page, chosen in the bar (a site saves it to the account). */
  readonly languageChanged = output<string>();

  /** The bar is a phone's. */
  readonly phone: Signal<boolean> = mediaQuery(() => `(max-width: ${this.phoneMax()}px)`);
  /** Too narrow for the person's name: the initial alone. */
  protected readonly nameless = mediaQuery(() => `(max-width: ${(this.nameMin() ?? this.phoneMax() + 201) - 1}px)`);
  private readonly shortBrandWidth = mediaQuery(() => `(max-width: ${this.shortBrandMax() ?? this.phoneMax()}px)`);
  protected readonly shortBrand = computed(() => this.phone() || this.shortBrandWidth());
  protected readonly brandArea = computed(() => (this.shortBrand() ? (this.brand().short ?? this.brand().area) : this.brand().area));

  protected readonly initial = computed(() => ([...(this.person()?.name.trim() ?? '')][0] ?? '?').toUpperCase());
  /** Whether the phone's menu has anything to hold. */
  protected readonly phoneMenuHolds = computed(() => this.links().length > 0 || this.person() !== null || this.signIn() !== null);
  protected readonly phoneMenuName = computed(() => this.phoneMark()?.label || this.words.t('topbar.phoneMenu'));
  protected readonly markId = uniqueId('anotoki-topbar-mark');
  protected readonly waiting = signal<Waiting>(null);

  /** The page's address, without its query: which link is the page's. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly here = computed(() => this.path().split(/[?#]/)[0] || '/');

  private readonly personMenu = viewChild<MenuComponent>('personMenu');
  private readonly phoneMenu = viewChild<MenuComponent>('phoneMenu');
  private readonly row = viewChild<ElementRef<HTMLElement>>('row');

  /** What a change of closes an open menu: who is signed in, and which links there are. */
  private readonly personKey = computed(() => {
    const person = this.person();
    return person ? `${person.name}\n${person.email ?? ''}` : null;
  });
  private readonly linksKey = computed(() =>
    this.links()
      .map((link) => `${link.id}>${link.path}`)
      .join('|'),
  );

  constructor() {
    // Folding, unfolding (a turned tablet), another person, other links: a menu open for what was there closes.
    effect(() => {
      this.phone();
      this.personKey();
      this.linksKey();
      untracked(() => this.closeMenu(false));
    });

    if (isDevMode()) {
      this.warnWhenTheRowOverflows();
    }
  }

  /** Closes whichever menu of the bar is open; `returnFocus`: back to its button. */
  closeMenu(returnFocus: boolean): void {
    this.personMenu()?.close(returnFocus);
    this.phoneMenu()?.close(returnFocus);
  }

  /** The page is this link's own address. */
  protected isPage(link: TopBarLink): boolean {
    return this.here() === link.path;
  }

  /** The page is in this link's section: its own address or one under it. */
  protected inSection(link: TopBarLink): boolean {
    const here = this.here();
    return here === link.path || (link.under ?? []).some((start) => here.startsWith(start));
  }

  protected hasBadge(link: TopBarLink): boolean {
    return link.badge !== undefined && link.badge !== null && link.badge !== '' && link.badge !== 0;
  }

  /**
   * Sign in or Sign out. One that returns a promise keeps its item - disabled,
   * with a spinner and "Saving…" - and the menu open, the focus waiting on the
   * menu's button (a disabled item would drop it to <body>); once it settles,
   * the menu closes with the focus there.
   */
  protected async run(which: Exclude<Waiting, null>): Promise<void> {
    const action = which === 'signIn' ? this.signIn() : this.signOut();
    if (!action || this.waiting()) {
      return;
    }
    const menu = [this.personMenu(), this.phoneMenu()].find((open) => open?.isOpen());
    const result = action();
    if (result instanceof Promise || (typeof result === 'object' && result !== null && typeof (result as PromiseLike<unknown>).then === 'function')) {
      this.waiting.set(which);
      menu?.triggerElement?.focus();
      try {
        await result;
      } catch {
        // The site says what went wrong (a toast, a page); the bar only stops waiting.
      } finally {
        this.waiting.set(null);
      }
    }
    if (menu?.isOpen()) {
      menu.close(true);
    }
  }

  /** Keys pressed in the bar stay in it (isolateKeys); Escape closes a menu and puts a note away. */
  protected onKeydown(event: KeyboardEvent): void {
    if (this.isolateKeys()) {
      event.stopPropagation();
      if (event.key === 'Escape') {
        this.closeMenu(true);
        this.theme.dismissRefusal();
      }
    }
  }

  private warnWhenTheRowOverflows(): void {
    const destroyRef = inject(DestroyRef);
    let warned = false;
    afterNextRender(() => {
      const row = this.row()?.nativeElement;
      if (!row || typeof ResizeObserver !== 'function') {
        return;
      }
      const observer = new ResizeObserver(() => {
        if (!warned && !untracked(this.phone) && row.scrollWidth > row.clientWidth + 1) {
          warned = true;
          const width = this.element.ownerDocument.documentElement.clientWidth;
          console.warn(`<anotoki-top-bar>: the row overflows at ${width} px, above phoneMax (${untracked(this.phoneMax)} px). Measure the site's PHONE_BAR_MAX again with its real labels.`);
        }
      });
      observer.observe(row);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
