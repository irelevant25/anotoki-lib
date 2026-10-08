import { Directive, ElementRef, afterNextRender, booleanAttribute, inject, input } from '@angular/core';

/**
 * Focuses its element once it has been drawn: `<h1 tabindex="-1" anotokiAutofocus>`.
 *
 * A page that swaps one step for another in place (a sign-in's password, then
 * its code) would leave the focus on a button that no longer exists, and a
 * screen reader would say nothing about the new step; with this on the new
 * step's first field - or its heading - the change is where the reader is.
 * `[anotokiAutofocus]="false"` switches it off.
 */
@Directive({ selector: '[anotokiAutofocus]' })
export class AutofocusDirective {
  readonly anotokiAutofocus = input(true, { transform: booleanAttribute });

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      if (this.anotokiAutofocus()) {
        element.focus();
      }
    });
  }
}
