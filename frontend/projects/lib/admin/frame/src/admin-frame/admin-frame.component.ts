import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, ElementRef, Signal, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { AvatarComponent } from '@anotoki/lib/ui/avatar';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { mediaQuery } from '@anotoki/lib/ui/dom';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { SideNavComponent, SideNavGroup, SideNavTriggerDirective } from '@anotoki/lib/ui/side-nav';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';

/** The panel's name, at the top of the column: a link to the panel's home. */
export interface AdminFrameBrand {
  /** "Genshin Admin", "anotoki account · Admin panel". */
  name: string;
  /** The panel's home: the router's commands, as `routerLink` takes them ('/admin'). */
  path: string | readonly unknown[];
}

/** Who is signed in, as the site has them: either may be missing. */
export interface AdminFramePerson {
  name?: string | null;
  /** Shown under the name, unless it is the name. */
  email?: string | null;
}

/** The way out of the panel, worded by the site: "Back to the site", "Back to your account". */
export interface AdminFrameLink {
  label: string;
  /** A page of the site: the router's commands, as `routerLink` takes them. */
  path?: string | readonly unknown[] | null;
  /** Or an address elsewhere: a plain link. */
  href?: string | null;
}

/** The site's own sign-out - the function its top bar takes; one that returns a promise keeps Sign out waiting ("Saving…") until it settles. */
export type AdminFrameAction = () => unknown;

/**
 * The frame of an anotoki admin panel - genshin's, for every site (0.10.0, the owner's request of 2026-10-24): never
 * the site's top bar, so the panel is never mistaken for the site.
 *
 * - **A computer**: a column on the left, the panel's own banner (`<header>`) - the panel's name, a link to its home;
 *   who is signed in (`person`: a name and an address, either may be missing); Back (`back`, the site's words and
 *   address); Sign out (`signOut`, the site's own); the theme (`[adminFrameTheme]`: the family's switch,
 *   `<anotoki-theme-toggle>` - light, dark, as the device is set - over the shell's ThemeService, so the account's, as
 *   on every page of every site); and the panel's pages in groups, the kit's side navigation (`groups`, named
 *   `navLabel`). On the right the page: what the site puts above it (`[adminFrameNotice]`: the IAM's update line), the
 *   page in `<main id="main">`, and the site's footer after it (`[adminFrameFooter]`: `<anotoki-site-footer>`, a
 *   landmark of its own). The two columns scroll each on its own, never the window (the body's overflow, given back on
 *   a phone and as the frame goes); a new page starts at its top.
 * - **A phone** (up to `phoneMax`, 860 px by default): a row with the name and Menu, and the side navigation's drawer -
 *   which holds everything the column holds: the person, Back, Sign out, the theme above the pages. It takes the focus
 *   as it opens and gives it back to Menu as it closes (a link followed, Escape, the backdrop, its Close; a sign-out
 *   done).
 *
 * A skip link to the page moves the focus by hand: with `<base href="/">` a bare `#main` would leave the page. The
 * frame's words are the kit's - "Skip to content", "Menu", "Sign out", "Saving…", "Theme", "Admin panel" - in the
 * kit's language (English in an admin panel); the rest is the site's, worded.
 *
 * The theme's switch comes in a slot, never by an import: the shell is in a site's first load, and the library's
 * entry points never import it (the package check) - a lazy one that did would split it out of the first page's own
 * file. The site's admin layout imports it, as it imports the rest of what it draws.
 */
@Component({
  selector: 'anotoki-admin-frame',
  exportAs: 'anotokiAdminFrame',
  imports: [NgTemplateOutlet, RouterLink, AvatarComponent, ButtonComponent, IconComponent, SpinnerComponent, SideNavComponent, SideNavTriggerDirective],
  templateUrl: './admin-frame.component.html',
  styleUrl: './admin-frame.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-admin-frame', '[class.anotoki-admin-frame--phone]': 'phone()' },
})
export class AdminFrameComponent {
  protected readonly words = inject(AnotokiWords);

