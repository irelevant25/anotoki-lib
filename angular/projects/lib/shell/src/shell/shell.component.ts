import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AnotokiWords, IconComponent } from '@anotoki/lib/ui';

/** A section of the side navigation (an admin panel's). */
export interface ShellNavItem {
  link: string;
  label: string;
  /** One of the kit's icons, or one the site registered. */
  icon?: string;
  /** Marked only on this exact address - for the area's own home, which every other address starts with. */
  exact?: boolean;
}

/**
 * The frame of a site's pages: a skip link to the page, the site's bar (any
 * bar: the family's <anotoki-top-bar>, or a site's own header, in the
 * `topBar` slot), an optional side navigation, and the page in
 * `<main id="main">` - with whatever the site puts in `shellFooter` under it.
 *
 * The skip link moves the focus by hand: with `<base href="/">` a bare `#main`
 * would resolve to "/#main" and leave the page. The side navigation (`nav`) is
 * a list of 15rem beside the page, a scrolling strip under the bar up to
 * 860 px. With it the frame is 88rem wide, else 84rem - and the family's bar
 * inside lines up with it.
 */
@Component({
  selector: 'anotoki-shell',
  imports: [IconComponent, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-shell', '[class.has-nav]': 'nav().length > 0' },
})
export class ShellComponent {
  protected readonly words = inject(AnotokiWords);

  readonly nav = input<readonly ShellNavItem[]>([]);
  /** The side navigation's name ("Admin panel"); the kit's "Main navigation" by default. */
  readonly navLabel = input<string | null>(null);
  /** The skip link's words; the kit's "Skip to content" by default. */
  readonly skipLabel = input<string | null>(null);

  protected readonly skip = computed(() => this.skipLabel() || this.words.t('topbar.skipToContent'));

  protected skipTo(event: Event, main: HTMLElement): void {
    event.preventDefault();
    main.focus();
  }
}
