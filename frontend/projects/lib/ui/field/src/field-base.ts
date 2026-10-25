import { Directive, ElementRef, Signal, afterNextRender, booleanAttribute, computed, inject, input } from '@angular/core';
import { AnotokiWords } from '@anotoki/lib/ui/config';

/**
 * The fields' ids, counted here (0.11.1) rather than by ui/dom's uniqueId(): a site's build places whole files in its
 * chunks, so the one id took every DOM helper of the kit (the focus trap's, the media queries', the popovers') into each
 * first load that draws a field, beside lazy pages that use them. No other id of the kit is named `anotoki-field-`.
 */
let fieldIds = 0;

/**
 * What every field of the kit has: a label (a real `<label for>` on a native
 * control, or kept for screen readers alone with `hideLabel`), a hint and an
 * error tied to the control by aria-describedby (the error a role="alert",
 * announced as it appears, and aria-invalid on the control), `required` or
 * `optional` (the kit's "optional" in the page's language), `disabled`, and
 * `autofocus` / focus().
 *
 * `invalid` marks the field wrong without a message of its own - aria-invalid
 * and the danger edge, the hint left as it is - for a field whose words are
 * said elsewhere: one error under a group of fields (a range's two dates), a
 * form's summary.
 */
@Directive()
export abstract class FieldBase {
  protected readonly words = inject(AnotokiWords);

  readonly label = input.required<string>();
  readonly name = input('');
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  /** Wrong, with the words elsewhere: aria-invalid and the edge, no message under the field. An `error` marks it too. */
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  /** Says "optional" after the label: for the few fields of a form that may stay empty. */
  readonly optional = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  /** The label for screen readers alone (a filter bar where the placeholder says it). */
  readonly hideLabel = input(false, { transform: booleanAttribute });
  /** The focus here once the field is drawn. */
  readonly autofocus = input(false, { transform: booleanAttribute });

  protected readonly inputId = `anotoki-field-${++fieldIds}`;
  protected readonly hintId = `${this.inputId}-hint`;
  protected readonly errorId = `${this.inputId}-error`;
  protected readonly describedBy = computed(() => (this.error() ? this.errorId : this.hint() ? this.hintId : null));
  /** aria-invalid and the danger edge: an error to say, or marked `invalid`. */
  protected readonly isInvalid = computed(() => this.invalid() || !!this.error());

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
