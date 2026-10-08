import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui';
import { MenuComponent } from './menu/menu.component';

/**
 * Makes a button the menu button of an `<anotoki-menu>`:
 * `<button anotokiButton [anotokiMenuTrigger]="more">More</button>`.
 *
 * It says what it opens (aria-haspopup="menu", aria-expanded, and
 * aria-controls while the menu is there) and opens it on a click, Enter or
 * Space - the focus on the menu's checked or first item - or ArrowDown (the
 * first item) and ArrowUp (the last). Escape on the button closes an open menu.
 */
@Directive({
  selector: '[anotokiMenuTrigger]',
  exportAs: 'anotokiMenuTrigger',
  host: {
    'aria-haspopup': 'menu',
    '[attr.aria-expanded]': 'menu().isOpen()',
    '[attr.aria-controls]': 'menu().isOpen() ? menu().panelId : null',
    '[attr.id]': 'id',
    '(click)': 'toggle()',
    '(keydown)': 'onKeydown($event)',
  },
})
export class MenuTriggerDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly menu = input.required<MenuComponent>({ alias: 'anotokiMenuTrigger' });

  /** The button's own id, or one of the kit's: the menu is named by it when it has no label. */
  protected readonly id = this.element.id || uniqueId('anotoki-menu-button');

  constructor() {
    effect(() => this.menu().attach(this.element));
  }

  protected toggle(): void {
    const menu = this.menu();
    if (menu.isOpen()) {
      menu.close(true);
    } else {
      menu.open('checked');
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const menu = this.menu();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (menu.isOpen()) {
        menu.focusItem(event.key === 'ArrowDown' ? 'first' : 'last');
      } else {
        menu.open(event.key === 'ArrowDown' ? 'first' : 'last');
      }
    } else if (event.key === 'Escape' && menu.isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      menu.close(true);
    }
  }
}
