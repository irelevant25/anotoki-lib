import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { uniqueId } from '@anotoki/lib/ui/dom';
import { PieceWord, pieceWords } from '@anotoki/lib/ui/piece-words';
import { PROGRESS_LIBRARY_WORDS } from '@anotoki/lib/words/progress';

/** The fill's colour: a state the words beside it say too. */
export type ProgressTone = 'primary' | 'success' | 'warning' | 'danger';

/** A number the page's way: "1 234" in Slovak, "45 %"; the digits alone where the language is not one a browser knows. */
function written(value: number, language: string, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(language, options).format(value);
  } catch {
    return new Intl.NumberFormat('en', options).format(value);
  }
}

/**
 * How far something has come - an upload, a score out of 100, the questions answered - as a bar:
 * `<anotoki-progress-bar label="Uploading" [value]="sent()" />`.
 *
 * A role="progressbar" with its value, `min` and `max` (0 and 100 by default) and a name - `label`, shown over the
 * bar with `showLabel`, else said to screen readers alone. What it says of its value - beside the bar with
 * `showValue`, and in aria-valuetext - is the page's own words (`valueText`: a score, "n/a"), or "45 %" (`format`
 * "percent"), or "3 of 10" (`format` "count": the library's `anotoki.progress.count`), the numbers written the
 * page's way. With no value (null) nobody knows how far it is: the bar moves on its own (slowly under reduced motion -
 * a bar that stands still reads as one that stopped) and says no value at all.
 *
 * Its fill is `tone`'s colour, 3:1 at least on the track - or the site's own, `--anotoki-progress-color` on the
 * element (a grade's colour), which the site keeps at 3:1 itself.
 */
@Component({
  selector: 'anotoki-progress-bar',
  templateUrl: './progress-bar.component.html',
  styleUrl: './progress-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-progress-bar', '[attr.data-tone]': 'tone()', '[class.anotoki-progress-bar--indeterminate]': 'indeterminate()' },
})
export class ProgressBarComponent {
  private readonly words = inject(AnotokiWords);
  private readonly word = pieceWords(PROGRESS_LIBRARY_WORDS);

  /** The bar's name: what is in progress. */
  readonly label = input.required<string>();
  /** How far it is, between `min` and `max`; null while nobody knows (the bar moves on its own). */
  readonly value = input<number | null>(null);
  readonly min = input(0);
  readonly max = input(100);
  /** How the value is said: "45 %", or "3 of 10". */
  readonly format = input<'percent' | 'count'>('percent');
  /** The page's own words for the value ("87", "n/a"), instead of the format's. */
  readonly valueText = input<string | null>(null);
  /** The label over the bar; otherwise it is the bar's name for screen readers alone. */
  readonly showLabel = input(false, { transform: booleanAttribute });
  /** The value said beside the label, over the bar. */
  readonly showValue = input(false, { transform: booleanAttribute });
  readonly tone = input<ProgressTone>('primary');

  protected readonly labelId = uniqueId('anotoki-progress-label');
  protected readonly indeterminate = computed(() => {
    const value = this.value();
    return value === null || value === undefined || Number.isNaN(value);
  });
  /** The value kept between the ends. */
  protected readonly now = computed(() => Math.min(Math.max(this.value() ?? this.min(), this.min()), this.max()));
  protected readonly fraction = computed(() => {
    const span = this.max() - this.min();
    return span > 0 ? (this.now() - this.min()) / span : 0;
  });
  /** What it says of its value, and the language that is in; null while nobody knows how far it is. */
  protected readonly said = computed<PieceWord | null>(() => {
    if (this.indeterminate()) {
      return null;
    }
    const own = this.valueText();
    if (own) {
      return { text: own, lang: null };
    }
    const language = this.words.language();
    if (this.format() === 'count') {
      return this.word('anotoki.progress.count', { value: written(this.now(), language), max: written(this.max(), language) });
    }
    return { text: written(this.fraction(), language, { style: 'percent', maximumFractionDigits: 0 }), lang: null };
  });
}
