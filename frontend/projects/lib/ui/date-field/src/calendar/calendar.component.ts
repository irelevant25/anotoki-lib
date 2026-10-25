import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, booleanAttribute, computed, input, output, signal, viewChild } from '@angular/core';
import { tabbable, uniqueId } from '@anotoki/lib/ui/dom';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { AnchoredPanel } from '@anotoki/lib/ui/menu';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { DATE_FIELD_LIBRARY_WORDS } from '@anotoki/lib/words/date-field';
import { ANY_YEAR, Day, addDays, addMonths, compareDays, dateOf, dayOfIso, daysIn, firstWeekday, intlDate, isoOf, monthRows, today, weekdayOf } from '../dates';

/** One day of the month shown. */
interface CalendarDay {
  readonly day: Day;
  /** Its whole name, for screen readers: "Wednesday, 14 October 2026" ("14 October" for a day and a month). */
  readonly name: string;
  readonly chosen: boolean;
  readonly today: boolean;
  /** Before the earliest or after the latest date the field takes: shown, never chosen, never the keyboard's. */
  readonly out: boolean;
  /** The keyboard's day: the grid's one Tab stop. */
  readonly focus: boolean;
}

/**
 * The date field's calendar - a month's days in a dialog that opens under the field's button (the dialog-grid
 * pattern), drawn only while open, in the top layer (ui/menu's AnchoredPanel).
 *
 * The focus goes into it on the chosen day (or today, or the nearest day the field takes): the grid is one Tab stop,
 * the arrow keys move a day and a week, Home and End to the week's ends, Page Up and Page Down a month (with Shift a
 * year), Enter or Space choose; Tab and Shift+Tab go round the dialog (its two month buttons and the grid) and never
 * out of it; Escape closes it, the focus back on the field. Every day is named whole, in the field's locale
 * ("Wednesday, 14 October 2026"), and the month's name over the grid is announced as it changes; today is
 * aria-current="date", the chosen day aria-selected. Days before `min` or after `max` are drawn but cannot be chosen,
 * and the keyboard stops at them.
 *
 * A day and a month alone (`dayMonth`): the month's name with no year, the days in rows of seven from the 1st with no
 * weekdays (those belong to a year), February with its 29th, and December followed by January.
 */
@Component({
  selector: 'anotoki-date-calendar',
  imports: [IconComponent],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-date-calendar' },
})
export class CalendarComponent extends AnchoredPanel {
  protected readonly word = pieceWords(DATE_FIELD_LIBRARY_WORDS);

  /** The dialog's name: "Choose a date: Birthday". */
  readonly label = input.required<string>();
  /** The locale the days are named in - the field's (fieldLocale(): the kit's, else the page's language, English as en-GB). */
  readonly locale = input('en-GB');
  /** The field's value: the day drawn as chosen. */
  readonly value = input('');
  readonly dayMonth = input(false, { transform: booleanAttribute });
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  /** A day was chosen: its value ('YYYY-MM-DD', '--MM-DD'). */
  readonly choose = output<string>();

  /** Where the focus goes back to as it closes (Escape, a day chosen): the field's input. */
  focusBack: HTMLElement | null = null;

  protected readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  protected readonly titleId = uniqueId('anotoki-date-calendar-title');

  /** The keyboard's day; the month shown is its month. */
  protected readonly focusDay = signal<Day>({ year: ANY_YEAR, month: 1, day: 1 });
  private readonly todayDay = signal<Day | null>(null);

  private readonly language = computed(() => this.locale());
  private readonly minDay = computed(() => (this.dayMonth() ? null : dayOfIso(this.min(), false)));
  private readonly maxDay = computed(() => (this.dayMonth() ? null : dayOfIso(this.max(), false)));
  private readonly chosen = computed(() => dayOfIso(this.value(), this.dayMonth()));
  private readonly first = computed(() => firstWeekday(this.language()));

  /** The month shown, in the language's words: "October 2026", "október 2026" ("October" alone for a day and a month). */
  protected readonly title = computed(() => {
    const { year, month } = this.focusDay();
    return intlDate(this.language(), this.dayMonth() ? { month: 'long' } : { month: 'long', year: 'numeric' }).format(dateOf({ year, month, day: 1 }));
  });

  /** The columns' weekdays, from the language's first day of the week: short over the column, whole for a screen reader. */
  protected readonly weekdays = computed(() => {
    const short = intlDate(this.language(), { weekday: 'short' });
    const long = intlDate(this.language(), { weekday: 'long' });
    // 7 January 2024 was a Sunday: the day `weekday` days after it is that weekday.
    return Array.from({ length: 7 }, (_, column) => {
      const date = dateOf({ year: 2024, month: 1, day: 7 + ((this.first() + column) % 7) });
      return { short: short.format(date), long: long.format(date) };
    });
  });

