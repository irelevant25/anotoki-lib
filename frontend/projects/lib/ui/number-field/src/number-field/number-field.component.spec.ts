import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { NumberFieldComponent, readNumber } from './number-field.component';

@Component({
  selector: 'anotoki-test-number-fields',
  imports: [NumberFieldComponent],
  template: `
    <anotoki-number-field id="attempts" label="Attempts a day" [(value)]="attempts" [min]="1" [max]="10" hint="From 1 to 10" />
    <anotoki-number-field id="price" label="Price" [(value)]="price" [min]="0" [step]="0.01" [error]="error()"><span fieldSuffix>€</span></anotoki-number-field>
    <anotoki-number-field id="offset" label="Offset" [(value)]="offset" step="any" optional />
    <anotoki-number-field id="fives" label="Minutes" [(value)]="minutes" [min]="0" [step]="5" />
  `,
})
class NumberFieldsPageComponent {
  readonly attempts = signal<number | null>(3);
  readonly price = signal<number | null>(null);
  readonly offset = signal<number | null>(null);
  readonly minutes = signal<number | null>(null);
  readonly error = signal<string | null>(null);
}

describe('<anotoki-number-field>: a number typed, its value a number or null', () => {
  const language = signal('en');
  let host: HTMLElement;
  let page: NumberFieldsPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<NumberFieldsPageComponent>>>;

  beforeEach(async () => {
    language.set('en');
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language })) });
    fixture = await draw(NumberFieldsPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const input = (id = 'attempts') => host.querySelector<HTMLInputElement>(`#${id} input`)!;
  const error = (id = 'attempts') => words(host.querySelector(`#${id} .anotoki-field__error`));
  const type = async (text: string, id = 'attempts') => {
    input(id).value = text;
    input(id).dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const leave = async (id = 'attempts') => {
    input(id).dispatchEvent(new Event('blur'));
    await settle(fixture);
  };

  it('reads a number leniently: a dot or a comma, spaces between the digits, a minus of either kind', () => {
    expect(readNumber('12')).toBe(12);
    expect(readNumber(' 1,5 ')).toBe(1.5);
    expect(readNumber('1.5')).toBe(1.5);
    expect(readNumber('1 000')).toBe(1000);
    expect(readNumber('-3')).toBe(-3);
    expect(readNumber('\u{2212}3')).toBe(-3);
    expect(readNumber('+4')).toBe(4);
    expect(readNumber('12.')).toBe(12);
    expect(readNumber(',5')).toBe(0.5);
    for (const text of ['', 'abc', '1.2.3', '1,2.3', '1e3', '--1', '.', '-']) {
      expect(readNumber(text), text).toBeNull();
    }
  });

  it('a real text input with its label, a number keyboard on a phone, the hint tied to it', () => {
    expect(input().type).toBe('text');
    expect(host.querySelector(`label[for="${input().id}"]`)?.textContent?.trim()).toBe('Attempts a day');
    expect(input().getAttribute('inputmode')).toBe('numeric');
    expect(input('price').getAttribute('inputmode')).toBe('decimal');
    // A number that may be below nought: the whole keyboard, as a phone's number pad has no minus.
    expect(input('offset').hasAttribute('inputmode')).toBe(false);
    expect(words(document.getElementById(input().getAttribute('aria-describedby')!))).toBe('From 1 to 10');
    expect(input().value).toBe('3');
    expect(words(host.querySelector('#price [fieldSuffix]'))).toBe('€');
  });

  it('typing: a number taken is the value at once; anything else is null, and why is said once the field is left', async () => {
    await type('7');
    expect(page.attempts()).toBe(7);
    await type('7.5');
    expect(page.attempts()).toBeNull();
    expect(error()).toBeNull();
    await leave();
    expect(error()).toBe('Write a whole number.');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toBe(host.querySelector('#attempts .anotoki-field__error')!.id);
    await type('12');
    expect(error()).toBe('The largest number is 10.');
    await type('0');
    expect(error()).toBe('The smallest number is 1.');
    await type('many');
    expect(error()).toBe('Write a number, like 12.');
    await type('4');
    expect(error()).toBeNull();
    expect(page.attempts()).toBe(4);
    // Nothing typed is no number, and nothing wrong: required is the page's to say.
    await type('');
    await leave();
    expect(page.attempts()).toBeNull();
    expect(error()).toBeNull();
  });

  it('steps: two decimals for 0.01, the multiples of 5, any number with "any"', async () => {
    await type('12,50', 'price');
    expect(page.price()).toBe(12.5);
    await type('12.505', 'price');
    await leave('price');
    expect(page.price()).toBeNull();
    expect(error('price')).toBe('Write a number in steps of 0.01.');
    await type('15', 'fives');
    expect(page.minutes()).toBe(15);
    await type('17', 'fives');
    await leave('fives');
    expect(error('fives')).toBe('Write a number in steps of 5.');
    await type('-0.000125', 'offset');
    expect(page.offset()).toBe(-0.000125);
    // Off a step of 0.1 by the float's own error is still on it.
    await type('0.3', 'price');
    expect(page.price()).toBe(0.3);
  });

  it('written the page’s way once left - never under the caret - and afresh when the value comes from the page', async () => {
    await type('1 000,5', 'offset');
    expect(input('offset').value).toBe('1 000,5');
    await leave('offset');
    expect(input('offset').value).toBe('1000.5');
    language.set('sk');
    await settle(fixture);
    expect(input('offset').value).toBe('1000,5');
    page.attempts.set(9);
    await settle(fixture);
    expect(input().value).toBe('9');
    page.offset.set(null);
    await settle(fixture);
    expect(input('offset').value).toBe('');
    // Enter says it too.
    await type('3,25', 'fives');
    press(input('fives'), 'Enter');
    await settle(fixture);
    expect(error('fives')).toBe('Číslo treba zadať v krokoch po 5.');
  });

  it('the page’s own error first', async () => {
    page.error.set('The price is not saved yet.');
    await settle(fixture);
    await type('x', 'price');
    await leave('price');
    expect(error('price')).toBe('The price is not saved yet.');
  });
});
