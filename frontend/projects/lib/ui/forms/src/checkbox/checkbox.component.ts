import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, input, model, viewChild } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui/dom';
import { IconComponent } from '@anotoki/lib/ui/icon';

/**
 * A checkbox with its label as content: `<anotoki-checkbox [(checked)]="keep">Keep me signed in</anotoki-checkbox>`.
 *
 * A native checkbox, drawn the family's way, inside its own `<label>`: the
 * whole line is the click target, Space toggles it, and a screen reader hears
 * one control with one name. `hint` is a quieter line under the label, tied to
 * the checkbox by aria-describedby.
 *
 * 0.11.0: `error` - said under it (role="alert") and tied to the checkbox too,
 * the box's edge and the checkbox marked wrong (aria-invalid) - for the box a
 * form needs ticked ("Agree to the terms"); `invalid` for one whose words are
 * said elsewhere; `required` (the page checks it: the browser's own check is a
 * convenience); and focus().
 */
@Component({
  selector: 'anotoki-checkbox',
  imports: [IconComponent],
  templateUrl: './checkbox.component.html',
  styleUrl: './checkbox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-checkbox' },
})
export class CheckboxComponent {
  readonly checked = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly name = input('');
  readonly hint = input<string | null>(null);
  /** Said under it and tied to it, the box marked wrong (0.11.0). */
  readonly error = input<string | null>(null);
  /** Wrong, with the words elsewhere: aria-invalid and the danger edge, no message under it (0.11.0). An `error` marks it too. */
  readonly invalid = input(false, { transform: booleanAttribute });
  /** It must be ticked: the native checkbox's `required` (0.11.0). */
  readonly required = input(false, { transform: booleanAttribute });

  protected readonly hintId = uniqueId('anotoki-checkbox-hint');
  protected readonly errorId = `${this.hintId}-error`;
  /** Its hint and its error, as a screen reader hears them after its name. */
  protected readonly describedBy = computed(() => [this.hint() ? this.hintId : null, this.error() ? this.errorId : null].filter(Boolean).join(' ') || null);
  protected readonly isInvalid = computed(() => this.invalid() || !!this.error());

  private readonly control = viewChild<ElementRef<HTMLInputElement>>('control');

  /** The focus on the checkbox. */
  focus(): void {
    this.control()?.nativeElement.focus();
  }

  protected onChange(event: Event): void {
    this.checked.set((event.target as HTMLInputElement).checked);
  }
}
