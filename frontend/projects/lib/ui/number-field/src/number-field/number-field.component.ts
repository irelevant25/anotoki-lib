import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, input, linkedSignal, model, output, signal, viewChild } from '@angular/core';
import { FieldBase } from '@anotoki/lib/ui/field';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { PieceWord, pieceWords } from '@anotoki/lib/ui/piece-words';
import { NUMBER_FIELD_LIBRARY_WORDS } from '@anotoki/lib/words/number-field';

/** Why what was typed is no value: no number at all, decimals where the field takes whole numbers, off its steps, or out of its bounds. */
type Problem = 'invalid' | 'whole' | 'step' | 'small' | 'large';

/** Spaces a person - or Intl's grouping - puts between a number's digits: a space, a no-break one, a thin one. */
const GROUPING = /[\s\u00a0\u202f\u2009]/g;

/**
 * The number a text says, read leniently: a dot or a comma before the decimals (one of them), spaces between the
 * digits ("1 000"), a minus or a plus before it (the typographic minus too), no decimals after the separator ("12.").
 * Null when it says none: a word, two separators, an exponent, nothing at all.
 */
export function readNumber(text: string): number | null {
  const typed = text.replace(GROUPING, '').replace(/^\u2212/, '-');
  if (!/^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(typed)) {
    return null;
  }
  const number = Number(typed.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

/** How many decimals a number has, as it is written plainly (0.1 has 1, 1e-7 has 7). */
function decimalsOf(number: number): number {
  if (!Number.isFinite(number) || Number.isInteger(number)) {
    return 0;
  }
  const [digits, exponent] = String(number).split('e');
  const fraction = digits.split('.')[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exponent ?? 0));
}

/**
 * A number typed: `<anotoki-number-field label="Attempts a day" [(value)]="attempts" [min]="1" [max]="10" />`.
 *
 * The value is a number - or null while the field holds none: nothing typed, or a text that is no number the field
 * takes - so a page reading the value never takes half a number. What it takes: `min` and `max` (null for no bound),
 * and its `step` - 1, whole numbers, by default; 0.01 a number with two decimals at most; 5 the multiples of 5 from
 * `min` (or from 0); 'any' any number. Typing is lenient: a dot or a comma before the decimals, spaces between the
 * digits; once the person leaves the field (or presses Enter) it writes the number the page's way ("1,5" in Slovak) -
 * never under the caret - or says why it is not taken: "Write a whole number.", "The largest number is 10." (the
 * library's `anotoki.numberField.*`; the page's own `error` comes first).
 *
 * A real text input with a number keyboard on a phone (inputmode numeric, or decimal for a step with decimals; the
 * whole keyboard where the number may be below nought, as a phone's number pad has no minus) - never type="number",
 * which keeps no text it cannot read and turns a number under a scrolling wheel. A field of the kit's (its label, hint,
 * error, invalid, required, optional, disabled, hideLabel, autofocus, focus()), with a `placeholder`, `readonly`,
 * `[fieldSuffix]` content inside its edge (a unit: "ms", "%") and `blurred` when the focus leaves it. The browser's
 * check is a convenience: the server checks every number it is sent again.
 */
@Component({
  selector: 'anotoki-number-field',
  imports: [IconComponent],
  templateUrl: './number-field.component.html',
  styleUrl: './number-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-number-field' },
})
export class NumberFieldComponent extends FieldBase {
  protected readonly word = pieceWords(NUMBER_FIELD_LIBRARY_WORDS);

  /** The number; null while the field holds none. */
  readonly value = model<number | null>(null);
  /** The smallest number taken; null for no bound. */
  readonly min = input<number | null>(null);
  /** The largest number taken; null for no bound. */
  readonly max = input<number | null>(null);
  /** The steps taken: 1 (whole numbers) by default, 0.01 two decimals, 5 its multiples from `min` (or 0); 'any' any number. */
  readonly step = input<number | 'any'>(1);
  readonly placeholder = input('');
  readonly readonly = input(false, { transform: booleanAttribute });

  /** The focus left the field (a form's "touched"). */
  readonly blurred = output<void>();

  protected readonly control = viewChild<ElementRef<HTMLInputElement>>('control');

  /** How many decimals the field takes: its step's (null: any). */
  private readonly decimals = computed(() => {
    const step = this.step();
    return step === 'any' ? null : decimalsOf(step);
  });

