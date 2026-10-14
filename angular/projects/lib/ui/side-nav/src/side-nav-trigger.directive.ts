import { Directive, ElementRef, effect, inject, input, untracked } from '@angular/core';
import { SideNavComponent } from './side-nav/side-nav.component';

/**
 * Makes a button of the site's - anywhere in its page: genshin's phone bar beside its brand - the one that opens a
 * side navigation's drawer on a phone, in place of the navigation's own:
 *
 * ```html
 * @if (nav.phone()) {
 *   <button anotokiButton [anotokiSideNavTrigger]="nav">Menu</button>
 * }
 * ```
 *
 * It says what it opens (aria-haspopup="dialog", aria-expanded, and aria-controls while the drawer is there) and opens
 * or closes it on a click, Enter or Space; the focus comes back to it as the drawer closes. While one is in the page,
 * the navigation draws no button of its own. The site shows it on a phone's width alone (`nav.phone()`).
 */
@Directive({
  selector: '[anotokiSideNavTrigger]',
  host: {
    'aria-haspopup': 'dialog',
    '[attr.aria-expanded]': 'nav().isOpen()',
    '[attr.aria-controls]': 'nav().isOpen() ? nav().drawerNavId : null',
    '(click)': 'nav().toggle(element)',
  },
})
export class SideNavTriggerDirective {
  protected readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly nav = input.required<SideNavComponent>({ alias: 'anotokiSideNavTrigger' });

  constructor() {
    effect((onCleanup) => {
      const nav = this.nav();
      untracked(() => nav.attach());
      onCleanup(() => nav.detach());
    });
  }
}
