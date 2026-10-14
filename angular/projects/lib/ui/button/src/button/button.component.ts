import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, booleanAttribute, computed, inject, input, isDevMode } from '@angular/core';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * The look of a button, put on a real `<button>` or `<a>`:
 * `<button anotokiButton variant="primary">Save</button>`.
 *
 * An attribute component rather than a wrapper, so the element keeps
 * everything the browser gives it - type, form submission, keyboard, focus -
 * and a link stays a link a person can open in a new tab. Its styles set
 * everything they rely on, so a site's own `button {}` rules do not show
 * through.
 *
 * `loading` keeps the label in place (the spinner sits beside it, so the
 * button does not change width under the pointer), disables the button, and
 * says aria-busy. `disabled` is an input, written back to the element: the
 * attribute on a button; on a link aria-disabled, out of the tab order and
 * deaf to the pointer, since a link has no disabled state of its own.
 *
 * Every size is a target a finger can hit: 44 px (34 for `sm`), and a `link`
 * button reads as a link but keeps the 44 px height (24 px for `sm`, and 44
 * again where the pointer is a finger). `danger-ghost` is the quiet red of a
 * row's Delete beside its other quiet buttons: no ground until hovered, its
 * words and icon in the ink of what cannot be undone.
 */
@Component({
  selector: 'button[anotokiButton], a[anotokiButton]',
  imports: [SpinnerComponent],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-button',
    '[class.anotoki-button--primary]': 'variant() === "primary"',
    '[class.anotoki-button--secondary]': 'variant() === "secondary"',
    '[class.anotoki-button--ghost]': 'variant() === "ghost"',
    '[class.anotoki-button--danger]': 'variant() === "danger"',
    '[class.anotoki-button--danger-ghost]': 'variant() === "danger-ghost"',
    '[class.anotoki-button--link]': 'variant() === "link"',
    '[class.anotoki-button--sm]': 'size() === "sm"',
    '[class.anotoki-button--lg]': 'size() === "lg"',
    '[class.anotoki-button--block]': 'block()',
    '[class.anotoki-button--icon]': 'iconOnly()',
    '[class.anotoki-button--loading]': 'loading()',
    '[class.anotoki-button--disabled]': 'inert()',
    '[attr.disabled]': 'isButton && inert() ? "" : null',
    '[attr.aria-disabled]': '!isButton && inert() ? "true" : null',
    '[attr.tabindex]': '!isButton && inert() ? "-1" : null',
    '[attr.aria-busy]': 'loading() ? "true" : null',
    '[attr.type]': 'isButton ? type() : null',
  },
})
export class ButtonComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly block = input(false, { transform: booleanAttribute });
  /** A square button holding one icon; it needs an aria-label (a tooltip repeating it helps sighted people). */
  readonly iconOnly = input(false, { transform: booleanAttribute });
  /** `button` by default, so a button inside a form never submits it by accident. */
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  protected readonly isButton = this.element.tagName === 'BUTTON';
  protected readonly inert = computed(() => this.disabled() || this.loading());

  constructor() {
    if (isDevMode()) {
      afterNextRender(() => {
        if (this.iconOnly() && !this.element.getAttribute('aria-label') && !this.element.getAttribute('aria-labelledby')) {
          console.warn('[anotokiButton] iconOnly: the button has no words of its own - give it an aria-label.', this.element);
        }
      });
    }
  }
}
