/*
 * Dates and times as every anotoki site writes them: in the anotoki account's date order and on its clock where it
 * chose them (the IAM's `preferences` claim: `date_format`, `time_format`), and otherwise the page language's own way
 * (Intl, in the page's locale); and how long ago or how soon, in the page's language. Functions alone - the pipes
 * (pipes.ts) and any page's own code call them. Nothing runs at the module's top level but the caches, marked pure.
 */

import type { AnotokiClock, AnotokiDateChoices, AnotokiDateOrder } from '@anotoki/lib/ui/config';
import { DATES_LIBRARY_WORDS } from '@anotoki/lib/words/dates';

/**
 * What a page has of a moment or a day: an ISO text - a moment ('2026-10-25T08:15:00Z', '2026-10-25 08:15:00', read
 * as UTC where it names no zone: the family's servers keep their clocks in UTC) or a calendar day ('2026-10-25', that
 * day wherever the reader is) -, milliseconds, or a Date. Nothing (null, undefined, '') is no date.
 */
export type DateValue = string | number | Date | null | undefined;

/**
 * How a day is written where the account chose no order, in the page's language: in numbers (25/10/2026, 25. 10.
 * 2026), with a short month (25 Oct 2026) or a long one (25 October 2026, 25. októbra 2026).
 */
export type DayStyle = 'numeric' | 'short' | 'long';

/** How a page writes dates: Intl's locale (the page's: 'en-GB', 'sk-SK') and the account's choices (null: none). */
export interface DateWriting {
  readonly locale: string;
  readonly choices?: AnotokiDateChoices | null;
}

/** What formatRelative() says of a moment under a minute away, and of a day it writes as a date - the page's words. */
export interface RelativeWords {
  /** Under a minute ago: "just now". */
  readonly justNow: string;
  /** Under a minute from now: "in a moment". */
  readonly soon: string;
  /** A date in a phrase, where `phrase` asks for one: "on {date}" ("{date}" in Slovak). */
  readonly onDate: string;
}

