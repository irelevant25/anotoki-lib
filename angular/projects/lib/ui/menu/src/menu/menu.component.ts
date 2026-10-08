import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, booleanAttribute, input, signal, viewChild } from '@angular/core';
import { AnchoredPanel } from '../anchored';

/** The items of a menu a keyboard moves between: every item that is not disabled. */
const ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/** Where the focus goes as a menu opens. */
export type MenuFocus = 'first' | 'last' | 'checked';

/**
 * A menu, opened by a menu button:
 *
 * ```html
 * <button anotokiButton [anotokiMenuTrigger]="more">More</button>
 * <anotoki-menu #more label="More">
 *   <a anotokiMenuItem routerLink="/x">One</a>
 *   <button anotokiMenuItem (click)="two()">Two</button>
 *   <anotoki-menu-separator />
 *   <button anotokiMenuItem [radio]="lang === 'sk'" lang="sk">Slovenčina</button>
 * </anotoki-menu>
 * ```
 *
 * The anotoki family's rules for a menu: it is drawn only while open, under
 * its button; the focus goes into it as it opens (onto the checked item of a
 * radio menu, else the first); the arrow keys move round its items, skipping
 * disabled ones, Home and End to the ends; Escape closes it with the focus
 * back on the button; Tab and Shift+Tab close it with the focus on the button
 * as well - the browser's own move is stopped, or the focus would land on an
 * item about to go (with no zone, removed only at the next render) and then
 * on <body>; a click outside closes it and leaves the focus where it is;
 * choosing an item closes it with the focus on the button (`closeOnSelect`,
 * or an item's own `stay`).
 */
@Component({
  selector: 'anotoki-menu',
  exportAs: 'anotokiMenu',
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-menu' },
})
export class MenuComponent extends AnchoredPanel {
  /** The menu's name; without one it is named by its button. */
  readonly label = input<string | null>(null);
  /** Choosing an item closes the menu (an item with `stay` keeps it open). */
  readonly closeOnSelect = input(true, { transform: booleanAttribute });
  /** At least as wide as this, in rem. */
  readonly minWidth = input(11);

  protected readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  /** Where the focus goes once it is drawn. */
  private readonly focusOnOpen = signal<MenuFocus>('checked');

  /** Opens the menu, the focus on its first, last or checked item. */
  override open(focus: MenuFocus = 'checked'): void {
    this.focusOnOpen.set(focus);
    super.open();
  }

  /** The id of the button, which names the menu when it has no label. */
  protected triggerId(): string | null {
    return this.trigger?.id || null;
  }

  /** The items a keyboard moves between, in order. */
  items(): HTMLElement[] {
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return [];
    }
    return Array.from(panel.querySelectorAll<HTMLElement>(ITEMS)).filter((item) => !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true');
  }

  /** Puts the focus back into the open menu, on an item (after it was drawn anew, say). */
  focusItem(which: MenuFocus = 'first'): void {
    const items = this.items();
    const target = which === 'last' ? items.at(-1) : which === 'checked' ? (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0]) : items[0];
    target?.focus();
  }

  protected override afterOpen(): void {
    this.focusItem(this.focusOnOpen());
  }

  protected onKeydown(event: KeyboardEvent): void {
    const items = this.items();
    const index = items.indexOf(this.document.activeElement as HTMLElement);
    let next = -1;
    switch (event.key) {
      case 'ArrowDown':
        next = index < 0 ? 0 : (index + 1) % items.length;
        break;
      case 'ArrowUp':
        next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      case 'Escape':
        // Kept here: a dialog around the menu must not close as well.
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      case 'Tab':
        // Tab (or Shift+Tab) leaves the menu from its button, never to <body>.
        event.preventDefault();
        this.close(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (items.length) {
      items[next]?.focus();
    }
  }

  /** An item was chosen: the menu closes (unless the item stays), the focus on its button. */
  protected onClick(event: MouseEvent): void {
    const item = (event.target as Element | null)?.closest<HTMLElement>(ITEMS);
    if (!item || !this.panel()?.nativeElement.contains(item)) {
      return;
    }
    if (item.hasAttribute('disabled') || item.getAttribute('aria-disabled') === 'true' || item.hasAttribute('data-stay')) {
      return;
    }
    if (this.closeOnSelect()) {
      this.close(true);
    }
  }

  /** Re-places the menu once its items changed (a waiting item, a longer label). */
  refresh(): void {
    afterNextRender(() => this.place(), { injector: this.injector });
  }
}
