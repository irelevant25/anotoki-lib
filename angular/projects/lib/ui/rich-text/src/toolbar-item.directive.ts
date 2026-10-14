import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { RichTextToolbarComponent } from './toolbar/rich-text-toolbar.component';

/**
 * Makes one of the site's own controls an item of the toolbar it is in - a menu button for the font, a colour box:
 * `<anotoki-rich-text-toolbar ...><button anotokiToolbarItem [anotokiMenuTrigger]="sizes">Size</button></anotoki-rich-text-toolbar>`.
 *
 * It joins the toolbar's row and its one Tab stop: the arrow keys reach it as they reach the toolbar's own buttons, and
 * Tab lands on it when the focus was last on it. It keeps its own name, role and keys (Up and Down open a menu).
 */
@Directive({
  selector: '[anotokiToolbarItem]',
  host: {
    'data-anotoki-toolbar-item': '',
    '[tabIndex]': 'toolbar.isStop(element) ? 0 : -1',
  },
})
export class ToolbarItemDirective {
  protected readonly toolbar = inject(RichTextToolbarComponent);
  protected readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    this.toolbar.join(this.element);
    inject(DestroyRef).onDestroy(() => this.toolbar.leave(this.element));
  }
}