/** How formatRelative() counts. */
export interface RelativeOptions extends DateWriting {
  /** The moment it counts from: now, by default (milliseconds). */
  readonly now?: number;
  /** From how many days away the date is written instead (7); null: never - weeks become months, then years. */
  readonly dateAfter?: number | null;
  /** The date as a phrase that stands in a sentence ("on 16 Oct 2026") where it is written instead; the date alone otherwise. */
  readonly phrase?: boolean;
  /** The words: the library's built-in ones of the locale's language unless given (the pipe gives the site's). */
  readonly words?: RelativeWords;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONELESS = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;

/** Intl's writers, by locale and what they write: made once each. Marked pure: a site's build keeps a top-level `new` it is not told is pure. */
const DATE_WRITERS = /* @__PURE__ */ new Map<string, Intl.DateTimeFormat>();
const RELATIVE_WRITERS = /* @__PURE__ */ new Map<string, Intl.RelativeTimeFormat>();

/**
 * The moment a value names, or null when it names none: a calendar day ('2026-10-25') is that day at noon here, so no
 * time zone moves it to another; a moment without a zone ('2026-10-25 08:15:00') is UTC; anything else as Date reads it.
 * A day the calendar does not have ('2026-02-30') is none.
 */
export function readDate(value: DateValue): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Date(value) : null;
  }
  const text = value.trim();
  const day = DAY.exec(text);
  if (day) {
    const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
    const noon = new Date(2000, 0, 1, 12);
    // setFullYear(): the constructor would take a year under 100 for one of the 1900s.
    noon.setFullYear(year, month - 1, date);
    return noon.getFullYear() === year && noon.getMonth() === month - 1 && noon.getDate() === date ? noon : null;
  }
  const zoneless = ZONELESS.exec(text);
  if (zoneless) {
    const [year, month, date, hour, minute] = [1, 2, 3, 4, 5].map((index) => Number(zoneless[index]));
    const second = Number(zoneless[6] ?? 0);
    const milliseconds = Number((zoneless[7] ?? '0').padEnd(3, '0').slice(0, 3));
    const moment = new Date(Date.UTC(year, month - 1, date, hour, minute, second, milliseconds));
    return moment.getUTCMonth() === month - 1 && moment.getUTCDate() === date ? moment : null;
  }
  if (text === '') {
    return null;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/** A day in one of the account's orders, in the reader's time zone: 6.10.2026, 06/10/2026, 10/06/2026, 2026-10-06. */
export function formatInOrder(date: Date, order: AnotokiDateOrder): string {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = String(date.getFullYear()).padStart(4, '0');
  const pad = (value: number): string => String(value).padStart(2, '0');
  switch (order) {
    case 'dmy_dot':
      return `${day}.${month}.${year}`;
    case 'dmy_slash':
      return `${pad(day)}/${pad(month)}/${year}`;
    case 'mdy_slash':
      return `${pad(month)}/${pad(day)}/${year}`;
    case 'ymd_dash':
      return `${year}-${pad(month)}-${pad(day)}`;
  }
}

/**
 * A day: in the account's order where it chose one ("2026-10-25"), else the page language's - `style` numeric
 * ("25/10/2026"), short ("25 Oct 2026", the default) or long ("25 October 2026"; "25. októbra 2026"). Nothing is '';
 * a text that is no date comes back as it is.
 */
export function formatDate(value: DateValue, writing: DateWriting, style: DayStyle = 'short'): string {
  const date = readDate(value);
  if (date === null) {
    return unread(value);
  }
  const order = writing.choices?.date_format;
  return order ? formatInOrder(date, order) : writer(writing.locale, style).format(date);
}

/**
 * A time of day: on the account's clock where it chose one - 24 hours with two-digit hours (09:05), or 12 with the
 * language's words for am and pm (9:05 am) - else the language's own (two-digit hours and minutes); `seconds` adds
 * them. Nothing is ''; a text that is no date comes back as it is.
 */
export function formatTime(value: DateValue, writing: DateWriting, seconds = false): string {
  const date = readDate(value);
  if (date === null) {
    return unread(value);
  }
  return clockWriter(writing.locale, writing.choices?.time_format ?? null, seconds).format(date);
}

/**
 * A moment, its day and its time: where the account chose either, the two side by side - each as chosen, or the
 * language's ("2026-10-25 14:05", "25 Oct 2026 2:05 pm"); otherwise the language's own way of putting them together
 * ("25 Oct 2026, 14:05"; "25. 10. 2026, 14:05"). Nothing is ''; a text that is no date comes back as it is.
 */
export function formatDateTime(value: DateValue, writing: DateWriting, options: { readonly style?: DayStyle; readonly seconds?: boolean } = {}): string {
  const date = readDate(value);
  if (date === null) {
    return unread(value);
  }
  const style = options.style ?? 'short';
  const seconds = options.seconds ?? false;
  const choices = writing.choices;
  if (choices?.date_format || choices?.time_format) {
    return `${formatDate(date, writing, style)} ${formatTime(date, writing, seconds)}`;
  }
  return writer(writing.locale, style, seconds ? 'seconds' : 'minutes').format(date);
}

/**
 * How long ago, or how soon, in the page's language: "just now" and "in a moment" under a minute (the library's
 * words); then minutes, hours, and from a whole day away calendar days by the reader's clock - "yesterday" all the day
 * before, "2 days ago" ("predvčerom"), "in 3 days" - each in the language's own plural (Intl: "pred 1 minútou", "pred 2
 * minútami", "o 5 minút"), never fewer than one of its unit. From `dateAfter` days away (7) the date instead, in the
 * account's order or the language's short form ("16 Oct 2026") - "on 16 Oct 2026" with `phrase`; with `dateAfter` null,
 * months and then years ("last month", "2 years ago"). Nothing is ''; a text that is no date comes back as it is.
 */
export function formatRelative(value: DateValue, options: RelativeOptions): string {
  const date = readDate(value);
  if (date === null) {
    return unread(value);
  }
  const now = options.now ?? Date.now();
  const words = options.words ?? builtInWords(options.locale);
  const seconds = (now - date.getTime()) / 1000;
  const past = seconds >= 0;
  const away = Math.abs(seconds);
  const said = (count: number, unit: Intl.RelativeTimeFormatUnit): string => relativeWriter(options.locale).format(past ? -count : count, unit);
  if (away < 60) {
    return past ? words.justNow : words.soon;
  }
  if (away < 3600) {
    return said(Math.floor(away / 60), 'minute');
  }
  if (away < 86400) {
    return said(Math.floor(away / 3600), 'hour');
  }
  const days = Math.max(1, Math.abs(calendarDays(date, new Date(now))));
  const dateAfter = options.dateAfter === undefined ? 7 : options.dateAfter;
  if (dateAfter !== null && days >= dateAfter) {
    const written = formatDate(date, options);
    return options.phrase ? words.onDate.replace('{date}', written) : written;
  }
  if (dateAfter !== null || days < 30) {
    return said(days, 'day');
  }
  const months = Math.abs(calendarMonths(date, new Date(now)));
  return months < 12 ? said(Math.max(1, months), 'month') : said(Math.floor(months / 12), 'year');
}

/**
 * How many midnights of the reader's clock lie between two moments: 0 within one day, 1 from any time yesterday to any
 * time today - negative when `to` is before `from`. Rounded: the 23- and 25-hour days of a clock change are one each.
 */
export function calendarDays(from: Date, to: Date): number {
  const midnight = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((midnight(to) - midnight(from)) / 86_400_000);
}

/** Whole months between two moments by the reader's calendar (a month is whole once its day of the month is reached), negative when `to` is before `from`. */
function calendarMonths(from: Date, to: Date): number {
  const [early, late, sign] = from <= to ? [from, to, 1] : [to, from, -1];
  let months = (late.getFullYear() - early.getFullYear()) * 12 + late.getMonth() - early.getMonth();
  if (late.getDate() < early.getDate()) {
    months--;
  }
  return sign * months;
}

/** The library's own words for the locale's language: Slovak or English. */
function builtInWords(locale: string): RelativeWords {
  const table = locale.toLowerCase().split('-')[0] === 'sk' ? DATES_LIBRARY_WORDS.sk : DATES_LIBRARY_WORDS.en;
  return { justNow: table['anotoki.dates.justNow'], soon: table['anotoki.dates.soon'], onDate: table['anotoki.dates.onDate'] };
}

/** What the functions give back for a value that is no date: nothing for nothing, a text as it came. */
function unread(value: DateValue): string {
  return typeof value === 'string' ? value : '';
}

const DAY_OPTIONS: Readonly<Record<DayStyle, Intl.DateTimeFormatOptions>> = {
  numeric: { day: 'numeric', month: 'numeric', year: 'numeric' },
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
};

/** The language's writer of a day - with its time to the minute or the second. English where the browser does not know the locale. */
function writer(locale: string, style: DayStyle, time: 'minutes' | 'seconds' | null = null): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    ...DAY_OPTIONS[style],
    ...(time ? { hour: '2-digit', minute: '2-digit', ...(time === 'seconds' ? { second: '2-digit' } : {}) } : {}),
  };
  return cached(`${locale}|${style}|${time}`, locale, options);
}

/** The writer of a time of day: the account's clock, or the language's own (null). */
function clockWriter(locale: string, clock: AnotokiClock | null, seconds: boolean): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions =
    clock === '12' ? { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' } : clock === '24' ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { hour: '2-digit', minute: '2-digit' };
  return cached(`${locale}|clock|${clock}|${seconds}`, locale, seconds ? { ...options, second: '2-digit' } : options);
}

function cached(key: string, locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let found = DATE_WRITERS.get(key);
  if (!found) {
    try {
      found = new Intl.DateTimeFormat(locale, options);
    } catch {
      found = new Intl.DateTimeFormat('en-GB', options);
    }
    DATE_WRITERS.set(key, found);
  }
  return found;
}

function relativeWriter(locale: string): Intl.RelativeTimeFormat {
  let found = RELATIVE_WRITERS.get(locale);
  if (!found) {
    try {
      found = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    } catch {
      found = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
    }
    RELATIVE_WRITERS.set(locale, found);
  }
  return found;
}
