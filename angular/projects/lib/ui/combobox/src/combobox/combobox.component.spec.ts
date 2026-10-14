import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig } from '@anotoki/lib/ui/config';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { ComboboxOption, foldText } from '../options';
import { ComboboxComponent } from './combobox.component';

const CHARACTERS: ComboboxOption[] = [
  { value: 'furina', label: 'Furina', picture: '/furina.png', keywords: 'Hydro Fontaine' },
  { value: 'neuvillette', label: 'Neuvillette', picture: '/neuvillette.png' },
  { value: 'hu-tao', label: 'Hu Tao', picture: '/hu-tao.png', keywords: 'Pyro' },
  { value: 'ayaka', label: 'Kamisato Ayaka', picture: '/ayaka.png' },
  { value: 'lynette', label: 'Lynette', disabled: true },
  { value: 'lubica', label: 'Ľubica', lang: 'sk' },
];

@Component({
  selector: 'anotoki-test-comboboxes',
  imports: [ComboboxComponent],
  template: `
    <anotoki-combobox id="one" label="Character" [options]="characters" [(value)]="one" placeholder="Search" hint="Type a name" [limit]="limit()" [disabled]="disabled()" />
    <anotoki-combobox id="team" label="Team" [options]="characters" multiple [(values)]="team" />
  `,
})
class ComboboxesPageComponent {
  readonly characters = CHARACTERS;
  readonly one = signal<string | null>(null);
  readonly team = signal<readonly string[]>([]);
  readonly limit = signal(50);
  readonly disabled = signal(false);
}

