import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, inject, input } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui';

/** `[radio]`: true / false makes a radio item, checked or not; left out, a plain item. */
function radioAttribute(value: boolean | '' | null | undefined): boolean | null {
  return value === null || value === undefined ? null : value === '' ? true : !!value;
}

/**
 * An item of an `<anotoki-menu>`, on a real `<button>` or `<a>`: role
 * "menuitem", out of the tab order (the menu's arrow keys move between items).
 *
 * `[radio]` makes it one of a menu's choices (role "menuitemradio",
 * aria-checked, a check mark when chosen) - the languages, say. `disabled`
 * leaves it out of the arrow keys. `stay`: choosing it does not close the menu
 * (an action that waits, whose item says so, and closes the menu itself).
 */
@Component({
  selector: 'button[anotokiMenuItem], a[anotokiMenuItem]',
  imports: [IconComponent],
  templateUrl: './menu-item.component.html',
  styleUrl: './menu-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-menu-item',
    '[attr.role]': 'radio() === null ? "menuitem" : "menuitemradio"',
    '[attr.aria-checked]': 'radio() === null ? null : radio()',
    tabindex: '-1',
    '[attr.disabled]': 'isButton && disabled() ? "" : null',
    '[attr.aria-disabled]': '!isButton && disabled() ? "true" : null',
    '[attr.data-stay]': 'stay() ? "" : null',
    '[attr.type]': 'isButton ? "button" : null',
  },
})
export class MenuItemComponent {
  protected readonly isButton = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName === 'BUTTON';

  readonly radio = input<boolean | null, boolean | '' | null | undefined>(null, { transform: radioAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly stay = input(false, { transform: booleanAttribute });

  protected readonly checked = computed(() => this.radio() === true);
}
