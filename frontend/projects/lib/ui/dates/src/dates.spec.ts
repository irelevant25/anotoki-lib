import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiDateChoices } from '@anotoki/lib/ui/config';
import { draw, kitProviders, settle } from '../../src/testing';
import { DateWriting, calendarDays, formatDate, formatDateTime, formatInOrder, formatRelative, formatTime, readDate } from './dates';
import { AnotokiAgoPipe, AnotokiDatePipe, AnotokiDates } from './pipes';

const EN: DateWriting = { locale: 'en-GB' };
const SK: DateWriting = { locale: 'sk-SK' };
/** 25 October 2026, 14:05:09 where the reader is. */
const MOMENT = new Date(2026, 9, 25, 14, 5, 9);

describe('dates (ui/dates): what a value names', () => {
  it('reads a moment with its zone, a zoneless one as UTC, a calendar day as that day at noon here, milliseconds and Dates', () => {
    expect(readDate('2026-10-25T08:15:00Z')?.getTime()).toBe(Date.UTC(2026, 9, 25, 8, 15));
    expect(readDate('2026-10-25T10:15:00+02:00')?.getTime()).toBe(Date.UTC(2026, 9, 25, 8, 15));
    // The family's servers keep their clocks in UTC: a TIMESTAMP without a zone is UTC.
    expect(readDate('2026-10-25 08:15:00')?.getTime()).toBe(Date.UTC(2026, 9, 25, 8, 15));
    expect(readDate('2026-10-25T08:15:30.5')?.getTime()).toBe(Date.UTC(2026, 9, 25, 8, 15, 30, 500));
    const day = readDate('2026-10-25')!;
    expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()]).toEqual([2026, 9, 25, 12]);
    // A year under 100 is that year, never one of the 1900s.
    expect(readDate('0004-02-29')!.getFullYear()).toBe(4);
    expect(readDate(MOMENT.getTime())?.getTime()).toBe(MOMENT.getTime());
    expect(readDate(MOMENT)).not.toBe(MOMENT);
    expect(readDate(MOMENT)?.getTime()).toBe(MOMENT.getTime());
  });

  it('a day the calendar lacks, a text that is no date and nothing are no date', () => {
    for (const value of ['2026-02-30', '2026-13-01', '2026-02-29 10:00', 'yesterday', '', '   ', null, undefined, Number.NaN, new Date('nope')]) {
      expect(readDate(value), String(value)).toBeNull();
    }
  });

  it('counts the midnights between two moments by the reader’s clock', () => {
    expect(calendarDays(new Date(2026, 9, 24, 23, 50), new Date(2026, 9, 25, 0, 10))).toBe(1);
    expect(calendarDays(new Date(2026, 9, 25, 0, 10), new Date(2026, 9, 25, 23, 50))).toBe(0);
    expect(calendarDays(new Date(2026, 9, 25), new Date(2026, 9, 20))).toBe(-5);
  });
});

