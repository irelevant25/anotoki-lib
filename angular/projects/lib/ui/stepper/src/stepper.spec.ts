import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig } from '@anotoki/lib/ui/config';
import { draw, kitProviders, settle, words } from '../../src/testing';
import { StepItem } from './step-item';
import { StepDotsComponent } from './step-dots/step-dots.component';
import { StepperComponent } from './stepper/stepper.component';

const WIZARD: StepItem[] = [{ label: 'Choose the game' }, { label: 'Choose the way in' }, { label: 'Import' }, { label: 'Check' }];
const LESSON: StepItem[] = [
  { label: 'Listen', short: '1' },
  { label: 'Play', short: '2' },
  { label: 'Read', short: '3', done: true },
  { label: 'Sing', short: '4' },
];

@Component({
  selector: 'anotoki-test-steps',
  imports: [StepperComponent, StepDotsComponent],
  template: `
    <anotoki-stepper label="The import's steps" [steps]="wizard" [current]="step()" [navigable]="navigable()" [disabled]="busy()" (choose)="chosen.push($event); step.set($event)" />
    <anotoki-step-dots label="The unit's steps" [steps]="lesson" [current]="1" [showLabels]="labels()" />
  `,
})
class StepsComponent {
  readonly wizard = WIZARD;
  readonly lesson = LESSON;
  readonly step = signal(2);
  readonly navigable = signal(false);
  readonly busy = signal(false);
  readonly labels = signal(false);
  readonly chosen: number[] = [];
}

describe('<anotoki-stepper>, <anotoki-step-dots>: steps done, current and to come', () => {
  let host: HTMLElement;
  let page: StepsComponent;
  let fixture: Awaited<ReturnType<typeof draw<StepsComponent>>>;

  async function setUp(config?: () => AnotokiUiConfig): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    fixture = await draw(StepsComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  }

  afterEach(() => host.remove());

  const steps = () => Array.from(host.querySelectorAll<HTMLElement>('anotoki-stepper li'));
  /** What a screen reader hears of an element: its words, but for what is aria-hidden. */
  const heard = (element: Element) => {
    const copy = element.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
    return words(copy);
  };
  const dots = () => Array.from(host.querySelectorAll<HTMLElement>('anotoki-step-dots li'));

  it('a named list: the current step aria-current="step", heard "Step 3 of 4: Import"; one done heard "…, done"', async () => {
    await setUp();
    const list = host.querySelector('anotoki-stepper ol')!;
    expect(list.getAttribute('aria-label')).toBe("The import's steps");
    expect(steps().map((step) => step.getAttribute('aria-current'))).toEqual([null, null, 'step', null]);
    expect(steps().map((step) => heard(step))).toEqual(['Choose the game, done', 'Choose the way in, done', 'Step 3 of 4: Import', 'Check']);
    // The marks are for the eye: a check, the numbers - never heard.
    expect(steps().every((step) => step.querySelector('.anotoki-stepper__mark')?.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(steps()[0].querySelector('.anotoki-stepper__mark anotoki-icon')).not.toBeNull();
    expect(steps()[0].classList).toContain('anotoki-stepper__step--done');
    expect(steps()[2].classList).toContain('anotoki-stepper__step--current');
    expect(steps()[3].className).toBe('anotoki-stepper__step');
    expect(host.querySelector('anotoki-stepper button')).toBeNull();
  });

  it('navigable: a step done is a button back to it - shut while disabled', async () => {
    await setUp();
    page.navigable.set(true);
    await settle(fixture);
    const buttons = () => Array.from(host.querySelectorAll<HTMLButtonElement>('anotoki-stepper button'));
    expect(buttons().map((button) => heard(button))).toEqual(['Choose the game, done', 'Choose the way in, done']);
    expect(buttons()[0].getAttribute('type')).toBe('button');

    page.busy.set(true);
    await settle(fixture);
    expect(buttons().every((button) => button.disabled)).toBe(true);
    page.busy.set(false);
    await settle(fixture);
    buttons()[1].click();
    await settle(fixture);
    expect(page.chosen).toEqual([1]);
    expect(steps()[1].getAttribute('aria-current')).toBe('step');
    expect(buttons().length).toBe(1);
  });

  it('in the page’s language - the site’s own words first', async () => {
    await setUp(() => ({ language: () => 'sk' }));
    expect(heard(steps()[2])).toBe('Krok 3 z 4: Import');
    expect(heard(steps()[0])).toBe('Choose the game, hotovo');
    host.remove();
    TestBed.resetTestingModule();
    await setUp(() => ({ language: () => 'sk', lookup: (key) => ((key as string) === 'stepper.done' ? 'dokončené' : null) }));
    expect(heard(steps()[0])).toBe('Choose the game, dokončené');
  });

  it('the dots: the same list for the ear - a step after the current one may be done - the dots and pills for the eye alone', async () => {
    await setUp();
    expect(host.querySelector('anotoki-step-dots ol')?.getAttribute('aria-label')).toBe("The unit's steps");
    expect(dots().map((dot) => dot.getAttribute('aria-current'))).toEqual([null, 'step', null, null]);
    expect(dots().map((dot) => heard(dot))).toEqual(['Listen, done', 'Step 2 of 4: Play', 'Read, done', 'Sing']);
    expect(dots().map((dot) => dot.className.replace('anotoki-step-dots__dot', '').trim())).toEqual([
      'anotoki-step-dots__dot--done',
      'anotoki-step-dots__dot--current',
      'anotoki-step-dots__dot--done',
      '',
    ]);
    expect(host.querySelector('.anotoki-step-dots__short')).toBeNull();

    page.labels.set(true);
    await settle(fixture);
    const shorts = Array.from(host.querySelectorAll('.anotoki-step-dots__short'));
    expect(shorts.map((short) => words(short))).toEqual(['1', '2', '3', '4']);
    expect(shorts.every((short) => short.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(host.querySelector('anotoki-step-dots')?.classList).toContain('anotoki-step-dots--labels');
  });
});
