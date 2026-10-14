import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig } from '@anotoki/lib/ui/config';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { SliderComponent, SliderTick } from './slider.component';

@Component({
  selector: 'anotoki-test-sliders',
  imports: [SliderComponent],
  template: `
    <anotoki-slider id="level" label="Difficulty" [(value)]="level" [min]="0" [max]="2" [ticks]="levels" [showValue]="false" hint="Harder boards pay more" />
    <anotoki-slider id="size" label="Board size" [(value)]="size" [min]="5" [max]="30" [ticks]="sizes" [valueText]="size() + ' × ' + size()" [error]="error()" />
    <anotoki-slider id="volume" label="Volume" [(value)]="volume" [max]="2000" [step]="10" [disabled]="disabled()" />
  `,
})
class SlidersPageComponent {
  readonly level = signal(1);
  readonly size = signal(12);
  readonly volume = signal(1230);
  readonly error = signal<string | null>(null);
  readonly disabled = signal(false);
  readonly levels: SliderTick[] = [
    { value: 0, label: 'Easy' },
    { value: 1, label: 'Medium' },
    { value: 2, label: 'Hard' },
  ];
  readonly sizes: SliderTick[] = [5, 10, 15, 20, 25, 30].map((value) => ({ value, label: String(value) }));
}

describe('<anotoki-slider>: the native range input in the kit’s look, with marks and words', () => {
  let host: HTMLElement;
  let page: SlidersPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<SlidersPageComponent>>>;

  async function setUp(config?: () => AnotokiUiConfig): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    fixture = await draw(SlidersPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  }

  afterEach(() => host.remove());

  const slider = (id: string) => host.querySelector<HTMLElement>('#' + id)!;
  const range = (id: string) => slider(id).querySelector<HTMLInputElement>('input')!;
  const slide = async (id: string, value: number) => {
    range(id).value = String(value);
    range(id).dispatchEvent(new Event('input'));
    await settle(fixture);
  };

  it('a native range input with a real label, its ends and step, the value both ways', async () => {
    await setUp();
    const level = range('level');
    expect(level.type).toBe('range');
    expect(slider('level').querySelector(`label[for="${level.id}"]`)).not.toBeNull();
    expect([level.min, level.max, level.step, level.value]).toEqual(['0', '2', '1', '1']);
    expect(words(document.getElementById(level.getAttribute('aria-describedby')!))).toBe('Harder boards pay more');
    await slide('level', 2);
    expect(page.level()).toBe(2);
    page.level.set(0);
    await settle(fixture);
    expect(level.value).toBe('0');
    expect(range('volume').step).toBe('10');
  });

  it('words for the value where it needs them: a tick’s words, or the page’s - shown and heard (aria-valuetext); a bare number neither', async () => {
    await setUp();
    expect(range('level').getAttribute('aria-valuetext')).toBe('Medium');
    await slide('level', 2);
    expect(range('level').getAttribute('aria-valuetext')).toBe('Hard');
    expect(slider('level').querySelector('.anotoki-slider__value')).toBeNull();

    expect(range('size').getAttribute('aria-valuetext')).toBe('12 × 12');
    const shown = slider('size').querySelector('.anotoki-slider__value')!;
    expect(words(shown)).toBe('12 × 12');
    expect(shown.getAttribute('aria-hidden')).toBe('true');
    expect(shown.closest('label')).toBeNull();
    await slide('size', 20);
    expect(range('size').getAttribute('aria-valuetext')).toBe('20 × 20');

    expect(range('volume').getAttribute('aria-valuetext')).toBeNull();
    expect(words(slider('volume').querySelector('.anotoki-slider__value'))).toBe('1,230');
  });

  it('the number written the page’s way', async () => {
    await setUp(() => ({ language: () => 'sk' }));
    expect(words(slider('volume').querySelector('.anotoki-slider__value'))).toBe('1 230');
  });

  it('the marks: for the eye alone, each where the thumb stands at its value, the one at the value marked; the fill up to the thumb', async () => {
    await setUp();
    const ticks = slider('level').querySelector('.anotoki-slider__ticks')!;
    expect(ticks.getAttribute('aria-hidden')).toBe('true');
    const marks = Array.from(ticks.querySelectorAll<HTMLElement>('.anotoki-slider__tick'));
    expect(marks.map((mark) => words(mark))).toEqual(['Easy', 'Medium', 'Hard']);
    expect(marks.map((mark) => mark.classList.contains('anotoki-slider__tick--current'))).toEqual([false, true, false]);
    expect(marks[1].style.left).toContain('0.5 * (100% - var(--_slider-thumb))');
    expect(marks[0].querySelector('.anotoki-slider__tick-label')?.classList).toContain('anotoki-slider__tick-label--start');
    expect(marks[2].querySelector('.anotoki-slider__tick-label')?.classList).toContain('anotoki-slider__tick-label--end');
    expect(slider('level').style.getPropertyValue('--_slider-fill')).toBe('0.5');
    expect(slider('size').style.getPropertyValue('--_slider-fill')).toBe(String(7 / 25));
    expect(slider('level').querySelector('.anotoki-slider__track')?.classList).toContain('anotoki-slider__track--labelled');
    expect(slider('volume').querySelector('.anotoki-slider__ticks')).toBeNull();
  });

  it('a value from outside its ends is kept between them; an error said at once, aria-invalid; disabled', async () => {
    await setUp();
    page.size.set(99);
    await settle(fixture);
    expect(range('size').value).toBe('30');
    expect(slider('size').style.getPropertyValue('--_slider-fill')).toBe('1');
    page.error.set('Choose a smaller board.');
    await settle(fixture);
    const error = slider('size').querySelector('.anotoki-field__error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(range('size').getAttribute('aria-invalid')).toBe('true');
    expect(range('size').getAttribute('aria-describedby')).toBe(error.id);
    page.disabled.set(true);
    await settle(fixture);
    expect(range('volume').disabled).toBe(true);
    expect(slider('volume').classList).toContain('anotoki-slider--disabled');
  });
});
