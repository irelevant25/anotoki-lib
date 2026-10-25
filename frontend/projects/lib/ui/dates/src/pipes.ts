import { Injectable, Pipe, PipeTransform, inject } from '@angular/core';
import { ANOTOKI_UI_CONFIG, AnotokiDateChoices, AnotokiWords } from '@anotoki/lib/ui/config';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { DATES_LIBRARY_WORDS } from '@anotoki/lib/words/dates';
import { DateValue, DateWriting, DayStyle, RelativeWords, formatDate, formatDateTime, formatRelative, formatTime } from './dates';

/** What the date pipe writes: a day (short, long or in numbers), a time of day, or both. */
export type DatePipeStyle = 'date' | 'day' | 'numeric' | 'time' | 'datetime';

/** The date pipe's options: `seconds` for a time with its seconds (the 'time' and 'datetime' styles). */
export interface DatePipeOptions {
  readonly seconds?: boolean;
}

/** The "ago" pipe's options - formatRelative()'s: from how many days the date instead (7, null never), and the date as a phrase. */
export interface AgoPipeOptions {
  readonly dateAfter?: number | null;
  readonly phrase?: boolean;
}

/** The family's English: day, month, year (25 Oct 2026) - the translations module's own locale for it. */
const ENGLISH = 'en-GB';

/**
 * How this page writes dates, for the pipes and a page's own code: the kit's configuration's `locale` (the translations
 * module's forKit() gives its own: en-GB, sk-SK), else the page's language - English as the family writes it, en-GB -
 * and its `dateChoices` (the account's date order and clock), else none. Read as signals: a computed() or a template
 * that asks follows a change of language or of the account's choices.
 */
@Injectable({ providedIn: 'root' })
export class AnotokiDates {
  private readonly config = inject(ANOTOKI_UI_CONFIG, { optional: true });
  private readonly words = inject(AnotokiWords);
  private readonly word = pieceWords(DATES_LIBRARY_WORDS);

  /** Intl's locale for the page: the configuration's, else its language (English as en-GB). */
  locale(): string {
    const given = this.config?.locale?.();
    if (given) {
      return given;
    }
    const language = this.words.language();
    return language === 'en' ? ENGLISH : language;
  }

  /** The account's choices, or null. */
  choices(): AnotokiDateChoices | null {
    return this.config?.dateChoices?.() ?? null;
  }

  /** The page's way of writing dates: its locale and the account's choices. */
  writing(): DateWriting {
    return { locale: this.locale(), choices: this.choices() };
  }

  /** The library's words of formatRelative(), the site's string first. */
  relativeWords(): RelativeWords {
    return { justNow: this.word('anotoki.dates.justNow').text, soon: this.word('anotoki.dates.soon').text, onDate: this.word('anotoki.dates.onDate').text };
  }

  /** formatDate(), formatTime() or formatDateTime() as the date pipe's style says, the page's way. */
  format(value: DateValue, style: DatePipeStyle = 'date', options: DatePipeOptions = {}): string {
    const writing = this.writing();
    switch (style) {
      case 'time':
        return formatTime(value, writing, options.seconds);
      case 'datetime':
        return formatDateTime(value, writing, { seconds: options.seconds });
      default:
        return formatDate(value, writing, DAY_STYLES[style]);
    }
  }

  /** formatRelative(), the page's way, from now. */
  relative(value: DateValue, options: AgoPipeOptions = {}): string {
    return formatRelative(value, { ...this.writing(), ...options, words: this.relativeWords() });
  }
}

const DAY_STYLES: Readonly<Record<'date' | 'day' | 'numeric', DayStyle>> = { date: 'short', day: 'long', numeric: 'numeric' };

/**
 * A date, the page's way: `{{ when | anotokiDate }}` - "25 Oct 2026"; `'day'` "25 October 2026", `'numeric'`
 * "25/10/2026", `'time'` "14:05", `'datetime'` "25 Oct 2026, 14:05" (`{ seconds: true }`: 14:05:09). In the account's
 * date order and on its clock where it chose them ("2026-10-25 2:05 pm"), else in the page language's (Slovak "25.
 * októbra 2026", "25. 10. 2026, 14:05"). A calendar day ('2026-10-25') is that day wherever the reader is; a moment
 * the time it is where the reader is. Nothing writes nothing; a text that is no date comes back as it came.
 *
 * Impure, as the translate pipe is: the language and the account's choices change under the same value.
 */
@Pipe({ name: 'anotokiDate', pure: false })
export class AnotokiDatePipe implements PipeTransform {
  private readonly dates = inject(AnotokiDates);

  transform(value: DateValue, style: DatePipeStyle = 'date', options?: DatePipeOptions): string {
    return this.dates.format(value, style, options);
  }
}

/**
 * How long ago or how soon, in the page's language: `{{ when | anotokiAgo }}` - "just now", "5 minutes ago",
 * "yesterday", "in 3 days" ("práve teraz", "pred 5 minútami", "včera", "o 3 dni") - and from a week away the date
 * (`{ dateAfter: 14 }` from two weeks; `{ dateAfter: null }` never: "last month", "2 years ago"); `{ phrase: true }`
 * writes that date as a phrase that stands in a sentence ("on 16 Oct 2026"). It says what is true as the page draws
 * it: a page that stays open draws it again on a timer of its own.
 *
 * Impure, as the translate pipe is: the language, the account's choices and the clock change under the same value.
 */
@Pipe({ name: 'anotokiAgo', pure: false })
export class AnotokiAgoPipe implements PipeTransform {
  private readonly dates = inject(AnotokiDates);

  transform(value: DateValue, options?: AgoPipeOptions): string {
    return this.dates.relative(value, options);
  }
}
