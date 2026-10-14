/*
 * The date field's days: how a day is written and read in the reader's date format, its ISO value, and the
 * calendar's arithmetic. Days are year, month and day numbers, worked out in UTC: no time zone or summer time moves
 * a day here. Nothing runs at the module's top level.
 */

/** The orders the anotoki account writes a date in (the IAM's `date_format`): 6.10.2026, 06/10/2026, 10/06/2026, 2026-10-06. */
export type DateFieldFormat = 'dmy_dot' | 'dmy_slash' | 'mdy_slash' | 'ymd_dash';

/** A day of the calendar: month 1-12, day 1-31. A day and a month alone stand in ANY_YEAR. */
export interface Day {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** The year a day and a month alone are drawn in: a leap year, so 29 February is one of its days. */
export const ANY_YEAR = 2024;

type Part = 'd' | 'm' | 'y';

/** How a day is written: its numbers in order, the text before each and after the last, and which take a 0 before one digit. */
export interface DatePattern {
  readonly parts: readonly Part[];
  /** `literals[i]` stands before `parts[i]`; the last one after the last part. */
  readonly literals: readonly string[];
  readonly padDay: boolean;
  readonly padMonth: boolean;
}

/** The account's four orders - with the year, and without it (a day and a month: "6.10.", "06/10", "10/06", "10-06"). */
const FORMATS: Readonly<Record<DateFieldFormat, readonly [DatePattern, DatePattern]>> = {
  dmy_dot: [
    { parts: ['d', 'm', 'y'], literals: ['', '.', '.', ''], padDay: false, padMonth: false },
    { parts: ['d', 'm'], literals: ['', '.', '.'], padDay: false, padMonth: false },
  ],
  dmy_slash: [
    { parts: ['d', 'm', 'y'], literals: ['', '/', '/', ''], padDay: true, padMonth: true },
    { parts: ['d', 'm'], literals: ['', '/', ''], padDay: true, padMonth: true },
  ],
  mdy_slash: [
    { parts: ['m', 'd', 'y'], literals: ['', '/', '/', ''], padDay: true, padMonth: true },
    { parts: ['m', 'd'], literals: ['', '/', ''], padDay: true, padMonth: true },
  ],
  ymd_dash: [
    { parts: ['y', 'm', 'd'], literals: ['', '-', '-', ''], padDay: true, padMonth: true },
    { parts: ['m', 'd'], literals: ['', '-', ''], padDay: true, padMonth: true },
  ],
};

/** Intl's writer of days in a language - in English where the browser does not know the language - in UTC. */
export function intlDate(language: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' });
  } catch {
    return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' });
  }
}

/**
 * The language's own way of writing a day in numbers, read from Intl: "5. 1. 2026" in Slovak, "1/5/2026" in English
 * ("5. 1." and "1/5" without the year). The account's dmy_dot where Intl writes something else.
 */
function languagePattern(language: string, withYear: boolean): DatePattern {
  const fallback = FORMATS.dmy_dot[withYear ? 0 : 1];
  try {
    // 5 January: a 0 before the 5 or the 1 says that the language writes one.
    const written = intlDate(language, { day: 'numeric', month: 'numeric', ...(withYear ? { year: 'numeric' as const } : {}) }).formatToParts(new Date(Date.UTC(2026, 0, 5)));
    const parts: Part[] = [];
    const literals = [''];
    let padDay = false;
    let padMonth = false;
    for (const { type, value } of written) {
      if (type === 'literal') {
        // The marks of right-to-left writing are no text a person types.
        literals[literals.length - 1] += value.replace(/[‎‏؜]/g, '');
        continue;
      }
      if (type !== 'day' && type !== 'month' && type !== 'year') {
        return fallback;
      }
      parts.push(type === 'day' ? 'd' : type === 'month' ? 'm' : 'y');
      padDay ||= type === 'day' && value.length > 1;
      padMonth ||= type === 'month' && value.length > 1;
      literals.push('');
    }
    return parts.length === (withYear ? 3 : 2) && new Set(parts).size === parts.length ? { parts, literals, padDay, padMonth } : fallback;
  } catch {
    return fallback;
  }
}