describe("dates (ui/dates): written the account's way, else the language's", () => {
  it("the account's four orders, in the reader's time zone", () => {
    expect(formatInOrder(new Date(2026, 9, 6), 'dmy_dot')).toBe('6.10.2026');
    expect(formatInOrder(new Date(2026, 9, 6), 'dmy_slash')).toBe('06/10/2026');
    expect(formatInOrder(new Date(2026, 9, 6), 'mdy_slash')).toBe('10/06/2026');
    expect(formatInOrder(new Date(2026, 9, 6), 'ymd_dash')).toBe('2026-10-06');
  });

  it('a day: short, long or in numbers in English (as the family writes it) and in Slovak - the account’s order over them', () => {
    expect(formatDate(MOMENT, EN)).toBe('25 Oct 2026');
    expect(formatDate(MOMENT, EN, 'long')).toBe('25 October 2026');
    expect(formatDate(MOMENT, EN, 'numeric')).toBe('25/10/2026');
    expect(formatDate(MOMENT, SK, 'long')).toBe('25. októbra 2026');
    expect(formatDate(MOMENT, SK, 'numeric')).toBe('25. 10. 2026');
    expect(formatDate('2026-10-25', SK)).toBe('25. 10. 2026');
    expect(formatDate(MOMENT, { ...EN, choices: { date_format: 'ymd_dash' } }, 'long')).toBe('2026-10-25');
    expect(formatDate(MOMENT, { ...SK, choices: { date_format: 'dmy_dot', time_format: null } })).toBe('25.10.2026');
    // A clock chosen alone changes no day.
    expect(formatDate(MOMENT, { ...EN, choices: { date_format: null, time_format: '12' } })).toBe('25 Oct 2026');
  });

  it('a time of day: the language’s two-digit clock, or the account’s - 24 hours, or 12 with the language’s am and pm', () => {
    expect(formatTime(MOMENT, EN)).toBe('14:05');
    expect(formatTime(MOMENT, SK)).toBe('14:05');
    expect(formatTime(MOMENT, EN, true)).toBe('14:05:09');
    expect(formatTime(new Date(2026, 9, 25, 9, 5), { ...EN, choices: { time_format: '24' } })).toBe('09:05');
    expect(formatTime(MOMENT, { ...EN, choices: { time_format: '12' } })).toBe('2:05 pm');
    expect(formatTime(MOMENT, { ...SK, choices: { time_format: '12' } })).toBe('2:05 PM');
    expect(formatTime(MOMENT, { ...EN, choices: { time_format: '12' } }, true)).toBe('2:05:09 pm');
  });

  it("a moment: the language's own way of putting the two together, or side by side where the account chose either", () => {
    expect(formatDateTime(MOMENT, EN)).toBe('25 Oct 2026, 14:05');
    expect(formatDateTime(MOMENT, SK)).toBe('25. 10. 2026, 14:05');
    expect(formatDateTime(MOMENT, EN, { seconds: true })).toBe('25 Oct 2026, 14:05:09');
    expect(formatDateTime(MOMENT, { ...EN, choices: { date_format: 'ymd_dash', time_format: '12' } })).toBe('2026-10-25 2:05 pm');
    expect(formatDateTime(MOMENT, { ...EN, choices: { date_format: null, time_format: '12' } })).toBe('25 Oct 2026 2:05 pm');
    expect(formatDateTime(MOMENT, { ...SK, choices: { date_format: 'dmy_dot', time_format: null } })).toBe('25.10.2026 14:05');
  });

  it('nothing writes nothing; a text that is no date comes back as it came', () => {
    for (const write of [
      (value: string | null) => formatDate(value, EN),
      (value: string | null) => formatTime(value, EN),
      (value: string | null) => formatDateTime(value, EN),
      (value: string | null) => formatRelative(value, EN),
    ]) {
      expect(write(null)).toBe('');
      expect(write('')).toBe('');
      expect(write('soon')).toBe('soon');
    }
  });
});

