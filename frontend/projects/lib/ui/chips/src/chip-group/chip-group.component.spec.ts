import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { ChipGroupComponent, ChipOption } from './chip-group.component';

const STAGES: ChipOption[] = [
  { value: 'all', label: 'Everything' },
  { value: 'apprentice', label: 'Apprentice', lang: 'en', note: 12 },
  { value: 'guru', label: 'Guru', lang: 'en', note: 0, disabled: true },
  { value: 'master', label: 'Master', lang: 'en', note: 4 },
  { value: 'sk', label: 'SK', name: 'Slovenčina (SK)' },
];

@Component({
  selector: 'anotoki-test-chip-groups',
  imports: [ChipGroupComponent],
  template: `
    <anotoki-chip-group id="one" label="Stage" [options]="options" [(value)]="stage" [hint]="hint()" [error]="error()" [required]="true" />
    <anotoki-chip-group id="several" label="Lessons" [options]="lessons" [multiple]="true" [(values)]="chosen" [optional]="true" [disabled]="off()" />
  `,
})
class ChipGroupsPageComponent {
  readonly options = STAGES;
  readonly lessons: ChipOption[] = [1, 2, 3, 4].map((n) => ({ value: `L${n}`, label: `L${n}`, disabled: n === 3 }));
  readonly stage = signal<string | null>(null);
  readonly chosen = signal<readonly string[]>([]);
  readonly hint = signal<string | null>('What to practise');
  readonly error = signal<string | null>(null);
  readonly off = signal(false);
}

describe('<anotoki-chip-group>: choice chips, one (a radio group) or several (toggles)', () => {
  let host: HTMLElement;
  let page: ChipGroupsPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<ChipGroupsPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(ChipGroupsPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const group = (id: string) => host.querySelector<HTMLElement>(`#${id} .anotoki-chip-group__chips`)!;
  const chips = (id: string) => Array.from(group(id).querySelectorAll<HTMLButtonElement>('button'));
  const label = (id: string) => host.querySelector<HTMLElement>(`#${group(id).getAttribute('aria-labelledby')}`);

  it('one at a time: a radio group named by the label over it, each chip a radio; a short code named in full', () => {
    expect(group('one').getAttribute('role')).toBe('radiogroup');
    expect(words(label('one'))).toBe('Stage');
    expect(group('one').getAttribute('aria-required')).toBe('true');
    expect(chips('one').map((chip) => chip.getAttribute('role'))).toEqual(['radio', 'radio', 'radio', 'radio', 'radio']);
    expect(chips('one').map((chip) => chip.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false', 'false']);
    expect(chips('one').every((chip) => !chip.hasAttribute('aria-pressed'))).toBe(true);
    expect(chips('one')[4].getAttribute('aria-label')).toBe('Slovenčina (SK)');
    expect(chips('one')[0].getAttribute('aria-label')).toBeNull();
  });

  it('an option in another language says so on its words; a note after them; one that cannot be chosen is disabled', () => {
    const apprentice = chips('one')[1];
    expect(apprentice.querySelector('.anotoki-chip-group__label')?.getAttribute('lang')).toBe('en');
    expect(chips('one')[0].querySelector('.anotoki-chip-group__label')?.hasAttribute('lang')).toBe(false);
    expect(words(apprentice.querySelector('.anotoki-chip-group__note'))).toBe('12');
    expect(words(chips('one')[2].querySelector('.anotoki-chip-group__note'))).toBe('0');
    expect(words(apprentice)).toBe('Apprentice 12');
    expect(chips('one')[2].disabled).toBe(true);
  });

  it('one Tab stop: the chosen chip, or the first that can be chosen while none is', async () => {
    expect(chips('one').map((chip) => chip.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    page.stage.set('master');
    await settle(fixture);
    expect(chips('one').map((chip) => chip.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    expect(chips('one')[3].getAttribute('aria-checked')).toBe('true');
    expect(chips('one')[3].classList).toContain('anotoki-chip--on');
  });

  it('a click chooses; the arrows move the choice round over a chip that cannot be chosen, the focus following', async () => {
    chips('one')[1].click();
    await settle(fixture);
    expect(page.stage()).toBe('apprentice');

    chips('one')[1].focus();
    press(chips('one')[1], 'ArrowRight');
    await settle(fixture);
    expect(page.stage()).toBe('master');
    expect(document.activeElement).toBe(chips('one')[3]);

    press(document.activeElement!, 'ArrowLeft');
    await settle(fixture);
    expect(page.stage()).toBe('apprentice');

    press(document.activeElement!, 'End');
    await settle(fixture);
    expect(page.stage()).toBe('sk');
    const wrapped = press(document.activeElement!, 'ArrowDown');
    await settle(fixture);
    expect(wrapped.defaultPrevented).toBe(true);
    expect(page.stage()).toBe('all');
    expect(document.activeElement).toBe(chips('one')[0]);

    press(document.activeElement!, 'ArrowUp');
    await settle(fixture);
    press(document.activeElement!, 'Home');
    await settle(fixture);
    expect(page.stage()).toBe('all');
    const other = press(document.activeElement!, 'a');
    expect(other.defaultPrevented).toBe(false);
  });

  it('several: a named group of toggles, each a Tab stop, the values in the options’ order whatever the order pressed', async () => {
    expect(group('several').getAttribute('role')).toBe('group');
    expect(words(label('several'))).toBe('Lessons optional');
    expect(chips('several').map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'false']);
    expect(chips('several').map((chip) => chip.tabIndex)).toEqual([0, 0, 0, 0]);

    chips('several')[3].click();
    chips('several')[0].click();
    chips('several')[2].click();
    await settle(fixture);
    expect(page.chosen()).toEqual(['L1', 'L4']);
    expect(chips('several').map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'true']);

    chips('several')[3].click();
    await settle(fixture);
    expect(page.chosen()).toEqual(['L1']);

    const arrow = press(chips('several')[0], 'ArrowRight');
    expect(arrow.defaultPrevented).toBe(false);
  });

  it('the hint and the error tied to the group; the error said as it comes, aria-invalid on the radio group', async () => {
    const hint = host.querySelector(`#one .anotoki-field__hint`)!;
    expect(group('one').getAttribute('aria-describedby')).toBe(hint.id);
    expect(group('one').hasAttribute('aria-invalid')).toBe(false);

    page.error.set('Choose a stage.');
    await settle(fixture);
    const error = host.querySelector(`#one .anotoki-field__error`)!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(words(error)).toBe('Choose a stage.');
    expect(group('one').getAttribute('aria-describedby')).toBe(error.id);
    expect(group('one').getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector(`#one .anotoki-field__hint`)).toBeNull();
  });

  it('disabled as a whole: no chip can be pressed', async () => {
    page.off.set(true);
    await settle(fixture);
    expect(chips('several').every((chip) => chip.disabled)).toBe(true);
    chips('several')[0].click();
    await settle(fixture);
    expect(page.chosen()).toEqual([]);
  });
});
