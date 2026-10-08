import { Directive, ElementRef, Signal, afterNextRender, booleanAttribute, computed, inject, input } from '@angular/core';
import { AnotokiWords, uniqueId } from '@anotoki/lib/ui';

/**
 * What every field of the kit has: a label (a real `<label for>` on a native
 * control, or kept for screen readers alone with `hideLabel`), a hint and an
 * error tied to the control by aria-describedby (the error a role="alert",
 * announced as it appears, and aria-invalid on the control), `required` or
 * `optional` (the kit's "optional" in the page's language), `disabled`, and
 * `autofocus` / focus().
 */
@Directive()
export abstract class FieldBase {
  protected readonly words = inject(AnotokiWords);

  readonly label = input.required<string>();
  readonly name = input('');
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly required = input(false, { transform: booleanAttribute });
  /** Says "optional" after the label: for the few fields of a form that may stay empty. */
  readonly optional = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  /** The label for screen readers alone (a filter bar where the placeholder says it). */
  readonly hideLabel = input(false, { transform: booleanAttribute });
  /** The focus here once the field is drawn. */
  readonly autofocus = input(false, { transform: booleanAttribute });

  protected readonly inputId = uniqueId('anotoki-field');
  protected readonly hintId = `${this.inputId}-hint`;
  protected readonly errorId = `${this.inputId}-error`;
  protected readonly describedBy = computed(() => (this.error() ? this.errorId : this.hint() ? this.hintId : null));

  /** The native control the label names and the focus goes to. */
  protected abstract readonly control: Signal<ElementRef<HTMLElement> | undefined>;

  constructor() {
    afterNextRender(() => {
      if (this.autofocus()) {
        this.focus();
      }
    });
  }

  focus(): void {
    this.control()?.nativeElement.focus();
  }
}