describe('dates (ui/dates): how long ago, in the language’s plurals', () => {
  const now = MOMENT.getTime();
  const ago = (seconds: number, writing = EN, more: object = {}) => formatRelative(new Date(now - seconds * 1000), { ...writing, now, ...more });

  it('under a minute: the library’s words, past and future', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59)).toBe('just now');
    expect(ago(-30)).toBe('in a moment');
    expect(ago(10, SK)).toBe('práve teraz');
    expect(ago(-10, SK)).toBe('o chvíľu');
  });

  it('minutes and hours, rounded down, never fewer than one - English', () => {
    expect(ago(60)).toBe('1 minute ago');
    expect(ago(119)).toBe('1 minute ago');
    expect(ago(5 * 60)).toBe('5 minutes ago');
    expect(ago(59 * 60 + 59)).toBe('59 minutes ago');
    expect(ago(3600)).toBe('1 hour ago');
    expect(ago(23 * 3600)).toBe('23 hours ago');
    expect(ago(-3 * 60)).toBe('in 3 minutes');
    expect(ago(-2 * 3600)).toBe('in 2 hours');
  });

  it('the Slovak plurals: one, two to four, five and more - past and future', () => {
    expect(ago(60, SK)).toBe('pred 1 minútou');
    expect(ago(2 * 60, SK)).toBe('pred 2 minútami');
    expect(ago(5 * 60, SK)).toBe('pred 5 minútami');
    expect(ago(-60, SK)).toBe('o 1 minútu');
    expect(ago(-3 * 60, SK)).toBe('o 3 minúty');
    expect(ago(-5 * 60, SK)).toBe('o 5 minút');
    expect(ago(3600, SK)).toBe('pred 1 hodinou');
    expect(ago(4 * 3600, SK)).toBe('pred 4 hodinami');
    expect(ago(-5 * 3600, SK)).toBe('o 5 hodín');
  });

  it('calendar days from a whole day away: yesterday all the day before, then the date from a week', () => {
    const day = (offset: number, hour = 10) => new Date(2026, 9, 25 + offset, hour);
    const said = (date: Date, writing = EN, more: object = {}) => formatRelative(date, { ...writing, now, ...more });
    expect(said(day(-1, 1))).toBe('yesterday');
    expect(said(day(-1, 13))).toBe('yesterday');
    expect(said(day(-2))).toBe('2 days ago');
    expect(said(day(-2), SK)).toBe('predvčerom');
    expect(said(day(-3), SK)).toBe('pred 3 dňami');
    expect(said(day(-6))).toBe('6 days ago');
    expect(said(day(1, 20))).toBe('tomorrow');
    expect(said(day(2), SK)).toBe('pozajtra');
    expect(said(day(3), SK)).toBe('o 3 dni');
    expect(said(day(-7))).toBe('18 Oct 2026');
    expect(said(day(-7), SK)).toBe('18. 10. 2026');
    expect(said(day(-7), { ...EN, choices: { date_format: 'dmy_slash' } })).toBe('18/10/2026');
    expect(said(day(-7), EN, { phrase: true })).toBe('on 18 Oct 2026');
    expect(said(day(-7), SK, { phrase: true })).toBe('18. 10. 2026');
    expect(said(day(-10), EN, { dateAfter: 14 })).toBe('10 days ago');
  });

  it('with no date at all (dateAfter null): days up to a month, then months, then years', () => {
    const said = (date: Date, writing = EN) => formatRelative(date, { ...writing, now, dateAfter: null });
    expect(said(new Date(2026, 9, 1))).toBe('24 days ago');
    expect(said(new Date(2026, 8, 20))).toBe('last month');
    expect(said(new Date(2026, 4, 20))).toBe('5 months ago');
    expect(said(new Date(2026, 4, 20), SK)).toBe('pred 5 mesiacmi');
    expect(said(new Date(2025, 8, 1))).toBe('last year');
    expect(said(new Date(2023, 1, 1), SK)).toBe('pred 3 rokmi');
    expect(said(new Date(2027, 2, 1))).toBe('in 4 months');
  });

  it('the page’s own words in place of the library’s', () => {
    expect(ago(5, EN, { words: { justNow: 'a moment ago', soon: 'soon', onDate: 'on {date}' } })).toBe('a moment ago');
  });
});

