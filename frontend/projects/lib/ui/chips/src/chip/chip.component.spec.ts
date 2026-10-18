import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { ChipComponent, ChipTone } from './chip.component';

@Component({
  selector: 'anotoki-test-chips',
  imports: [ChipComponent],
  template: `
    <button anotokiChip id="plain">Step 1</button>
    <button anotokiChip id="step" [tone]="tone()" [disabled]="locked()">Step 2</button>
    <button anotokiChip id="filter" [pressed]="on()" (click)="on.set(!on())">Pyro</button>
    <button anotokiChip id="choice" role="radio" [checked]="on()">Hydro</button>
  `,
})
class ChipsPageComponent {
  readonly tone = signal<ChipTone>('success');
  readonly locked = signal(false);
  readonly on = signal(false);
}

describe('[anotokiChip]: a small round-ended button - a step in its state, a toggle, a choice', () => {
  let host: HTMLElement;
  let page: ChipsPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<ChipsPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(ChipsPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const chip = (id: string) => host.querySelector<HTMLButtonElement>('#' + id)!;

  it('is a button that never submits, its look from classes of its own; a tone says its state beside its words', () => {
    expect(chip('plain').getAttribute('type')).toBe('button');
    expect([...chip('plain').classList]).toEqual(['anotoki-chip']);
    expect(chip('plain').getAttribute('data-tone')).toBe('neutral');
    expect(chip('step').getAttribute('data-tone')).toBe('success');
    expect(chip('plain').hasAttribute('aria-pressed')).toBe(false);
    expect(chip('plain').hasAttribute('aria-checked')).toBe(false);
    expect(words(chip('step'))).toBe('Step 2');
  });

  it('a toggle says aria-pressed, and while pressed shows a check before its words - never the colour alone', async () => {
    expect(chip('filter').getAttribute('aria-pressed')).toBe('false');
    expect(chip('filter').querySelector('anotoki-icon')).toBeNull();

    chip('filter').click();
    await settle(fixture);
    expect(chip('filter').getAttribute('aria-pressed')).toBe('true');
    expect(chip('filter').classList).toContain('anotoki-chip--on');
    expect(chip('filter').querySelectorAll('anotoki-icon.anotoki-chip__check path').length).toBeGreaterThan(0);
    expect(chip('filter').querySelector('.anotoki-chip__check svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(words(chip('filter'))).toBe('Pyro');
  });

  it('a choice of a radio group says aria-checked; disabled is the attribute, and a locked step cannot be pressed', async () => {
    expect(chip('choice').getAttribute('aria-checked')).toBe('false');
    page.on.set(true);
    page.locked.set(true);
    await settle(fixture);
    expect(chip('choice').getAttribute('aria-checked')).toBe('true');
    expect(chip('choice').hasAttribute('aria-pressed')).toBe(false);
    expect(chip('choice').classList).toContain('anotoki-chip--on');
    expect(chip('step').disabled).toBe(true);

    page.locked.set(false);
    await settle(fixture);
    expect(chip('step').disabled).toBe(false);
  });
});
