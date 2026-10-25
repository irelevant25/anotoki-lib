import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, effect, inject, input, linkedSignal, model, output, signal, viewChild } from '@angular/core';
import { ANOTOKI_UI_CONFIG } from '@anotoki/lib/ui/config';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { FieldBase } from '@anotoki/lib/ui/field';
import { PieceWord, pieceWords } from '@anotoki/lib/ui/piece-words';
import { DATE_FIELD_LIBRARY_WORDS } from '@anotoki/lib/words/date-field';
import { CalendarComponent } from '../calendar/calendar.component';
import { DateFieldFormat, DatePattern, dayOfIso, datePattern, fieldLocale, isoOf, readDay, writeDay } from '../dates';
import { registerDateFieldIcons } from '../icons';

/** Why what was typed is no value: no date it can read, or one before `min` or after `max`. */
type Problem = 'invalid' | 'early' | 'late';

/**
 * A date, typed or chosen in a calendar: `<anotoki-date-field label="Opens" [(value)]="opens" [format]="dateFormat" />`.
 *
 * The value is ISO - 'YYYY-MM-DD', or '' while there is none - and `dayMonth` makes it a day and a month without a
 * year (a birthday): '--MM-DD', 29 February included. The field writes the date, and reads what is typed, in the
 * reader's date format, as the kit's dates write theirs (@anotoki/lib/ui/dates): `format` when the page gives one, else
 * the anotoki account's `date_format` the kit is told (provideAnotokiUi's `dateChoices`: 'dmy_dot' 6.10.2026,
 * 'dmy_slash' 06/10/2026, 'mdy_slash' 10/06/2026, 'ymd_dash' 2026-10-06), else - a visitor, an account that chose none
 * - the page's locale's own (provideAnotokiUi's `locale`, else the page's language, English as en-GB: "6. 10. 2026" in
 * Slovak, "06/10/2026" in English); its calendar names the days in that locale too. Typing is lenient: any of . / - or
 * a space between the numbers, a 0 before one digit or none, and an ISO date whatever the format.
 *
 * A text field of the kit's (its label, hint, error, required, optional, disabled), with a button inside it that opens
 * the calendar (named "Choose a date: Opens"): a dialog of the month's days - the arrow keys, Page Up and Page Down for
 * the months, Home and End, Enter to choose, Escape back to the field (CalendarComponent). `min` and `max` ('YYYY-MM-DD')
 * bound what may be chosen; not with `dayMonth`.
 *
 * What the value is while the text is no date: '' - so a page reading the value never takes half a date. The field
 * says why under itself once the person leaves it (or presses Enter): "Write the date like 31.12.2026.", "The earliest
 * date is 1.10.2026." (the library's `anotoki.dateField.*`); the page's own `error` comes first. What is typed is never
 * rewritten under the caret: the field writes the date its way when the person leaves it, or when the value or the
 * format changes from outside.
 */
@Component({
  selector: 'anotoki-date-field',
  imports: [IconComponent, CalendarComponent],
  templateUrl: './date-field.component.html',
  styleUrl: './date-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-date-field' },
})
export class DateFieldComponent extends FieldBase {
  protected readonly word = pieceWords(DATE_FIELD_LIBRARY_WORDS);
  private readonly kit = inject(ANOTOKI_UI_CONFIG, { optional: true });

  /** 'YYYY-MM-DD' ('--MM-DD' with `dayMonth`); '' while there is none. */
  readonly value = model<string>('');
  /** The reader's date format - the account's `date_format`; null: the one the kit is told (`dateChoices`), else the locale's own way. */
  readonly format = input<DateFieldFormat | null>(null);
  /** A day and a month without a year (a birthday): the value '--MM-DD', 29 February included. */
  readonly dayMonth = input(false, { transform: booleanAttribute });
  /** The earliest date that may be chosen, 'YYYY-MM-DD'; null for none. */
  readonly min = input<string | null>(null);
  /** The latest date that may be chosen, 'YYYY-MM-DD'; null for none. */
  readonly max = input<string | null>(null);
  readonly placeholder = input('');
  readonly autocomplete = input('');

  readonly blurred = output<void>();

  protected readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  private readonly toggle = viewChild<ElementRef<HTMLButtonElement>>('toggle');
  private readonly calendar = viewChild(CalendarComponent);

  /** The locale the field writes and reads in, and its calendar names the days in: the kit's, as its dates' (ui/dates). */
  protected readonly locale = computed(() => fieldLocale(this.kit?.locale?.(), this.words.language()));