@Component({
  selector: 'anotoki-test-dates',
  imports: [AnotokiDatePipe, AnotokiAgoPipe],
  template: `
    <span id="date">{{ moment | anotokiDate }}</span>
    <span id="day">{{ '2026-10-25' | anotokiDate: 'day' }}</span>
    <span id="numeric">{{ moment | anotokiDate: 'numeric' }}</span>
    <span id="time">{{ moment | anotokiDate: 'time' }}</span>
    <span id="seconds">{{ moment | anotokiDate: 'datetime' : { seconds: true } }}</span>
    <span id="datetime">{{ moment | anotokiDate: 'datetime' }}</span>
    <span id="ago">{{ minutesAgo | anotokiAgo }}</span>
    <span id="just">{{ justNow | anotokiAgo }}</span>
    <span id="old">{{ weekAgo | anotokiAgo: { phrase: true } }}</span>
    <span id="none">{{ none | anotokiDate }}</span>
  `,
})
class DatesPageComponent {
  readonly moment = MOMENT;
  readonly minutesAgo = new Date(Date.now() - 5 * 60_000 - 5_000).toISOString();
  readonly justNow = Date.now() - 2_000;
  readonly weekAgo = new Date(Date.now() - 9 * 86_400_000);
  readonly none = null;
}

describe('the pipes anotokiDate and anotokiAgo: the kit’s locale and the account’s choices, followed', () => {
  const language = signal('en');
  const locale = signal<string | null>(null);
  const choices = signal<AnotokiDateChoices | null>(null);
  let host: HTMLElement;
  let fixture: Awaited<ReturnType<typeof draw<DatesPageComponent>>>;

  async function setUp(lookup?: (key: string) => string | null): Promise<void> {
    TestBed.configureTestingModule({
      providers: kitProviders(() => ({
        language,
        ...(locale() !== null ? { locale: () => locale() ?? '' } : {}),
        dateChoices: choices,
        ...(lookup ? { lookup } : {}),
      })),
    });
    fixture = await draw(DatesPageComponent);
    host = fixture.nativeElement;
  }

  const text = (id: string) => host.querySelector('#' + id)!.textContent;

  beforeEach(() => {
    language.set('en');
    locale.set(null);
    choices.set(null);
  });

  afterEach(() => host?.remove());

  it('English as the family writes it (en-GB) where the site gives no locale; nothing writes nothing', async () => {
    await setUp();
    expect(text('date')).toBe('25 Oct 2026');
    expect(text('day')).toBe('25 October 2026');
    expect(text('numeric')).toBe('25/10/2026');
    expect(text('time')).toBe('14:05');
    expect(text('seconds')).toBe('25 Oct 2026, 14:05:09');
    expect(text('datetime')).toBe('25 Oct 2026, 14:05');
    expect(text('ago')).toBe('5 minutes ago');
    expect(text('just')).toBe('just now');
    expect(text('old')).toMatch(/^on \d{1,2} [A-Z][a-z]{2,3} \d{4}$/);
    expect(text('none')).toBe('');
    expect(TestBed.inject(AnotokiDates).locale()).toBe('en-GB');
  });

  it('follows the language and the account’s choices as they change', async () => {
    await setUp();
    language.set('sk');
    await settle(fixture);
    expect(text('day')).toBe('25. októbra 2026');
    expect(text('ago')).toBe('pred 5 minútami');
    expect(text('just')).toBe('práve teraz');
    expect(text('old')).toMatch(/^\d{1,2}\. \d{1,2}\. \d{4}$/);
    choices.set({ date_format: 'ymd_dash', time_format: '12' });
    await settle(fixture);
    expect(text('date')).toBe('2026-10-25');
    expect(text('day')).toBe('2026-10-25');
    expect(text('time')).toBe('2:05 PM');
    expect(text('datetime')).toBe('2026-10-25 2:05 PM');
    choices.set(null);
    await settle(fixture);
    expect(text('datetime')).toBe('25. 10. 2026, 14:05');
  });

  it('the site’s locale over the language, and the site’s string for the library’s words first', async () => {
    locale.set('en-US');
    await setUp((key) => (key === 'dates.justNow' ? 'a moment ago' : null));
    expect(text('date')).toBe('Oct 25, 2026');
    expect(text('just')).toBe('a moment ago');
    expect(TestBed.inject(AnotokiDates).locale()).toBe('en-US');
  });
});