/** How a field writes and reads its days: in the account's format, or the page language's own; with the year or without. */
export function datePattern(format: DateFieldFormat | null | undefined, language: string, dayMonth: boolean): DatePattern {
  const fixed = format ? FORMATS[format] : undefined;
  return fixed ? fixed[dayMonth ? 1 : 0] : languagePattern(language, !dayMonth);
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** A day as the pattern writes it: "6.10.2026", "06/10", "2026-10-06". */
export function writeDay(day: Day, pattern: DatePattern): string {
  let text = pattern.literals[0];
  pattern.parts.forEach((part, index) => {
    if (part === 'y') {
      text += String(day.year).padStart(4, '0');
    } else if (part === 'm') {
      text += pattern.padMonth ? pad2(day.month) : String(day.month);
    } else {
      text += pattern.padDay ? pad2(day.day) : String(day.day);
    }
    text += pattern.literals[index + 1];
  });
  return text;
}

/** Digits, and what people write between them: dots, slashes, dashes and spaces - nothing else. */
const TYPED = /^[\s.\/-]*[0-9]+(?:[\s.\/-]+[0-9]+)*[\s.\/-]*$/;

/**
 * The day a person typed, read the way the pattern writes days - leniently: any of . / - or a space between the
 * numbers, a 0 before one digit or none, and four digits first read as a year (an ISO date, whatever the order). Null
 * when it is no day: a number too many or too few, a year not of four digits, the 31st of a month of 30, a word.
 */
export function readDay(text: string, pattern: DatePattern, dayMonth: boolean): Day | null {
  const typed = text.trim();
  if (!TYPED.test(typed)) {
    return null;
  }
  const numbers = typed.match(/[0-9]+/g) ?? [];
  const parts: readonly Part[] = !dayMonth && numbers[0]?.length === 4 ? ['y', 'm', 'd'] : pattern.parts;
  if (numbers.length !== parts.length) {
    return null;
  }
  let year = ANY_YEAR;
  let month = 0;
  let day = 0;
  for (const [index, part] of parts.entries()) {
    const number = numbers[index];
    if (part === 'y') {
      if (number.length !== 4) {
        return null;
      }
      year = Number(number);
    } else if (number.length > 2) {
      return null;
    } else if (part === 'm') {
      month = Number(number);
    } else {
      day = Number(number);
    }
  }
  return isDay(year, month, day) ? { year, month, day } : null;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** How many days a month has. */
export function daysIn(year: number, month: number): number {
  if (month === 2) {
    return isLeap(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isDay(year: number, month: number, day: number): boolean {
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month);
}

/** The day an ISO value names - 'YYYY-MM-DD', or '--MM-DD' for a day and a month (29 February too) - or null. */
export function dayOfIso(value: string | null | undefined, dayMonth: boolean): Day | null {
  const match = (dayMonth ? /^--(\d{2})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/).exec(value ?? '');
  if (!match) {
    return null;
  }
  const [year, month, day] = dayMonth ? [ANY_YEAR, Number(match[1]), Number(match[2])] : [Number(match[1]), Number(match[2]), Number(match[3])];
  return isDay(year, month, day) ? { year, month, day } : null;
}

/** A day as the value: 'YYYY-MM-DD', or '--MM-DD' for a day and a month. */
export function isoOf(day: Day, dayMonth: boolean): string {
  return `${dayMonth ? '-' : String(day.year).padStart(4, '0')}-${pad2(day.month)}-${pad2(day.day)}`;
}

/** The day at midnight UTC, for Intl to write it (a year under 100 stays that year, not 19xx). */
export function dateOf(day: Day): Date {
  const date = new Date(0);
  date.setUTCFullYear(day.year, day.month - 1, day.day);
  return date;
}

/** `count` days later (earlier when negative); a day and a month alone stay in ANY_YEAR - 31 December, then 1 January. */
export function addDays(day: Day, count: number, dayMonth: boolean): Day {
  const date = dateOf(day);
  date.setUTCDate(date.getUTCDate() + count);
  return { year: dayMonth ? ANY_YEAR : date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** `count` months later (earlier when negative), the same day where that month has it: 31 March, a month back, is 29 February in a leap year. */
export function addMonths(day: Day, count: number, dayMonth: boolean): Day {
  const index = day.year * 12 + day.month - 1 + count;
  const year = dayMonth ? ANY_YEAR : Math.floor(index / 12);
  const month = (((index % 12) + 12) % 12) + 1;
  return { year, month, day: Math.min(day.day, daysIn(year, month)) };
}

/** The day of the week: 0 Sunday ... 6 Saturday. */
export function weekdayOf(day: Day): number {
  return dateOf(day).getUTCDay();
}

/** Below 0 when `a` is before `b`, 0 on the same day, above 0 after. */
export function compareDays(a: Day, b: Day): number {
  return (a.year - b.year) * 400 + (a.month - b.month) * 32 + (a.day - b.day);
}

/** Today, in the browser's own time zone; a day and a month alone in ANY_YEAR. */
export function today(dayMonth: boolean): Day {
  const now = new Date();
  return { year: dayMonth ? ANY_YEAR : now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/**
 * The day a week starts on in a language, 0 Sunday ... 6 Saturday: its country's (en-US: Sunday) where it names one
 * and the browser knows it, else Monday - ISO 8601's, and the family's home's (en, sk).
 */
export function firstWeekday(language: string): number {
  try {
    const locale = new Intl.Locale(language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    if (!locale.region) {
      return 1;
    }
    const first = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay;
    return typeof first === 'number' ? first % 7 : 1;
  } catch {
    return 1;
  }
}

/**
 * A month's days in rows of seven, null before its first day and after its last: weeks starting on `first`. A day and
 * a month alone have no weekdays (those belong to a year): rows of seven from the 1st.
 */
export function monthRows(year: number, month: number, first: number, dayMonth: boolean): (Day | null)[][] {
  const lead = dayMonth ? 0 : (weekdayOf({ year, month, day: 1 }) - first + 7) % 7;
  const cells: (Day | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysIn(year, month); day++) {
    cells.push({ year, month, day });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}