  /** The panel's name and home, at the top of the column (and of the phone's row and drawer). */
  readonly brand = input.required<AdminFrameBrand>();
  /** Who is signed in; null: no one shown. */
  readonly person = input<AdminFramePerson | null>(null);
  /** "Back to …": the site's words and address; null: none. */
  readonly back = input<AdminFrameLink | null>(null);
  /** The site's sign-out; null: no Sign out. */
  readonly signOut = input<AdminFrameAction | null>(null);
  /** The panel's pages, in groups: the kit's side navigation's (`SideNavGroup`, @anotoki/lib/ui/side-nav). */
  readonly groups = input.required<readonly SideNavGroup[]>();
  /** The navigation's name; the kit's "Admin panel" by default. */
  readonly navLabel = input<string | null>(null);
  /** The id of the link to mark as the page's, whatever the address says (the side navigation's `current`). */
  readonly current = input<string | null>(null);
  /** Up to this width (px) the frame is a phone's: a row and the drawer. Null: never. */
  readonly phoneMax = input<number | null>(860);
  /** The skip link's words; the kit's "Skip to content" by default. */
  readonly skipLabel = input<string | null>(null);

  private readonly narrow = mediaQuery(() => `(max-width: ${this.phoneMax() ?? 0}px)`);
  /** The frame is a phone's: the row and the drawer in place of the column. */
  readonly phone: Signal<boolean> = computed(() => this.phoneMax() !== null && this.narrow());

  protected readonly navName = computed(() => this.navLabel() || this.words.t('topbar.admin'));
  protected readonly skip = computed(() => this.skipLabel() || this.words.t('topbar.skipToContent'));

  /** The person as shown: the name first (or the address alone), the address under it unless it is the name. */
  protected readonly shown = computed(() => {
    const name = this.person()?.name?.trim() || null;
    const email = this.person()?.email?.trim() || null;
    const first = name ?? email;
    return first ? { first, second: name && email && email !== name ? email : null } : null;
  });

  /** The site's sign-out is under way (it returned a promise not settled yet). */
  protected readonly signingOut = signal(false);

  private readonly nav = viewChild(SideNavComponent);
  private readonly pageColumn = viewChild<ElementRef<HTMLElement>>('pageColumn');

  constructor() {
    const destroyRef = inject(DestroyRef);

    // On a computer only the two columns scroll, each on its own - never the window, which would draw a second
    // scrollbar beside the page's (genshin's experience). On a phone the page scrolls in the window, under the row. The
    // body outlives the frame: its own overflow is given back on a phone and as the frame goes.
    const body = inject(DOCUMENT).body;
    const overflow = body.style.overflow;
    effect(() => {
      body.style.overflow = this.phone() ? overflow : 'hidden';
    });
    destroyRef.onDestroy(() => (body.style.overflow = overflow));

    // A new page starts at its top, as in the window: on a computer the page's column is what scrolls, and the router's
    // own scrolling knows the window alone. A change of the query alone (a page's filters kept in the address) keeps
    // the place.
    const router = inject(Router);
    let path = pathOf(router.url);
    const navigations = router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) {
        return;
      }
      const next = pathOf(event.urlAfterRedirects);
      if (next !== path) {
        path = next;
        const column = this.pageColumn()?.nativeElement;
        if (column && !untracked(this.phone)) {
          column.scrollTop = 0;
        }
      }
    });
    destroyRef.onDestroy(() => navigations.unsubscribe());
  }

  /** The skip link: the focus to the page by hand (a bare #main would resolve against <base href> and leave it). */
  protected skipTo(event: Event, main: HTMLElement): void {
    event.preventDefault();
    main.focus();
  }

  /**
   * Sign out: the site's own. One that returns a promise keeps the button saying "Saving…" (aria-busy, aria-disabled
   * - never disabled, which would drop the focus to <body>) and deaf to presses until it settles; then, pressed in the
   * phone's drawer, the drawer closes with the focus back on Menu.
   */
  protected async signOutNow(): Promise<void> {
    const action = this.signOut();
    if (!action || this.signingOut()) {
      return;
    }
    const result = action();
    if (typeof (result as PromiseLike<unknown> | null)?.then === 'function') {
      this.signingOut.set(true);
      try {
        await result;
      } catch {
        // The site says what went wrong (a toast, a page); the frame only stops waiting.
      } finally {
        this.signingOut.set(false);
      }
    }
    this.nav()?.close();
  }
}

/** An address without its query and fragment: the page it names. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0] || '/';
}