  /** The phone's keyboard: digits, digits and a separator, or the whole keyboard where a minus may be typed. */
  protected readonly inputmode = computed(() => {
    const min = this.min();
    if (min === null || min < 0) {
      return null;
    }
    return this.decimals() === 0 ? 'numeric' : 'decimal';
  });

  /** A number written the page's way: "1.5", "1,5"; no grouping, so it reads back as it is. */
  private readonly writer = computed(() => {
    try {
      return new Intl.NumberFormat(this.words.language(), { useGrouping: false, maximumFractionDigits: 20 });
    } catch {
      return new Intl.NumberFormat('en', { useGrouping: false, maximumFractionDigits: 20 });
    }
  });

  /**
   * What the input holds: the value written the page's way - or what the person typed, while it says the same number
   * (or none while the value is null): the field never rewrites a number under the caret. A new value from the page,
   * or a new language, writes it afresh.
   */
  protected readonly text = linkedSignal<{ value: number | null; writer: Intl.NumberFormat }, string>({
    source: () => ({ value: this.value(), writer: this.writer() }),
    computation: (source, previous) => {
      if (previous && previous.source.writer === source.writer && this.numberOf(previous.value) === source.value) {
        return previous.value;
      }
      return source.value === null ? '' : source.writer.format(source.value);
    },
  });

  /** Why the text is no value, once said (the person left the field, or pressed Enter). */
  private readonly problem = signal<Problem | null>(null);

  /** What the field says of it, in the page's language. */
  protected readonly problemWords = computed<PieceWord | null>(() => {
    const write = (number: number | null): string => (number === null ? '' : this.writer().format(number));
    switch (this.problem()) {
      case 'invalid':
        return this.word('anotoki.numberField.invalid', { example: this.decimals() === 0 ? write(12) : write(1.5) });
      case 'whole':
        return this.word('anotoki.numberField.whole');
      case 'step':
        return this.word('anotoki.numberField.step', { step: write(this.step() as number) });
      case 'small':
        return this.word('anotoki.numberField.tooSmall', { min: write(this.min()) });
      case 'large':
        return this.word('anotoki.numberField.tooLarge', { max: write(this.max()) });
      default:
        return null;
    }
  });

  /** The words under the field: the page's error first, else the field's own. */
  protected readonly shownError = computed<PieceWord | null>(() => {
    const own = this.error();
    return own ? { text: own, lang: null } : this.problemWords();
  });
  protected override readonly describedBy = computed(() => (this.shownError() ? this.errorId : this.hint() ? this.hintId : null));
  protected override readonly isInvalid = computed(() => this.invalid() || !!this.shownError());

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    this.value.set(this.numberOf(text));
    if (this.problem()) {
      this.problem.set(this.problemOf(text));
    }
  }

  protected onBlur(): void {
    this.settle();
    this.blurred.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.settle();
    }
  }

  /** Says what is wrong with the text, or writes the number the page's way. */
  private settle(): void {
    const problem = this.problemOf(this.text());
    this.problem.set(problem);
    const value = this.value();
    if (problem === null && value !== null) {
      this.text.set(this.writer().format(value));
    }
  }

  /** The value the text makes: a number the field takes, else null. */
  private numberOf(text: string): number | null {
    return this.problemOf(text) === null ? readNumber(text) : null;
  }

  private problemOf(text: string): Problem | null {
    if (text.trim() === '') {
      return null;
    }
    const number = readNumber(text);
    if (number === null) {
      return 'invalid';
    }
    const step = this.step();
    if (step !== 'any' && step > 0) {
      const decimals = Math.max(decimalsOf(step), decimalsOf(this.min() ?? 0));
      if (decimalsOf(number) > decimals) {
        return step === 1 ? 'whole' : 'step';
      }
      // On whole numbers of the step's smallest part, so that 0.1 + 0.2 is never off a step of 0.1.
      const scale = 10 ** decimals;
      const from = Math.round((this.min() ?? 0) * scale);
      if ((Math.round(number * scale) - from) % Math.round(step * scale) !== 0) {
        return step === 1 ? 'whole' : 'step';
      }
    }
    const min = this.min();
    const max = this.max();
    if (min !== null && number < min) {
      return 'small';
    }
    if (max !== null && number > max) {
      return 'large';
    }
    return null;
  }
}
