import { ANY_YEAR, addDays, addMonths, datePattern, dayOfIso, firstWeekday, isoOf, monthRows, readDay, writeDay } from './dates';

describe('the date field’s days: written and read in the reader’s format, ISO values, the calendar’s arithmetic', () => {
  const day = (year: number, month: number, date: number) => ({ year, month, day: date });

  it('the account’s four formats, with the year and without it', () => {
    const october = day(2026, 10, 6);
    expect(writeDay(october, datePattern('dmy_dot', 'en', false))).toBe('6.10.2026');
    expect(writeDay(october, datePattern('dmy_slash', 'en', false))).toBe('06/10/2026');
    expect(writeDay(october, datePattern('mdy_slash', 'en', false))).toBe('10/06/2026');
    expect(writeDay(october, datePattern('ymd_dash', 'en', false))).toBe('2026-10-06');
    expect(writeDay(october, datePattern('dmy_dot', 'en', true))).toBe('6.10.');
    expect(writeDay(october, datePattern('dmy_slash', 'en', true))).toBe('06/10');
    expect(writeDay(october, datePattern('mdy_slash', 'en', true))).toBe('10/06');
    expect(writeDay(october, datePattern('ymd_dash', 'en', true))).toBe('10-06');
  });

  it('no format: the page language’s own order and separators, read from Intl', () => {
    const october = day(2026, 10, 6);
    expect(writeDay(october, datePattern(null, 'sk', false))).toBe('6. 10. 2026');
    expect(writeDay(october, datePattern(null, 'sk', true))).toBe('6. 10.');
    expect(writeDay(october, datePattern(null, 'en', false))).toBe('10/6/2026');
    expect(writeDay(october, datePattern(null, 'en-GB', false))).toBe('06/10/2026');
    expect(writeDay(october, datePattern(null, 'ja', false))).toBe('2026/10/6');
    // A language the browser cannot read: English's way, as the kit's words fall back on English.
    expect(writeDay(october, datePattern(null, 'not a language', false))).toBe('10/6/2026');
  });

  it('reads leniently: any separator, a 0 or none, an ISO date whatever the format, spaces round it', () => {
    const dmy = datePattern('dmy_dot', 'en', false);
    for (const typed of ['6.10.2026', '06.10.2026', '6/10/2026', '6-10-2026', '6 10 2026', ' 6. 10. 2026 ', '2026-10-06']) {
      expect(readDay(typed, dmy, false), typed).toEqual(day(2026, 10, 6));
    }
    const mdy = datePattern('mdy_slash', 'en', false);
    expect(readDay('10/6/2026', mdy, false)).toEqual(day(2026, 10, 6));
    expect(readDay('2026-10-06', mdy, false)).toEqual(day(2026, 10, 6));
  });

  it('refuses what is no day: words, too few or too many numbers, a year not of four digits, a day the month does not have', () => {
    const dmy = datePattern('dmy_dot', 'en', false);
    for (const typed of ['tomorrow', '6.10.', '6.10.2026.1', '6.10.26', '32.10.2026', '31.4.2026', '29.2.2026', '6.13.2026', '0.10.2026', '6.10.0000', '6,10,2026', '006.10.2026']) {
      expect(readDay(typed, dmy, false), typed).toBeNull();
    }
    expect(readDay('29.2.2028', dmy, false)).toEqual(day(2028, 2, 29));
  });

  it('a day and a month: two numbers, 29 February always a day', () => {
    const dm = datePattern('dmy_dot', 'en', true);
    expect(readDay('29.2.', dm, true)).toEqual(day(ANY_YEAR, 2, 29));
    expect(readDay('29.2', dm, true)).toEqual(day(ANY_YEAR, 2, 29));
    expect(readDay('30.2.', dm, true)).toBeNull();
    expect(readDay('6.10.2026', dm, true)).toBeNull();
    expect(readDay('10-06', datePattern('ymd_dash', 'en', true), true)).toEqual(day(ANY_YEAR, 10, 6));
    expect(readDay('10/06', datePattern('mdy_slash', 'en', true), true)).toEqual(day(ANY_YEAR, 10, 6));
  });

  it('the value: YYYY-MM-DD, or --MM-DD for a day and a month; anything else is no day', () => {
    expect(isoOf(day(2026, 10, 6), false)).toBe('2026-10-06');
    expect(isoOf(day(4, 2, 29), false)).toBe('0004-02-29');
    expect(isoOf(day(ANY_YEAR, 2, 29), true)).toBe('--02-29');
    expect(dayOfIso('2026-10-06', false)).toEqual(day(2026, 10, 6));
    expect(dayOfIso('--02-29', true)).toEqual(day(ANY_YEAR, 2, 29));
    for (const value of ['', null, undefined, '2026-02-30', '2026-13-01', '26-10-06', '--02-29', '2026-10-06T10:00']) {
      expect(dayOfIso(value, false), String(value)).toBeNull();
    }
    expect(dayOfIso('2026-10-06', true)).toBeNull();
    expect(dayOfIso('--02-30', true)).toBeNull();
  });

  it('days and months: across months and years; a day and a month alone stay in their year, December before January', () => {
    expect(addDays(day(2026, 10, 31), 1, false)).toEqual(day(2026, 11, 1));
    expect(addDays(day(2026, 1, 1), -1, false)).toEqual(day(2025, 12, 31));
    expect(addDays(day(ANY_YEAR, 12, 31), 1, true)).toEqual(day(ANY_YEAR, 1, 1));
    expect(addDays(day(ANY_YEAR, 1, 3), -7, true)).toEqual(day(ANY_YEAR, 12, 27));
    expect(addMonths(day(2026, 3, 31), -1, false)).toEqual(day(2026, 2, 28));
    expect(addMonths(day(2028, 3, 31), -1, false)).toEqual(day(2028, 2, 29));
    expect(addMonths(day(2026, 12, 15), 1, false)).toEqual(day(2027, 1, 15));
    expect(addMonths(day(2026, 10, 6), -12, false)).toEqual(day(2025, 10, 6));
    expect(addMonths(day(ANY_YEAR, 12, 15), 1, true)).toEqual(day(ANY_YEAR, 1, 15));
    expect(addMonths(day(ANY_YEAR, 3, 31), -1, true)).toEqual(day(ANY_YEAR, 2, 29));
  });

  it('a month in weeks: Monday first where the language names no country, its country’s first day where it does', () => {
    expect(firstWeekday('sk')).toBe(1);
    expect(firstWeekday('en')).toBe(1);
    expect(firstWeekday('en-US')).toBe(0);
    expect(firstWeekday('not a language')).toBe(1);
    // October 2026 begins on a Thursday: three days of the week before it.
    const october = monthRows(2026, 10, 1, false);
    expect(october.length).toBe(5);
    expect(october[0].map((cell) => cell?.day ?? null)).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(october[4].map((cell) => cell?.day ?? null)).toEqual([26, 27, 28, 29, 30, 31, null]);
    expect(monthRows(2026, 10, 0, false)[0].map((cell) => cell?.day ?? null)).toEqual([null, null, null, null, 1, 2, 3]);
    // A day and a month alone: no weekdays, rows of seven from the 1st - February with its 29th.
    const february = monthRows(ANY_YEAR, 2, 1, true);
    expect(february[0].map((cell) => cell?.day ?? null)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(february[4].map((cell) => cell?.day ?? null)).toEqual([29, null, null, null, null, null, null]);
  });
});