  /** The month's days in rows of seven; null before its first day and after its last. */
  protected readonly rows = computed<(CalendarDay | null)[][]>(() => {
    const focus = this.focusDay();
    const dayMonth = this.dayMonth();
    const chosen = this.chosen();
    const now = this.todayDay();
    const name = intlDate(this.language(), dayMonth ? { day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return monthRows(focus.year, focus.month, this.first(), dayMonth).map((row) =>
      row.map((day) =>
        day === null
          ? null
          : {
              day,
              name: name.format(dateOf(day)),
              chosen: chosen !== null && compareDays(day, chosen) === 0,
              today: now !== null && compareDays(day, now) === 0,
              out: this.isOut(day),
              focus: compareDays(day, focus) === 0,
            },
      ),
    );
  });

  /** Whether the month before has a day the field takes (always, for a day and a month: December comes before January). */
  protected readonly canGoBack = computed(() => {
    const min = this.minDay();
    const { year, month } = this.focusDay();
    return min === null || compareDays(addDays({ year, month, day: 1 }, -1, false), min) >= 0;
  });

  protected readonly canGoForward = computed(() => {
    const max = this.maxDay();
    const { year, month } = this.focusDay();
    return max === null || compareDays(addMonths({ year, month, day: 1 }, 1, false), max) <= 0;
  });

  /** Opens on the chosen day - or today, or the nearest day the field takes - with the focus on it. */
  override open(): void {
    if (this.isOpen()) {
      return;
    }
    const dayMonth = this.dayMonth();
    const now = today(dayMonth);
    const chosen = this.chosen();
    this.todayDay.set(now);
    this.focusDay.set(chosen !== null && !this.isOut(chosen) ? chosen : this.clamp(now));
    super.open();
  }

  /** Closes it; `returnFocus`: back to the field (Escape, a day chosen) - not after a click elsewhere, which put the focus where it wanted. */
  override close(returnFocus = true): void {
    const open = this.isOpen();
    super.close(false);
    if (open && returnFocus) {
      (this.focusBack ?? this.trigger)?.focus();
    }
  }

  protected override afterOpen(): void {
    this.focusTheDay();
  }

  /** The dialog's keys: Escape closes it; Tab and Shift+Tab go round it, never out of it. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Kept here: a dialog around the field must not close as well.
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    const panel = this.panel()?.nativeElement;
    if (event.key !== 'Tab' || !panel) {
      return;
    }
    const stops = tabbable(panel);
    if (stops.length === 0) {
      return;
    }
    const index = stops.indexOf(this.document.activeElement as HTMLElement);
    const next = event.shiftKey ? (index <= 0 ? stops.length - 1 : index - 1) : index === stops.length - 1 ? 0 : index + 1;
    event.preventDefault();
    stops[next].focus();
  }

  /** The grid's keys: a day, a week, the week's ends, a month (with Shift a year). */
  protected onGridKeydown(event: KeyboardEvent): void {
    const day = this.focusDay();
    const dayMonth = this.dayMonth();
    let next: Day;
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(day, -1, dayMonth);
        break;
      case 'ArrowRight':
        next = addDays(day, 1, dayMonth);
        break;
      case 'ArrowUp':
        next = addDays(day, -7, dayMonth);
        break;
      case 'ArrowDown':
        next = addDays(day, 7, dayMonth);
        break;
      case 'Home':
        next = this.rowStart(day);
        break;
      case 'End':
        next = this.rowEnd(day);
        break;
      case 'PageUp':
        next = addMonths(day, event.shiftKey && !dayMonth ? -12 : -1, dayMonth);
        break;
      case 'PageDown':
        next = addMonths(day, event.shiftKey && !dayMonth ? 12 : 1, dayMonth);
        break;
      default:
        return;
    }
    event.preventDefault();
    this.focusDay.set(this.clamp(next));
    afterNextRender(() => this.focusTheDay(), { injector: this.injector });
  }

  /** A month button: the month before or after, the keyboard's day with it; the focus stays on the button. */
  protected step(months: number): void {
    if (months < 0 ? !this.canGoBack() : !this.canGoForward()) {
      return;
    }
    this.focusDay.set(this.clamp(addMonths(this.focusDay(), months, this.dayMonth())));
  }

  /** A day pressed (a click, Enter, Space): chosen, unless the field does not take it. */
  protected pick(cell: CalendarDay): void {
    if (cell.out) {
      return;
    }
    this.choose.emit(isoOf(cell.day, this.dayMonth()));
    this.close(true);
  }

  /** The focus went somewhere that is neither the calendar nor its button: it closes, the focus left there. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || this.panel()?.nativeElement.contains(next) || this.trigger?.contains(next)) {
      return;
    }
    this.close(false);
  }

  private focusTheDay(): void {
    this.panel()?.nativeElement.querySelector<HTMLElement>('.anotoki-date-calendar__day[tabindex="0"]')?.focus();
  }

  private isOut(day: Day): boolean {
    const min = this.minDay();
    const max = this.maxDay();
    return (min !== null && compareDays(day, min) < 0) || (max !== null && compareDays(day, max) > 0);
  }

  /** The nearest day the field takes. */
  private clamp(day: Day): Day {
    const min = this.minDay();
    const max = this.maxDay();
    if (min !== null && compareDays(day, min) < 0) {
      return min;
    }
    return max !== null && compareDays(day, max) > 0 ? max : day;
  }

  /** The first day of the day's week - of its row of seven, for a day and a month. */
  private rowStart(day: Day): Day {
    if (this.dayMonth()) {
      return { ...day, day: day.day - ((day.day - 1) % 7) };
    }
    return addDays(day, -((weekdayOf(day) - this.first() + 7) % 7), false);
  }

  private rowEnd(day: Day): Day {
    const start = this.rowStart(day);
    if (this.dayMonth()) {
      return { ...start, day: Math.min(start.day + 6, daysIn(start.year, start.month)) };
    }
    return addDays(start, 6, false);
  }
}
