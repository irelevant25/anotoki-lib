import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig } from '@anotoki/lib/ui/config';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { ColorFieldComponent, ColorSwatch, readColor } from './color-field.component';

@Component({
  selector: 'anotoki-test-color-fields',
  imports: [ColorFieldComponent],
  template: `
    <anotoki-color-field id="ink" label="Text colour" [(value)]="ink" [swatches]="elements" [error]="error()" [disabled]="disabled()" hint="A colour of the element" />
    <anotoki-color-field id="plain" label="Background" [(value)]="background" />
  `,
})
class ColorFieldsPageComponent {
  readonly ink = signal('#1F5FBF');
  readonly background = signal('');
  readonly error = signal<string | null>(null);
  readonly disabled = signal(false);
  readonly elements: ColorSwatch[] = [
    { value: '#4CC2F1', name: 'Hydro' },
    { value: '#ef7a35', name: 'Pyro' },
    { value: '#1f5fbf', name: 'Our blue' },
  ];
}

describe('<anotoki-color-field>: the device’s colour picker, its code kept in step, suggested colours with their names', () => {
  let host: HTMLElement;
  let page: ColorFieldsPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<ColorFieldsPageComponent>>>;

  async function setUp(config?: () => AnotokiUiConfig): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    fixture = await draw(ColorFieldsPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  }

  afterEach(() => host?.remove());

  const field = (id = 'ink') => host.querySelector<HTMLElement>('#' + id)!;
  const code = (id = 'ink') => field(id).querySelector<HTMLInputElement>('input[type="text"]')!;
  const well = (id = 'ink') => field(id).querySelector<HTMLInputElement>('input[type="color"]')!;
  const radios = () => Array.from(field().querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const named = (element: Element) =>
    element
      .getAttribute('aria-labelledby')!
      .split(' ')
      .map((id) => words(document.getElementById(id)))
      .join(', ');
  const type = async (text: string, id = 'ink') => {
    code(id).value = text;
    code(id).dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const leave = async (id = 'ink') => {
    code(id).dispatchEvent(new Event('blur'));
    await settle(fixture);
  };

  it('reads a colour’s code as #rrggbb, lower-case: with or without #, any case, three digits too', () => {
    expect(readColor('#1F5FBF')).toBe('#1f5fbf');
    expect(readColor(' 1f5fbf ')).toBe('#1f5fbf');
    expect(readColor('#1f5')).toBe('#11ff55');
    for (const text of ['', 'blue', '#1f5fb', '#1f5fbfa', '#ggg', 'rgb(0, 0, 0)', null]) {
      expect(readColor(text), String(text)).toBeNull();
    }
  });

  it('the code is the field the label names; the colour box is named by the label and its own words; both show the value', async () => {
    await setUp();
    expect(field().querySelector(`label[for="${code().id}"]`)).not.toBeNull();
    expect(code().value).toBe('#1f5fbf');
    expect(code().getAttribute('maxlength')).toBe('7');
    expect(words(document.getElementById(code().getAttribute('aria-describedby')!))).toBe('A colour of the element');
    expect(well().value).toBe('#1f5fbf');
    expect(named(well())).toBe('Text colour, Pick from the palette');
    expect(code('plain').value).toBe('');
  });

  it('typing: the value follows a whole colour at once, written the field’s way when left', async () => {
    await setUp();
    await type('#EF7A35');
    expect(page.ink()).toBe('#ef7a35');
    expect(code().value).toBe('#EF7A35');
    expect(well().value).toBe('#ef7a35');
    await leave();
    expect(code().value).toBe('#ef7a35');
    await type('abc');
    expect(page.ink()).toBe('#aabbcc');
  });

  it('a code that is no colour: the value empty, the box keeping its colour; said when left - role="alert", aria-invalid - and gone once right', async () => {
    await setUp();
    await type('#1f5fb');
    expect(page.ink()).toBe('');
    // No colour: the box drawn crossed out (never the black of a native colour input), its picker on the last colour.
    expect(well().classList).toContain('anotoki-color-field__well--none');
    expect(well().value).toBe('#1f5fbf');
    expect(well('plain').classList).toContain('anotoki-color-field__well--none');
    expect(field().querySelector('.anotoki-field__error')).toBeNull();
    await leave();
    const error = field().querySelector('.anotoki-field__error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(words(error)).toBe('Write the colour as # and six digits or letters a–f, like #1f5fbf.');
    expect(code().getAttribute('aria-invalid')).toBe('true');
    expect(code().getAttribute('aria-describedby')).toBe(error.id);
    expect(code().value).toBe('#1f5fb');
    await type('#1f5fbe');
    expect(page.ink()).toBe('#1f5fbe');
    expect(field().querySelector('.anotoki-field__error')).toBeNull();
    page.error.set('This colour is taken.');
    await settle(fixture);
    expect(words(field().querySelector('.anotoki-field__error'))).toBe('This colour is taken.');
  });

  it('the colour box: a colour picked is the value, and its code', async () => {
    await setUp();
    well().value = '#00ff00';
    well().dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(page.ink()).toBe('#00ff00');
    expect(code().value).toBe('#00ff00');
  });

  it('suggested colours: a radio group named by the label and its own words, each radio named by its colour’s name', async () => {
    await setUp();
    const group = field().querySelector('[role="radiogroup"]')!;
    expect(named(group)).toBe('Text colour, Suggested colours');
    expect(radios().map((radio) => words(radio.closest('label')))).toEqual(['Hydro', 'Pyro', 'Our blue']);
    expect(new Set(radios().map((radio) => radio.name)).size).toBe(1);
    expect(radios().map((radio) => radio.checked)).toEqual([false, false, true]);
    expect(field().querySelector('.anotoki-color-field__dot')?.getAttribute('aria-hidden')).toBe('true');
    // The chosen one is told by more than its colour: a check, the primary edge.
    const chosen = radios()[2].closest('label')!;
    expect(chosen.classList).toContain('anotoki-color-field__swatch--chosen');
    expect(chosen.querySelector('anotoki-icon')).not.toBeNull();

    radios()[0].click();
    await settle(fixture);
    expect(page.ink()).toBe('#4cc2f1');
    expect(code().value).toBe('#4cc2f1');
    expect(radios().map((radio) => radio.checked)).toEqual([true, false, false]);

    page.disabled.set(true);
    await settle(fixture);
    expect(radios().every((radio) => radio.disabled)).toBe(true);
    expect(code().disabled).toBe(true);
    expect(well().disabled).toBe(true);
  });

  it('in the page’s language - the site’s words first', async () => {
    await setUp(() => ({ language: () => 'sk', lookup: (key) => ((key as string) === 'colorField.swatches' ? 'Farby prvkov' : null) }));
    expect(named(well())).toBe('Text colour, Vybrať z palety');
    expect(named(field().querySelector('[role="radiogroup"]')!)).toBe('Text colour, Farby prvkov');
    await type('modrá');
    await leave();
    expect(words(field().querySelector('.anotoki-field__error'))).toBe('Farbu treba zadať ako # a šesť číslic alebo písmen a – f, napríklad #1f5fbf.');
  });
});
