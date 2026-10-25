import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SelectComponent, SelectOption } from '@anotoki/lib/ui/select';
import { draw, kitProviders, settle, words } from '../../src/testing';
import { CheckboxComponent } from './checkbox/checkbox.component';
import { TextFieldComponent } from './text-field/text-field.component';

@Component({
  selector: 'anotoki-test-field-gaps',
  imports: [CheckboxComponent, SelectComponent, TextFieldComponent],
  template: `
    <anotoki-checkbox id="terms" [(checked)]="agreed" required [error]="termsError()" hint="Read them first">I agree to the terms</anotoki-checkbox>
    <anotoki-checkbox id="quiet" [invalid]="true">Marked wrong</anotoki-checkbox>
    <anotoki-text-field id="level" label="Level" type="number" [min]="1" [max]="90" [step]="10" />
    <anotoki-select id="rarity" label="Rarity" [options]="rarities" [(value)]="rarity" [none]="null" placeholder="Any" />
    <anotoki-select id="language" label="Language" [options]="languages" [(value)]="language" placeholder="Choose" />
  `,
})
class FieldGapsPageComponent {
  readonly agreed = signal(false);
  readonly termsError = signal<string | null>(null);
  readonly rarities: SelectOption<number | null>[] = [
    { value: 4, label: '4 stars' },
    { value: 5, label: '5 stars' },
  ];
  readonly rarity = signal<number | null>(5);
  readonly languages: SelectOption[] = [
    { value: 'en', label: 'English' },
    { value: 'sk', label: 'Slovenčina' },
  ];
  readonly language = signal('sk');
}

/** What genshin's form wrappers gave a page that the kit's fields now give it themselves (0.11.0). */
describe('the kit’s fields, what genshin’s wrappers gave', () => {
  let host: HTMLElement;
  let page: FieldGapsPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<FieldGapsPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(FieldGapsPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const box = (id = 'terms') => host.querySelector<HTMLInputElement>(`#${id} input[type="checkbox"]`)!;
  const select = (id: string) => host.querySelector<HTMLSelectElement>(`#${id} select`)!;
  const choose = async (id: string, index: number) => {
    select(id).selectedIndex = index;
    select(id).dispatchEvent(new Event('change'));
    await settle(fixture);
  };

  it('a checkbox’s error: said under it, tied to it with its hint, the checkbox marked wrong; required; focus()', async () => {
    expect(box().required).toBe(true);
    expect(box().hasAttribute('aria-invalid')).toBe(false);
    page.termsError.set('Agree to the terms to go on.');
    await settle(fixture);
    const error = host.querySelector('#terms .anotoki-checkbox__error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(words(error)).toBe('Agree to the terms to go on.');
    expect(box().getAttribute('aria-invalid')).toBe('true');
    expect(
      box()
        .getAttribute('aria-describedby')!
        .split(' ')
        .map((id) => words(document.getElementById(id))),
    ).toEqual(['Read them first', 'Agree to the terms to go on.']);
    expect(box('quiet').getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('#quiet .anotoki-checkbox__error')).toBeNull();
    fixture.debugElement.query((element) => element.nativeElement.id === 'terms').componentInstance.focus();
    expect(document.activeElement).toBe(box());
  });

  it('a text field’s step, beside its min and max', () => {
    const input = host.querySelector<HTMLInputElement>('#level input')!;
    expect([input.getAttribute('min'), input.getAttribute('max'), input.getAttribute('step')]).toEqual(['1', '90', '10']);
  });

  it('a select of numbers: the value a number, its "none" null - and one of texts as it always was', async () => {
    expect(select('rarity').value).toBe('5');
    await choose('rarity', 1);
    expect(page.rarity()).toBe(4);
    await choose('rarity', 0);
    expect(page.rarity()).toBeNull();
    page.rarity.set(5);
    await settle(fixture);
    expect(select('rarity').selectedIndex).toBe(2);
    await choose('language', 1);
    expect(page.language()).toBe('en');
    await choose('language', 0);
    expect(page.language()).toBe('');
  });
});
