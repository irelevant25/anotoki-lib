import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiDateChoices, AnotokiUiConfig } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { DateFieldFormat } from '../dates';
import { DateFieldComponent } from './date-field.component';

@Component({
  selector: 'anotoki-test-date-fields',
  imports: [DateFieldComponent],
  template: `
    <anotoki-date-field id="opens" label="Opens" [(value)]="opens" [format]="format()" [min]="min()" [max]="max()" [hint]="hint()" [error]="error()" [disabled]="disabled()" required />
    <anotoki-date-field id="birthday" label="Birthday" [(value)]="birthday" format="dmy_dot" dayMonth />
  `,
})
class DateFieldsPageComponent {
  readonly opens = signal('2026-10-14');
  readonly birthday = signal('');
  readonly format = signal<DateFieldFormat | null>('dmy_dot');
  readonly min = signal<string | null>(null);
  readonly max = signal<string | null>(null);
  readonly hint = signal<string | null>('The day the survey opens');
  readonly error = signal<string | null>(null);
  readonly disabled = signal(false);
}

describe('<anotoki-date-field>: a date typed in the reader’s format, or chosen in a calendar', () => {
  let host: HTMLElement;
  let page: DateFieldsPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<DateFieldsPageComponent>>>;

  async function setUp(config?: () => AnotokiUiConfig): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    fixture = await draw(DateFieldsPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  }

  beforeEach(() => {
    // Today is 14 October 2026, whatever the machine says: the calendar opens on it.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0));
  });

  afterEach(() => {
    host?.remove();
    vi.useRealTimers();
  });

  const field = (id = 'opens') => host.querySelector<HTMLElement>('#' + id)!;
  const input = (id = 'opens') => field(id).querySelector<HTMLInputElement>('input')!;
  const toggle = (id = 'opens') => field(id).querySelector<HTMLButtonElement>('.anotoki-date-field__toggle')!;
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const days = () => Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('.anotoki-date-calendar__day'));
  const keyboardDay = () => dialog()!.querySelector<HTMLButtonElement>('.anotoki-date-calendar__day[tabindex="0"]')!;
  const title = () => words(dialog()!.querySelector('.anotoki-date-calendar__title'));
  const type = async (text: string, id = 'opens') => {
    input(id).value = text;
    input(id).dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const leave = async (id = 'opens') => {
    input(id).dispatchEvent(new Event('blur'));
    await settle(fixture);
  };
  const open = async (id = 'opens') => {
    toggle(id).click();
    await settle(fixture);
  };

  it('a text field of the kit’s: a real label, required, its hint; the calendar’s button named with the field’s label', async () => {
    await setUp();
    expect(field().querySelector(`label[for="${input().id}"]`)).not.toBeNull();
    expect(input().type).toBe('text');
    expect(input().required).toBe(true);
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(words(document.getElementById(input().getAttribute('aria-describedby')!))).toBe('The day the survey opens');
    expect(toggle().getAttribute('aria-label')).toBe('Choose a date: Opens');
    expect(toggle().getAttribute('aria-haspopup')).toBe('dialog');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBeNull();
    // The calendar's icon is the field's own copy of the family's.
    expect(TestBed.inject(AnotokiIcons).has('calendar')).toBe(true);
  });

  it('writes the value in the reader’s format: the account’s, or the page language’s own - English as the family writes it', async () => {
    const language = signal('en');
    await setUp(() => ({ language }));
    expect(input().value).toBe('14.10.2026');
    page.format.set('mdy_slash');
    await settle(fixture);
    expect(input().value).toBe('10/14/2026');
    page.format.set('ymd_dash');
    await settle(fixture);
    expect(input().value).toBe('2026-10-14');
    page.format.set(null);
    await settle(fixture);
    // No locale given: English is en-GB, as the kit's dates write it - never the United States' 10/14/2026.
    expect(input().value).toBe('14/10/2026');
    language.set('sk');
    await settle(fixture);
    expect(input().value).toBe('14. 10. 2026');
    page.opens.set('');
    await settle(fixture);
    expect(input().value).toBe('');
  });

  it('no format from the page: the account’s order the kit is told (dateChoices), else the kit’s locale - as the kit’s dates read them (0.11.1)', async () => {
    const locale = signal('en-GB');
    const choices = signal<AnotokiDateChoices | null>({ date_format: 'dmy_slash' });
    await setUp(() => ({ language: () => 'en', locale, dateChoices: choices }));
    page.format.set(null);
    await settle(fixture);
    // genshin's: an English page, an account that writes the day first - "15/06/2024" was no date, "01/03/2024" 3 January.
    expect(input().value).toBe('14/10/2026');
    await type('15/06/2024');
    expect(page.opens()).toBe('2024-06-15');
    await type('01/03/2024');
    expect(page.opens()).toBe('2024-03-01');

    choices.set({ date_format: 'ymd_dash' });
    await settle(fixture);
    expect(input().value).toBe('2024-03-01');

    // The account chose none: the kit's locale - the day first in en-GB, the month first in a site's en-US.
    choices.set(null);
    await settle(fixture);
    expect(input().value).toBe('01/03/2024');
    locale.set('en-US');
    await settle(fixture);
    expect(input().value).toBe('3/1/2024');
    await type('12/25/2024');
    expect(page.opens()).toBe('2024-12-25');

    // A format the page gives comes first.
    page.format.set('dmy_dot');
    await settle(fixture);
    expect(input().value).toBe('25.12.2024');
  });

  it('its calendar names the days in the same locale: the kit’s, else English as en-GB (0.11.1)', async () => {
    const locale = signal('en-US');
    await setUp(() => ({ language: () => 'en', locale }));
    await open();
    expect(keyboardDay().getAttribute('aria-label')).toBe('Wednesday, October 14, 2026');
    // The United States' week starts on Sunday.
    expect(Array.from(dialog()!.querySelectorAll('th')).map((th) => th.textContent?.trim())[0]).toBe('Sun');
    press(keyboardDay(), 'Escape');
    await settle(fixture);

    locale.set('en-GB');
    await open();
    expect(keyboardDay().getAttribute('aria-label')).toBe('Wednesday, 14 October 2026');
    expect(Array.from(dialog()!.querySelectorAll('th')).map((th) => th.textContent?.trim())[0]).toBe('Mon');
  });

  it('typing: the value follows a whole date at once, the text stays as typed until the field is left', async () => {
    await setUp();
    page.format.set('dmy_slash');
    await settle(fixture);
    await type('1/2/2026');
    expect(page.opens()).toBe('2026-02-01');
    expect(input().value).toBe('1/2/2026');
    await leave();
    expect(input().value).toBe('01/02/2026');
    // An ISO date reads in any format.
    await type('2026-03-04');
    expect(page.opens()).toBe('2026-03-04');
    await type('');
    expect(page.opens()).toBe('');
  });

  it('what is no date: the value empty at once, the field says so when left - role="alert", aria-invalid - and stops once put right', async () => {
    await setUp();
    await type('31.4.2026');
    expect(page.opens()).toBe('');
    expect(field().querySelector('.anotoki-field__error')).toBeNull();
    await leave();
    const error = field().querySelector('.anotoki-field__error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(words(error)).toBe('Write the date like 31.12.2026.');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toBe(error.id);
    expect(input().value).toBe('31.4.2026');
    await type('30.4.2026');
    expect(page.opens()).toBe('2026-04-30');
    expect(field().querySelector('.anotoki-field__error')).toBeNull();
    expect(input().getAttribute('aria-invalid')).toBeNull();
  });

  it('min and max: a date outside them is no value, and the field says which bound - the page’s own error first', async () => {
    await setUp(() => ({ language: () => 'sk' }));
    page.min.set('2026-10-01');
    page.max.set('2026-12-31');
    await settle(fixture);
    await type('30.9.2026');
    expect(page.opens()).toBe('');
    await leave();
    expect(words(field().querySelector('.anotoki-field__error'))).toBe('Najskorší možný dátum je 1.10.2026.');
    await type('1.1.2027');
    await leave();
    expect(words(field().querySelector('.anotoki-field__error'))).toBe('Najneskorší možný dátum je 31.12.2026.');
    page.error.set('Prieskum sa nedá otvoriť v tento deň.');
    await settle(fixture);
    expect(words(field().querySelector('.anotoki-field__error'))).toBe('Prieskum sa nedá otvoriť v tento deň.');
    await type('15.11.2026');
    expect(page.opens()).toBe('2026-11-15');
  });

  it('the calendar: a named modal dialog, the focus on the chosen day - aria-selected, today aria-current="date"', async () => {
    await setUp();
    page.opens.set('2026-10-20');
    await settle(fixture);
    await open();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.getAttribute('aria-modal')).toBe('true');
    expect(dialog()!.getAttribute('aria-label')).toBe('Choose a date: Opens');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-controls')).toBe(dialog()!.id);
    expect(title()).toBe('October 2026');
    const grid = dialog()!.querySelector('[role="grid"]')!;
    expect(grid.getAttribute('aria-labelledby')).toBe(dialog()!.querySelector('.anotoki-date-calendar__title')!.id);
    expect(Array.from(grid.querySelectorAll('th')).map((th) => th.textContent?.trim())).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(grid.querySelector('th')?.getAttribute('abbr')).toBe('Monday');
    expect(days().length).toBe(31);
    expect(document.activeElement).toBe(keyboardDay());
    expect(keyboardDay().getAttribute('aria-label')).toBe('Tuesday, 20 October 2026');
    expect(keyboardDay().closest('td')?.getAttribute('aria-selected')).toBe('true');
    expect(days().filter((day) => day.tabIndex === 0).length).toBe(1);
    const today = days().find((day) => day.getAttribute('aria-current') === 'date')!;
    expect(today.getAttribute('aria-label')).toBe('Wednesday, 14 October 2026');
  });

  it('the grid’s keys: arrows a day and a week, Home and End the week, Page Up and Down a month, with Shift a year', async () => {
    await setUp();
    await open();
    const at = () => keyboardDay().getAttribute('aria-label');
    expect(at()).toBe('Wednesday, 14 October 2026');
    press(keyboardDay(), 'ArrowRight');
    await settle(fixture);
    expect(at()).toBe('Thursday, 15 October 2026');
    expect(document.activeElement).toBe(keyboardDay());
    press(keyboardDay(), 'ArrowDown');
    await settle(fixture);
    expect(at()).toBe('Thursday, 22 October 2026');
    press(keyboardDay(), 'Home');
    await settle(fixture);
    expect(at()).toBe('Monday, 19 October 2026');
    press(keyboardDay(), 'End');
    await settle(fixture);
    expect(at()).toBe('Sunday, 25 October 2026');
    press(keyboardDay(), 'PageDown');
    await settle(fixture);
    expect(at()).toBe('Wednesday, 25 November 2026');
    expect(title()).toBe('November 2026');
    press(keyboardDay(), 'PageUp', { shiftKey: true });
    await settle(fixture);
    expect(at()).toBe('Tuesday, 25 November 2025');
    press(keyboardDay(), 'ArrowUp');
    await settle(fixture);
    expect(at()).toBe('Tuesday, 18 November 2025');
    expect(document.activeElement).toBe(keyboardDay());
  });

  it('choosing a day: the value, the calendar closed, the focus back on the field - its text the new date', async () => {
    await setUp();
    await open();
    press(keyboardDay(), 'ArrowRight');
    await settle(fixture);
    keyboardDay().click();
    await settle(fixture);
    expect(page.opens()).toBe('2026-10-15');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe('15.10.2026');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape closes it, the focus back on the field, nothing chosen; Tab goes round the dialog and never out of it', async () => {
    await setUp();
    await open();
    const [back, forward] = Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('.anotoki-date-calendar__step'));
    expect(back.getAttribute('aria-label')).toBe('Previous month');
    expect(forward.getAttribute('aria-label')).toBe('Next month');
    const day = keyboardDay();
    expect(press(day, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(back);
    press(back, 'Tab');
    expect(document.activeElement).toBe(forward);
    press(forward, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(back);
    press(back, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(day);

    // A pointer's press on the button: the focus on it, and staying there.
    forward.focus();
    forward.click();
    await settle(fixture);
    expect(title()).toBe('November 2026');
    expect(document.activeElement).toBe(forward);

    const escape = press(keyboardDay(), 'Escape');
    await settle(fixture);
    expect(escape.defaultPrevented).toBe(true);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(input());
    expect(page.opens()).toBe('2026-10-14');
  });

  it('min and max in the calendar: the days outside drawn but not to be chosen, the keyboard and the month buttons stopping at them', async () => {
    await setUp();
    page.opens.set('');
    page.min.set('2026-10-10');
    page.max.set('2026-11-05');
    await settle(fixture);
    await open();
    const outside = days().filter((day) => day.getAttribute('aria-disabled') === 'true');
    expect(outside.length).toBe(9);
    outside[0].click();
    await settle(fixture);
    expect(page.opens()).toBe('');
    expect(dialog()).not.toBeNull();
    const [back, forward] = Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('.anotoki-date-calendar__step'));
    expect(back.getAttribute('aria-disabled')).toBe('true');
    expect(forward.getAttribute('aria-disabled')).toBeNull();
    keyboardDay().focus();
    press(keyboardDay(), 'PageUp');
    await settle(fixture);
    expect(keyboardDay().getAttribute('aria-label')).toBe('Saturday, 10 October 2026');
    press(keyboardDay(), 'PageDown');
    await settle(fixture);
    expect(keyboardDay().getAttribute('aria-label')).toBe('Thursday, 5 November 2026');
    expect(dialog()!.querySelectorAll('.anotoki-date-calendar__step')[1].getAttribute('aria-disabled')).toBe('true');
  });

  it('a day and a month (a birthday): --MM-DD, no year in the field nor the calendar, 29 February, December before January', async () => {
    await setUp();
    await type('29.2.', 'birthday');
    expect(page.birthday()).toBe('--02-29');
    await leave('birthday');
    expect(input('birthday').value).toBe('29.2.');
    await open('birthday');
    expect(title()).toBe('February');
    expect(dialog()!.querySelector('thead')).toBeNull();
    expect(days().length).toBe(29);
    expect(keyboardDay().getAttribute('aria-label')).toBe('29 February');
    press(keyboardDay(), 'Escape');
    await settle(fixture);

    page.birthday.set('--12-31');
    await settle(fixture);
    expect(input('birthday').value).toBe('31.12.');
    await open('birthday');
    press(keyboardDay(), 'ArrowRight');
    await settle(fixture);
    expect(title()).toBe('January');
    keyboardDay().click();
    await settle(fixture);
    expect(page.birthday()).toBe('--01-01');
    expect(input('birthday').value).toBe('1.1.');
  });

  it('in the page’s language: the month and the days in its words (Intl), the buttons in the library’s - the site’s first', async () => {
    await setUp(() => ({ language: () => 'sk', lookup: (key) => ((key as string) === 'dateField.nextMonth' ? 'Ďalší mesiac' : null) }));
    await open();
    expect(title()).toBe('október 2026');
    expect(Array.from(dialog()!.querySelectorAll('th')).map((th) => th.textContent?.trim())[0]).toBe('po');
    expect(keyboardDay().getAttribute('aria-label')).toBe('streda 14. októbra 2026');
    expect(toggle().getAttribute('aria-label')).toBe('Vybrať dátum: Opens');
    const [back, forward] = Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('.anotoki-date-calendar__step'));
    expect(back.getAttribute('aria-label')).toBe('Predchádzajúci mesiac');
    expect(forward.getAttribute('aria-label')).toBe('Ďalší mesiac');
  });

  it('disabled: the field and its button; Alt+Down opens the calendar from the field', async () => {
    await setUp();
    press(input(), 'ArrowDown', { altKey: true });
    await settle(fixture);
    expect(dialog()).not.toBeNull();
    press(keyboardDay(), 'Escape');
    await settle(fixture);
    page.disabled.set(true);
    await settle(fixture);
    expect(input().disabled).toBe(true);
    expect(toggle().disabled).toBe(true);
    press(input(), 'ArrowDown', { altKey: true });
    await settle(fixture);
    expect(dialog()).toBeNull();
  });
});
