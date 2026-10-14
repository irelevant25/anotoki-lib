import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle, words } from '../../src/testing';
import { AccordionComponent } from './accordion/accordion.component';
import { DisclosurePanelDirective } from './disclosure-panel.directive';
import { DisclosureComponent } from './disclosure/disclosure.component';

/** Counts the lines a template makes: made only while it is in the page. */
let made = 0;

@Component({ selector: 'anotoki-test-heavy', template: '<p class="heavy">A long list</p>' })
class HeavyComponent {
  constructor() {
    made++;
  }
}

@Component({
  selector: 'anotoki-test-disclosures',
  imports: [DisclosureComponent, DisclosurePanelDirective, HeavyComponent],
  template: `
    <anotoki-disclosure id="notes" heading="Notes from the source" [(open)]="notes">
      <p class="plain-content">Swap the goblet for a Hydro one.</p>
    </anotoki-disclosure>
    <anotoki-disclosure id="lazy" heading="Pyro (12)" [headingLevel]="3">
      <ng-template anotokiDisclosurePanel><anotoki-test-heavy /></ng-template>
    </anotoki-disclosure>
    <anotoki-disclosure id="kept" heading="Hydro (9)" keep plain>
      <ng-template anotokiDisclosurePanel><anotoki-test-heavy /></ng-template>
    </anotoki-disclosure>
  `,
})
class DisclosuresComponent {
  readonly notes = signal(false);
}

@Component({
  selector: 'anotoki-test-accordion',
  imports: [AccordionComponent, DisclosureComponent],
  template: `
    <anotoki-accordion [multiple]="multiple()">
      <anotoki-disclosure id="one" heading="Choose the game" [headingLevel]="3">The game.</anotoki-disclosure>
      <anotoki-disclosure id="two" heading="Choose the way in" [headingLevel]="3">
        The way in.
        <anotoki-disclosure id="inner" heading="Trouble?">Look here.</anotoki-disclosure>
      </anotoki-disclosure>
      <anotoki-disclosure id="three" heading="Import" [headingLevel]="3">The import.</anotoki-disclosure>
    </anotoki-accordion>
  `,
})
class AccordionPageComponent {
  readonly multiple = signal(false);
}

const button = (host: HTMLElement, id: string) => host.querySelector<HTMLButtonElement>(`#${id} > .anotoki-disclosure__heading > button`)!;
const panel = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`#${id} > .anotoki-disclosure__panel`)!;

describe('<anotoki-disclosure>: a button that shows and hides what is under it', () => {
  let host: HTMLElement;
  let page: DisclosuresComponent;
  let fixture: Awaited<ReturnType<typeof draw<DisclosuresComponent>>>;

  beforeEach(async () => {
    made = 0;
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(DisclosuresComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  it('its button says whether it is open and what it opens; the panel hidden while closed', async () => {
    const notes = button(host, 'notes');
    expect(notes.getAttribute('type')).toBe('button');
    expect(notes.getAttribute('aria-expanded')).toBe('false');
    expect(notes.getAttribute('aria-controls')).toBe(panel(host, 'notes').id);
    expect(words(notes)).toBe('Notes from the source');
    expect(panel(host, 'notes').hidden).toBe(true);
    // Content given as it is: made at once, hidden.
    expect(panel(host, 'notes').querySelector('.plain-content')).not.toBeNull();

    notes.click();
    await settle(fixture);
    expect(notes.getAttribute('aria-expanded')).toBe('true');
    expect(panel(host, 'notes').hidden).toBe(false);
    expect(page.notes()).toBe(true);
    expect(host.querySelector('#notes')?.classList).toContain('anotoki-disclosure--open');

    page.notes.set(false);
    await settle(fixture);
    expect(notes.getAttribute('aria-expanded')).toBe('false');
  });

  it('in a heading of the page’s outline with headingLevel; a button alone without', () => {
    const heading = host.querySelector('#lazy > .anotoki-disclosure__heading')!;
    expect(heading.getAttribute('role')).toBe('heading');
    expect(heading.getAttribute('aria-level')).toBe('3');
    expect(host.querySelector('#notes > .anotoki-disclosure__heading')?.hasAttribute('role')).toBe(false);
  });

  it('content as a template: made only while open, dropped when closed - or kept once made', async () => {
    expect(made).toBe(0);
    expect(panel(host, 'lazy').querySelector('.heavy')).toBeNull();

    button(host, 'lazy').click();
    await settle(fixture);
    expect(panel(host, 'lazy').querySelector('.heavy')).not.toBeNull();
    expect(made).toBe(1);
    button(host, 'lazy').click();
    await settle(fixture);
    expect(panel(host, 'lazy').querySelector('.heavy')).toBeNull();

    button(host, 'kept').click();
    await settle(fixture);
    button(host, 'kept').click();
    await settle(fixture);
    expect(panel(host, 'kept').querySelector('.heavy')).not.toBeNull();
    expect(panel(host, 'kept').hidden).toBe(true);
    button(host, 'kept').click();
    await settle(fixture);
    expect(made).toBe(2);
    expect(host.querySelector('#kept')?.classList).toContain('anotoki-disclosure--plain');
  });
});

describe('<anotoki-accordion>: several disclosures, one open at a time or many', () => {
  let host: HTMLElement;
  let page: AccordionPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<AccordionPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(AccordionPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const expanded = () => ['one', 'two', 'three'].map((id) => button(host, id).getAttribute('aria-expanded'));

  it('one at a time: opening one closes the others; all may be closed', async () => {
    button(host, 'one').click();
    await settle(fixture);
    button(host, 'three').click();
    await settle(fixture);
    expect(expanded()).toEqual(['false', 'false', 'true']);
    button(host, 'three').click();
    await settle(fixture);
    expect(expanded()).toEqual(['false', 'false', 'false']);
  });

  it('many: each opens and closes on its own', async () => {
    page.multiple.set(true);
    await settle(fixture);
    button(host, 'one').click();
    button(host, 'three').click();
    await settle(fixture);
    expect(expanded()).toEqual(['true', 'false', 'true']);
  });

  it('a disclosure inside a panel is the panel’s own: opening it closes nothing around it', async () => {
    button(host, 'two').click();
    await settle(fixture);
    button(host, 'inner').click();
    await settle(fixture);
    expect(expanded()).toEqual(['false', 'true', 'false']);
    expect(button(host, 'inner').getAttribute('aria-expanded')).toBe('true');
  });

  it('Down and Up move the focus between its buttons, round the ends; Home and End to the ends', async () => {
    button(host, 'one').focus();
    press(button(host, 'one'), 'ArrowDown');
    expect(document.activeElement).toBe(button(host, 'two'));
    press(button(host, 'two'), 'ArrowDown');
    press(button(host, 'three'), 'ArrowDown');
    expect(document.activeElement).toBe(button(host, 'one'));
    press(button(host, 'one'), 'ArrowUp');
    expect(document.activeElement).toBe(button(host, 'three'));
    press(button(host, 'three'), 'Home');
    expect(document.activeElement).toBe(button(host, 'one'));
    const end = press(button(host, 'one'), 'End');
    expect(end.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button(host, 'three'));
    // A key from a nested disclosure's button, or anywhere in a panel, is not the accordion's.
    button(host, 'two').click();
    await settle(fixture);
    const inner = press(button(host, 'inner'), 'ArrowDown');
    expect(inner.defaultPrevented).toBe(false);
  });
});
