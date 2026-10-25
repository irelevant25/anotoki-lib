import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { MultiselectComponent, MultiselectOption } from './multiselect.component';

@Component({
  selector: 'anotoki-test-multiselects',
  imports: [MultiselectComponent],
  template: `
    <anotoki-multiselect id="elements" label="Elements" [options]="elements" [(values)]="chosen" placeholder="Any" [error]="error()" hint="Any of them" />
    <anotoki-multiselect id="rarity" label="Rarity" [options]="rarities" [(values)]="rarity" [maxShown]="1" inline />
  `,
})
class MultiselectsPageComponent {
  readonly elements: MultiselectOption[] = [
    { value: 'hydro', label: 'Hydro' },
    { value: 'pyro', label: 'Pyro' },
    { value: 'cryo', label: 'Cryo', disabled: true },
    { value: 'anemo', label: 'Anemo' },
    { value: 'geo', label: 'Geo' },
    { value: 'dendro', label: 'Dendro' },
  ];
  readonly rarities: MultiselectOption<number>[] = [
    { value: 4, label: '4 stars' },
    { value: 5, label: '5 stars' },
  ];
  readonly chosen = signal<readonly string[]>([]);
  readonly rarity = signal<readonly number[]>([5]);
  readonly error = signal<string | null>(null);
}

describe('<anotoki-multiselect>: several chosen out of a list, a compact button over checkboxes', () => {
  const language = signal('en');
  let host: HTMLElement;
  let page: MultiselectsPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<MultiselectsPageComponent>>>;

  beforeEach(async () => {
    language.set('en');
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language })) });
    fixture = await draw(MultiselectsPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const trigger = (id = 'elements') => host.querySelector<HTMLButtonElement>(`#${id} .anotoki-multiselect__trigger`)!;
  const said = (id = 'elements') => words(host.querySelector(`#${id} .anotoki-multiselect__value`));
  const count = (id = 'elements') => words(host.querySelector(`#${id} .anotoki-multiselect__count`));
  const boxes = (id = 'elements') => Array.from(host.querySelectorAll<HTMLInputElement>(`#${id} .anotoki-popover__panel input[type="checkbox"]`));
  const open = async (id = 'elements') => {
    trigger(id).click();
    await settle(fixture);
  };
  const tick = async (index: number, id = 'elements') => {
    const box = boxes(id)[index];
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    await settle(fixture);
  };

  it('the button is named by the label and what it says, its hint tied to it, its state expanded or not', async () => {
    expect(trigger().getAttribute('type')).toBe('button');
    const names = trigger()
      .getAttribute('aria-labelledby')!
      .split(' ')
      .map((id) => words(document.getElementById(id)));
    expect(names).toEqual(['Elements', 'Any']);
    expect(words(document.getElementById(trigger().getAttribute('aria-describedby')!))).toBe('Any of them');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(count()).toBeNull();
    await open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('#elements .anotoki-popover__panel')?.getAttribute('aria-label')).toBe('Elements');
  });

  it('a checkbox a choice: the values in the options’ order, the button saying the first and how many more', async () => {
    await open();
    expect(boxes().length).toBe(6);
    expect(boxes()[2].disabled).toBe(true);
    await tick(3);
    await tick(0);
    expect(page.chosen()).toEqual(['hydro', 'anemo']);
    expect(said()).toBe('Hydro, Anemo');
    expect(count()).toBe('2');
    await tick(1);
    await tick(4);
    await tick(5);
    expect(page.chosen()).toEqual(['hydro', 'pyro', 'anemo', 'geo', 'dendro']);
    expect(said()).toBe('Hydro, Pyro, Anemo and 2 more');
    await tick(1);
    expect(page.chosen()).toEqual(['hydro', 'anemo', 'geo', 'dendro']);
  });

  it('values of the options’ own type - a number - and the page’s choice shown', async () => {
    expect(said('rarity')).toBe('5 stars');
    await open('rarity');
    expect(boxes('rarity').map((box) => box.checked)).toEqual([false, true]);
    await tick(0, 'rarity');
    expect(page.rarity()).toEqual([4, 5]);
    expect(said('rarity')).toBe('4 stars and 1 more');
    expect(host.querySelector('#rarity')?.classList).toContain('anotoki-multiselect--inline');
  });

  it('Clear unticks them all and puts the focus on the first checkbox that can be ticked', async () => {
    page.chosen.set(['pyro', 'geo']);
    await open();
    const clear = host.querySelector<HTMLButtonElement>('#elements .anotoki-multiselect__clear')!;
    expect(words(clear)).toBe('Clear');
    clear.click();
    await settle(fixture);
    expect(page.chosen()).toEqual([]);
    expect(said()).toBe('Any');
    expect(host.querySelector('#elements .anotoki-multiselect__clear')).toBeNull();
    expect(document.activeElement).toBe(boxes()[0]);
  });

  it('the library’s words in the page’s language; the page’s error tied to the button', async () => {
    language.set('sk');
    page.rarity.set([]);
    page.chosen.set(['hydro', 'pyro', 'anemo', 'geo']);
    page.error.set('Choose an element.');
    await settle(fixture);
    expect(said('rarity')).toBe('Nič nie je vybrané');
    expect(said()).toBe('Hydro, Pyro, Anemo a ďalšie (1)');
    expect(trigger().getAttribute('aria-invalid')).toBe('true');
    expect(words(document.getElementById(trigger().getAttribute('aria-describedby')!))).toBe('Choose an element.');
  });
});
