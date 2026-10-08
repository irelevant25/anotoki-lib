import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle } from '../testing';
import { SegmentedComponent, SegmentedOption } from './segmented.component';

const OPTIONS: SegmentedOption[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'auto', label: 'Automatic', icon: 'monitor', hint: 'As your device is set' },
];

@Component({
  selector: 'anotoki-test-segmented',
  imports: [SegmentedComponent],
  template: '<anotoki-segmented label="Theme" [options]="options" [value]="value()" [iconsOnly]="iconsOnly()" (valueChange)="asked($event)" />',
})
class SegmentedPageComponent {
  readonly options = OPTIONS;
  readonly value = signal<string | null>('light');
  readonly iconsOnly = signal(true);
  /** Whether a choice is taken (a language whose words have not come is not). */
  accept = true;
  readonly choices: string[] = [];

  asked(value: string): void {
    this.choices.push(value);
    if (this.accept) {
      this.value.set(value);
    }
  }
}

describe('<anotoki-segmented>: one choice out of a few, a radio group', () => {
  let host: HTMLElement;
  let page: SegmentedPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<SegmentedPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(SegmentedPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const segments = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role=radio]'));
  const checked = () => segments().map((segment) => segment.getAttribute('aria-checked'));
  const tabStops = () => segments().map((segment) => segment.tabIndex);

  it('is a named radio group; icons alone are each named, with a tooltip', () => {
    expect(host.querySelector('[role=radiogroup]')?.getAttribute('aria-label')).toBe('Theme');
    expect(segments().map((segment) => segment.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'Automatic']);
    expect(segments().map((segment) => segment.getAttribute('title'))).toEqual(['Light', 'Dark', 'As your device is set']);
    expect(checked()).toEqual(['true', 'false', 'false']);
  });

  it('one Tab stop: the chosen segment, or the first while none is', async () => {
    expect(tabStops()).toEqual([0, -1, -1]);
    page.value.set('something else');
    await settle(fixture);
    expect(tabStops()).toEqual([0, -1, -1]);
    page.value.set('auto');
    await settle(fixture);
    expect(tabStops()).toEqual([-1, -1, 0]);
  });

  it('arrows move the choice round, and the focus follows it once it is made', async () => {
    segments()[0].focus();
    press(segments()[0], 'ArrowRight');
    await settle(fixture);
    expect(page.choices).toEqual(['dark']);
    expect(checked()).toEqual(['false', 'true', 'false']);
    expect(document.activeElement).toBe(segments()[1]);

    press(segments()[1], 'ArrowLeft');
    await settle(fixture);
    press(document.activeElement!, 'ArrowLeft');
    await settle(fixture);
    expect(page.choices).toEqual(['dark', 'light', 'auto']);
    expect(document.activeElement).toBe(segments()[2]);
  });

  it('a choice the page does not take: the control keeps showing - and the focus stays on - what is true', async () => {
    page.accept = false;
    segments()[0].focus();
    const event = press(segments()[0], 'ArrowDown');
    await settle(fixture);
    expect(event.defaultPrevented).toBe(true);
    expect(page.choices).toEqual(['dark']);
    expect(checked()).toEqual(['true', 'false', 'false']);
    expect(document.activeElement).toBe(segments()[0]);
  });

  it('a click asks for that choice; with words, the labels show', async () => {
    segments()[2].click();
    await settle(fixture);
    expect(page.value()).toBe('auto');
    page.iconsOnly.set(false);
    await settle(fixture);
    expect(segments().map((segment) => segment.textContent?.trim())).toEqual(['Light', 'Dark', 'Automatic']);
    expect(segments()[0].getAttribute('aria-label')).toBeNull();
  });
});