describe('<anotoki-combobox>: the ARIA 1.2 combobox - typing filters, the arrow keys, Enter and Escape, pictures, one or several', () => {
  let host: HTMLElement;
  let page: ComboboxesPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<ComboboxesPageComponent>>>;

  async function setUp(config?: () => AnotokiUiConfig): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    fixture = await draw(ComboboxesPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  }

  afterEach(() => host?.remove());

  const field = (id = 'one') => host.querySelector<HTMLElement>('#' + id)!;
  const input = (id = 'one') => field(id).querySelector<HTMLInputElement>('input')!;
  const listbox = (id = 'one') => document.getElementById(input(id).getAttribute('aria-controls')!);
  const options = (id = 'one') => Array.from(listbox(id)?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
  const names = (id = 'one') => options(id).map((option) => words(option));
  const active = (id = 'one') => {
    const activeId = input(id).getAttribute('aria-activedescendant');
    return activeId ? words(document.getElementById(activeId)) : null;
  };
  const told = (id = 'one') => words(field(id).querySelector('[aria-live="polite"]'));
  const type = async (text: string, id = 'one') => {
    input(id).focus();
    input(id).value = text;
    input(id).dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const key = async (name: string, init: KeyboardEventInit = {}, id = 'one') => {
    const event = press(input(id), name, init);
    await settle(fixture);
    return event;
  };

  it('folds a text for the filter: no accents, no case', () => {
    expect(foldText('Ľubica Fúrina')).toBe('lubica furina');
  });

  it('a text field with role="combobox": its label, its hint, aria-autocomplete, collapsed, controlling its list box', async () => {
    await setUp();
    expect(field().querySelector(`label[for="${input().id}"]`)).not.toBeNull();
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().getAttribute('aria-controls')).toMatch(/-listbox$/);
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(input().placeholder).toBe('Search');
    expect(words(document.getElementById(input().getAttribute('aria-describedby')!))).toBe('Type a name');
    expect(listbox()).toBeNull();
  });

  it('typing filters - accents and case aside, keywords too, names starting with it first - the first match active', async () => {
    await setUp();
    await type('fu');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(listbox()?.getAttribute('role')).toBe('listbox');
    expect(names()).toEqual(['Furina']);
    expect(active()).toBe('Furina');
    expect(options()[0].getAttribute('aria-selected')).toBe('false');
    await type('LUBICA');
    expect(names()).toEqual(['Ľubica']);
    expect(options()[0].querySelector('[lang]')?.getAttribute('lang')).toBe('sk');
    await type('hydro');
    expect(names()).toEqual(['Furina']);
    await type('n');
    expect(names()).toEqual(['Neuvillette', 'Furina', 'Lynette']);
    expect(active()).toBe('Neuvillette');
  });

  it('an option’s picture beside its name, with an empty alt: the name says it', async () => {
    await setUp();
    await type('hu');
    const picture = options()[0].querySelector('img')!;
    expect(picture.getAttribute('alt')).toBe('');
    expect(picture.getAttribute('src')).toBe('/hu-tao.png');
    expect(picture.getAttribute('loading')).toBe('lazy');
  });

  it('the keys: Down opens with the first active, Down and Up move round the list over what cannot be chosen, Enter chooses', async () => {
    await setUp();
    input().focus();
    await key('ArrowDown');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(names().length).toBe(6);
    expect(active()).toBe('Furina');
    await key('ArrowUp');
    expect(active()).toBe('Ľubica');
    await key('ArrowUp');
    // Lynette cannot be chosen: passed over.
    expect(active()).toBe('Kamisato Ayaka');
    expect(options()[4].getAttribute('aria-disabled')).toBe('true');
    await key('ArrowDown');
    expect(active()).toBe('Ľubica');
    await key('ArrowDown');
    expect(active()).toBe('Furina');
    await key('ArrowDown');
    const enter = await key('Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(page.one()).toBe('neuvillette');
    expect(input().value).toBe('Neuvillette');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(field().querySelector('.anotoki-combobox__chosen-picture')?.getAttribute('alt')).toBe('');
    // Opened again: every option, the chosen one active and marked.
    await key('ArrowDown');
    expect(names().length).toBe(6);
    expect(active()).toBe('Neuvillette');
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('Escape closes the list, nothing chosen; closed, it empties the field and the choice; Alt+Down opens it as it is', async () => {
    await setUp();
    page.one.set('furina');
    await settle(fixture);
    expect(input().value).toBe('Furina');
    await type('ne');
    const escape = await key('Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
    expect(page.one()).toBe('furina');
    await key('Escape');
    expect(input().value).toBe('');
    expect(page.one()).toBeNull();
    await key('ArrowDown', { altKey: true });
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(active()).toBeNull();
  });

  it('leaving the field: the list closed, the chosen name back - no choice where the field was emptied', async () => {
    await setUp();
    page.one.set('furina');
    await settle(fixture);
    await type('xyz');
    input().dispatchEvent(new Event('blur'));
    await settle(fixture);
    expect(input().value).toBe('Furina');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    await type('');
    input().dispatchEvent(new Event('blur'));
    await settle(fixture);
    expect(page.one()).toBeNull();
  });

  it('a press on an option chooses it; "No matches" seen and told', async () => {
    await setUp();
    await type('kami');
    options()[0].click();
    await settle(fixture);
    expect(page.one()).toBe('ayaka');
    await type('zzz');
    expect(names()).toEqual([]);
    expect(words(listbox()!.parentElement!.querySelector('.anotoki-combobox__note'))).toBe('No matches');
    expect(listbox()!.parentElement!.querySelector('.anotoki-combobox__note')?.getAttribute('aria-hidden')).toBe('true');
    expect(told()).toBe('No matches');
  });

  it('a long list: `limit` drawn at once, how many more said - seen and told - until typing narrows it', async () => {
    await setUp();
    page.limit.set(2);
    await settle(fixture);
    input().focus();
    await key('ArrowDown');
    expect(names()).toEqual(['Furina', 'Neuvillette']);
    expect(told()).toBe('4 more: keep typing to narrow the list.');
    await type('hu');
    expect(names()).toEqual(['Hu Tao']);
    expect(told()).toBe('');
  });

  it('several: each press chooses or lets go, the list stays open, the chosen ones the kit’s removable chips', async () => {
    await setUp();
    await type('fu', 'team');
    expect(listbox('team')?.getAttribute('aria-multiselectable')).toBe('true');
    await key('Enter', {}, 'team');
    expect(page.team()).toEqual(['furina']);
    expect(input('team').getAttribute('aria-expanded')).toBe('true');
    expect(input('team').value).toBe('');
    // Every option again, the one just chosen active and selected.
    expect(names('team').length).toBe(6);
    expect(active('team')).toBe('Furina');
    expect(options('team')[0].getAttribute('aria-selected')).toBe('true');
    options('team')[3].click();
    await settle(fixture);
    expect(page.team()).toEqual(['furina', 'ayaka']);
    const chips = field('team').querySelector('anotoki-chip-list')!;
    expect(chips.getAttribute('aria-label')).toBe('Team: chosen');
    expect(Array.from(chips.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))).toEqual(['Remove: Furina', 'Remove: Kamisato Ayaka']);
    await key('ArrowDown', {}, 'team');
    await key('ArrowUp', {}, 'team');
    expect(active('team')).toBe('Kamisato Ayaka');
    await key('Enter', {}, 'team');
    expect(page.team()).toEqual(['furina']);
    chips.querySelector('button')!.click();
    await settle(fixture);
    expect(page.team()).toEqual([]);
    expect(field('team').querySelector('anotoki-chip-list')).toBeNull();
  });

  it('disabled: no typing, no list', async () => {
    await setUp();
    page.disabled.set(true);
    await settle(fixture);
    expect(input().disabled).toBe(true);
    await key('ArrowDown');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('in the page’s language - the site’s words first', async () => {
    await setUp(() => ({ language: () => 'sk', lookup: (key) => ((key as string) === 'combobox.noMatches' ? 'Žiadna postava' : null) }));
    await type('zzz');
    expect(told()).toBe('Žiadna postava');
    page.limit.set(2);
    await type('');
    await key('ArrowDown');
    expect(told()).toBe('Ďalších možností: 4 – zoznam zúži ďalšie písanie.');
    await type('fu', 'team');
    await key('Enter', {}, 'team');
    expect(field('team').querySelector('anotoki-chip-list')?.getAttribute('aria-label')).toBe('Team: vybrané');
  });
});
