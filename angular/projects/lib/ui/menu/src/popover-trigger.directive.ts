import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { PopoverComponent } from './popover/popover.component';

/**
 * Makes a button the opener of an `<anotoki-popover>`: aria-expanded, and
 * aria-controls while the box is there; a click toggles it; Escape on the
 * button closes it; the focus leaving the button for anything but the box
 * closes it too.
 */
@Directive({
  selector: '[anotokiPopoverTrigger]',
  exportAs: 'anotokiPopoverTrigger',
  host: {
    '[attr.aria-expanded]': 'popover().isOpen()',
    '[attr.aria-controls]': 'popover().isOpen() ? popover().panelId : null',
    '(click)': 'popover().toggle()',
    '(keydown)': 'onKeydown($event)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class PopoverTriggerDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly popover = input.required<PopoverComponent>({ alias: 'anotokiPopoverTrigger' });

  constructor() {
    effect(() => this.popover().attach(this.element));
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.popover().isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.popover().close(true);
    }
  }

  protected onFocusOut(event: FocusEvent): void {
    if (this.popover().isOpen()) {
      this.popover().onFocusOut(event);
    }
  }
}