  /** How the field writes and reads dates now: the page's format, else the account's the kit knows, else the locale's own. */
  protected readonly pattern = computed(() => datePattern(this.format() ?? this.kit?.dateChoices?.()?.date_format ?? null, this.locale(), this.dayMonth()));

  /**
   * What the input holds: the value written the field's way - or what the person typed, while it says the same date
   * (or no date while the value is empty): the field never rewrites a date under the caret. A new value from the page,
   * or a new format, writes it afresh.
   */
  protected readonly text = linkedSignal<{ value: string; pattern: DatePattern; dayMonth: boolean }, string>({
    source: () => ({ value: this.value(), pattern: this.pattern(), dayMonth: this.dayMonth() }),
    computation: (source, previous) => {
      if (previous && previous.source.pattern === source.pattern && previous.source.dayMonth === source.dayMonth && this.valueFromText(previous.value) === source.value) {
        return previous.value;
      }
      const day = dayOfIso(source.value, source.dayMonth);
      return day ? writeDay(day, source.pattern) : '';
    },
  });

  /** Why the text is no value, once said (the person left the field, or pressed Enter). */
  private readonly problem = signal<Problem | null>(null);

  /** What the field says of it, in the page's language. */
  protected readonly problemWords = computed<PieceWord | null>(() => {
    const problem = this.problem();
    const pattern = this.pattern();
    if (problem === 'invalid') {
      // 31 December: its day cannot be read as a month, so the example says the order too.
      return this.word('anotoki.dateField.invalid', { example: writeDay({ year: new Date().getFullYear(), month: 12, day: 31 }, pattern) });
    }
    const bound = problem === 'early' ? dayOfIso(this.min(), false) : problem === 'late' ? dayOfIso(this.max(), false) : null;
    return bound === null ? null : this.word(problem === 'early' ? 'anotoki.dateField.tooEarly' : 'anotoki.dateField.tooLate', { date: writeDay(bound, pattern) });
  });

  /** The words under the field: the page's error first, else the field's own. */
  protected readonly shownError = computed<PieceWord | null>(() => {
    const own = this.error();
    return own ? { text: own, lang: null } : this.problemWords();
  });
  protected override readonly describedBy = computed(() => (this.shownError() ? this.errorId : this.hint() ? this.hintId : null));
  protected override readonly isInvalid = computed(() => this.invalid() || !!this.shownError());

  constructor() {
    super();
    registerDateFieldIcons(inject(AnotokiIcons));
    // The calendar hangs from the button inside the field, and gives the focus back to the field's input.
    effect(() => {
      const calendar = this.calendar();
      const toggle = this.toggle()?.nativeElement;
      if (calendar && toggle) {
        calendar.attach(toggle);
        calendar.focusBack = this.control()?.nativeElement ?? null;
      }
    });
  }

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    this.value.set(this.valueFromText(text));
    // A problem already said follows the text as the person puts it right; a new one waits until they leave.
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
    } else if (event.key === 'ArrowDown' && event.altKey && !this.disabled()) {
      // Alt+Down opens the calendar, as it opens a select.
      event.preventDefault();
      this.calendar()?.open();
    }
  }

  /** A day chosen in the calendar. */
  protected onChoose(value: string): void {
    this.problem.set(null);
    this.value.set(value);
  }

  /** Says what is wrong with the text, or writes the date the field's way. */
  private settle(): void {
    const text = this.text();
    const problem = this.problemOf(text);
    this.problem.set(problem);
    const day = problem === null ? dayOfIso(this.value(), this.dayMonth()) : null;
    if (day) {
      this.text.set(writeDay(day, this.pattern()));
    }
  }

  /** The value the text makes: a whole date the field takes, else ''. */
  private valueFromText(text: string): string {
    return this.problemOf(text) === null ? this.isoOfText(text) : '';
  }

  private isoOfText(text: string): string {
    const day = readDay(text, this.pattern(), this.dayMonth());
    return day ? isoOf(day, this.dayMonth()) : '';
  }

  private problemOf(text: string): Problem | null {
    if (text.trim() === '') {
      return null;
    }
    const iso = this.isoOfText(text);
    if (iso === '') {
      return 'invalid';
    }
    if (this.dayMonth()) {
      return null;
    }
    const min = dayOfIso(this.min(), false);
    const max = dayOfIso(this.max(), false);
    if (min && iso < isoOf(min, false)) {
      return 'early';
    }
    return max && iso > isoOf(max, false) ? 'late' : null;
  }
}
