import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, words } from '../../../src/testing';
import { LabelledGroupComponent } from './labelled-group.component';

@Component({
  selector: 'anotoki-test-labelled-groups',
  imports: [LabelledGroupComponent],
  template: `
    <anotoki-labelled-group id="lessons" label="Lessons" hint="Pick as many as you like">
      <button type="button" aria-pressed="true">L1</button>
      <button type="button" aria-pressed="false">L2</button>
    </anotoki-labelled-group>
    <anotoki-labelled-group id="tempo" label="Tempo" for="tempo-input" #tempo="anotokiLabelledGroup" hint="Beats a minute">
      <input id="tempo-input" type="range" min="40" max="200" [attr.aria-describedby]="tempo.hintId" />
    </anotoki-labelled-group>
    <anotoki-labelled-group id="range" label="Range" selfNamed inline>
      <div role="radiogroup" aria-label="Range"><button type="button" role="radio" aria-checked="true">7 days</button></div>
    </anotoki-labelled-group>
  `,
})
class LabelledGroupsComponent {}

describe('<anotoki-labelled-group>: a label tied to a control that is no field of the kit’s', () => {
  let host: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    host = (await draw(LabelledGroupsComponent)).nativeElement;
  });

  afterEach(() => host.remove());

  const group = (id: string) => host.querySelector<HTMLElement>('#' + id)!;

  it('names a group of controls: role="group", named by the label shown over it, described by its hint', () => {
    const lessons = group('lessons');
    expect(lessons.getAttribute('role')).toBe('group');
    expect(words(document.getElementById(lessons.getAttribute('aria-labelledby')!))).toBe('Lessons');
    expect(words(document.getElementById(lessons.getAttribute('aria-describedby')!))).toBe('Pick as many as you like');
    expect(lessons.querySelector('.anotoki-labelled-group__label')?.tagName).toBe('SPAN');
    expect(lessons.querySelectorAll('.anotoki-labelled-group__control button').length).toBe(2);
    expect(lessons.classList).not.toContain('anotoki-labelled-group--inline');
  });

  it('for one native control: a real <label for> - no group around it - and its hint tied by the page', () => {
    const tempo = group('tempo');
    const label = tempo.querySelector<HTMLLabelElement>('label.anotoki-labelled-group__label')!;
    expect(label.htmlFor).toBe('tempo-input');
    expect(words(label)).toBe('Tempo');
    expect(tempo.hasAttribute('role')).toBe(false);
    expect(tempo.hasAttribute('aria-labelledby')).toBe(false);
    const input = host.querySelector<HTMLInputElement>('#tempo-input')!;
    expect(input.labels?.[0]).toBe(label);
    expect(words(document.getElementById(input.getAttribute('aria-describedby')!))).toBe('Beats a minute');
  });

  it('beside a control that names itself with the same words: shown, and not said twice; inline on request', () => {
    const range = group('range');
    expect(range.hasAttribute('role')).toBe(false);
    expect(range.querySelector('.anotoki-labelled-group__label')?.getAttribute('aria-hidden')).toBe('true');
    expect(words(range.querySelector('.anotoki-labelled-group__label'))).toBe('Range');
    expect(range.querySelector('[role=radiogroup]')?.getAttribute('aria-label')).toBe('Range');
    expect(range.classList).toContain('anotoki-labelled-group--inline');
  });
});
