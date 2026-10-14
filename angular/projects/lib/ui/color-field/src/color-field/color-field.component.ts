import { ChangeDetectionStrategy, Component, ElementRef, computed, input, linkedSignal, model, output, signal, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { FieldBase } from '@anotoki/lib/ui/field';
import { PieceWord, pieceWords } from '@anotoki/lib/ui/piece-words';
import { COLOR_FIELD_LIBRARY_WORDS } from '@anotoki/lib/words/color-field';

/** A suggested colour. */
export interface ColorSwatch {
  /** The colour: '#rrggbb' (any case; the value is written lower-case). */
  readonly value: string;
  /** Its name, shown beside it and heard ("Hydro blue"): a colour is never told by its colour alone. */
  readonly name: string;
  /** The name's language, where it is not the page's. */
  readonly lang?: string | null;
}

/** A colour's code as the field takes it - '#1F5FBF', '1f5fbf', '#1f5' - written '#rrggbb' lower-case; null for anything else. */
export function readColor(text: string | null | undefined): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((text ?? '').trim());
  if (!match) {
    return null;
  }
  const hex = match[1].toLowerCase();
  return '#' + (hex.length === 3 ? hex.replace(/./g, (digit) => digit + digit) : hex);
}

/**
 * A colour: `<anotoki-color-field label="Text colour" [(value)]="color" [swatches]="elements" />`.
 *
 * The value is '#rrggbb', lower-case - or '' for none. Three ways to it, kept in step:
 *
 * - the colour box, the device's own colour picker (a native `<input type="color">`), heard "Text colour, pick from the
 *   palette" (the library's `anotoki.colorField.picker` after the label);
 * - the code beside it, a text field the label names: typed as '#1f5fbf', '1F5FBF' or '#1f5' and written the field's way
 *   once left. While it is no colour the value is '' - the box crossed out, as for no colour at all, never black - and
 *   the picker opens on the last colour; once left, the field says how to write one ("Write the colour as # and six
 *   digits or letters a–f, like #1f5fbf." - role="alert", aria-invalid), the page's own `error` first;
 * - the suggested colours (`swatches`), each a radio with its colour and its name beside it - never a colour alone - in
 *   a radio group heard "Text colour, suggested colours": one Tab stop, the arrow keys choose.
 *
 * A field of the kit's (its label, hint, error, invalid, required, optional, disabled).
 */
@Component({
  selector: 'anotoki-color-field',
  imports: [IconComponent],
  templateUrl: './color-field.component.html',
  styleUrl: './color-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-color-field' },
})
export class ColorFieldComponent extends FieldBase {
  protected readonly word = pieceWords(COLOR_FIELD_LIBRARY_WORDS);

  /** '#rrggbb' lower-case; '' for none. */
  readonly value = model<string>('');
  /** Suggested colours, each with its name. */
  readonly swatches = input<readonly ColorSwatch[]>([]);

  readonly blurred = output<void>();

  protected readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  protected readonly labelId = `${this.inputId}-label`;
  protected readonly pickerId = `${this.inputId}-picker`;
  protected readonly swatchesId = `${this.inputId}-swatches`;
  protected readonly radioName = `${this.inputId}-swatch`;

  /** The value read: '#rrggbb', or null for none. */
  protected readonly color = computed(() => readColor(this.value()));

  /** The code in the field: the value - or what the person typed, while it says the same colour (or none while the value is ''). */
  protected readonly text = linkedSignal<string | null, string>({
    source: () => this.color(),
    computation: (color, previous) => (previous && readColor(previous.value) === color ? previous.value : (color ?? '')),
  });

  /** The colour the box's picker opens on: the value's, else the last one it had (drawn crossed out meanwhile). */
  protected readonly well = linkedSignal<string | null, string>({
    source: () => this.color(),
    computation: (color, previous) => color ?? previous?.value ?? '#000000',
  });

  /** Whether the code typed is no colour, once said (the person left the field). */
  private readonly problem = signal(false);

  /** The words under the field: the page's error first, else the field's own. */
  protected readonly shownError = computed<PieceWord | null>(() => {
    const own = this.error();
    return own ? { text: own, lang: null } : this.problem() ? this.word('anotoki.colorField.invalid') : null;
  });
  protected override readonly describedBy = computed(() => (this.shownError() ? this.errorId : this.hint() ? this.hintId : null));
  protected override readonly isInvalid = computed(() => this.invalid() || !!this.shownError());

  protected isChosen(swatch: ColorSwatch): boolean {
    const color = this.color();
    return color !== null && readColor(swatch.value) === color;
  }

  /** The code typed: the value follows a whole colour at once, '' otherwise; a problem already said follows the text. */
  protected onType(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    this.value.set(readColor(text) ?? '');
    if (this.problem()) {
      this.problem.set(this.isWrong(text));
    }
  }

  /** Left: says what is wrong, or writes the code the field's way. */
  protected onBlur(): void {
    const text = this.text();
    this.problem.set(this.isWrong(text));
    const color = readColor(text);
    if (color) {
      this.text.set(color);
    }
    this.blurred.emit();
  }

  /** The device's picker: a colour as it is dragged, and once chosen. */
  protected onPick(event: Event): void {
    this.take(readColor((event.target as HTMLInputElement).value));
  }

  protected choose(swatch: ColorSwatch): void {
    this.take(readColor(swatch.value));
  }

  private take(color: string | null): void {
    if (color) {
      this.problem.set(false);
      this.value.set(color);
    }
  }

  private isWrong(text: string): boolean {
    return text.trim() !== '' && readColor(text) === null;
  }
}
