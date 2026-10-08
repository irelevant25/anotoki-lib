import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { MenuItemComponent } from '../menu-item/menu-item.component';
import { MenuSeparatorComponent } from '../menu-separator/menu-separator.component';
import { MenuTriggerDirective } from '../menu-trigger.directive';
import { MenuComponent } from './menu.component';

@Component({
  selector: 'anotoki-test-menu',
  imports: [MenuComponent, MenuItemComponent, MenuSeparatorComponent, MenuTriggerDirective],
  template: `
    <button type="button" id="before">Before</button>
    <button type="button" id="more" [anotokiMenuTrigger]="menu">More</button>
    <anotoki-menu #menu [label]="label()" (opened)="events.push('opened')" (closed)="events.push('closed')">
      <a anotokiMenuItem href="#one" id="one">One</a>
      <button anotokiMenuItem id="two" (click)="chosen.push('two')">Two</button>
      <button anotokiMenuItem id="off" disabled>Off</button>
      <anotoki-menu-separator />
      <button anotokiMenuItem id="wait" stay (click)="chosen.push('wait')">Wait</button>
      <button anotokiMenuItem id="last" (click)="chosen.push('last')">Last</button>
    </anotoki-menu>
    <button type="button" id="after">After</button>
  `,
})
class MenuPageComponent {
  readonly label = signal<string | null>(null);
  readonly chosen: string[] = [];
  readonly events: string[] = [];
}

@Component({
  selector: 'anotoki-test-radio-menu',
  imports: [MenuComponent, MenuItemComponent, MenuTriggerDirective],
  template: `
    <button type="button" id="language" [anotokiMenuTrigger]="languages">SK</button>
    <anotoki-menu #languages label="Language" align="end">
      @for (language of offered; track language.code) {
        <button anotokiMenuItem [radio]="language.code === current()" [attr.lang]="language.code" (click)="current.set(language.code)">{{ language.name }}</button>
      }
    </anotoki-menu>
  `,
})
class RadioMenuPageComponent {
  readonly offered = [
    { code: 'en', name: 'English' },
    { code: 'sk', name: 'Slovenčina' },
    { code: 'de', name: 'Deutsch' },
  ];
  readonly current = signal('sk');
}

describe('<anotoki-menu>: the family’s menu button', () => {
  let host: HTMLElement;
  let page: MenuPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<MenuPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(MenuPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const trigger = () => host.querySelector<HTMLButtonElement>('#more')!;
  const panel = () => host.querySelector<HTMLElement>('[role=menu]');
  const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role=menu] [role=menuitem]'));
  const item = (id: string) => host.querySelector<HTMLElement>('#' + id)!;

  async function open(): Promise<void> {
    trigger().click();
    await settle(fixture);
  }

  it('the button says what it opens; the menu is drawn only while open', async () => {
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-controls')).toBeNull();
    expect(panel()).toBeNull();

    await open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(panel()!.id);
    expect(panel()!.getAttribute('popover')).toBe('manual');
    expect(page.events).toEqual(['opened']);
  });

  it('is named by its button - or by its label', async () => {
    await open();
    expect(panel()!.getAttribute('aria-labelledby')).toBe('more');
    expect(panel()!.getAttribute('aria-label')).toBeNull();
    page.label.set('More actions');
    await settle(fixture);
    expect(panel()!.getAttribute('aria-label')).toBe('More actions');
    expect(panel()!.getAttribute('aria-labelledby')).toBeNull();
  });

  it('items are menuitems out of the tab order; the separator a separator', async () => {
    await open();
    expect(items().map((element) => element.id)).toEqual(['one', 'two', 'off', 'wait', 'last']);
    expect(items().every((element) => element.getAttribute('tabindex') === '-1')).toBe(true);
    expect(host.querySelector('anotoki-menu-separator')?.getAttribute('role')).toBe('separator');
    expect(item('off').hasAttribute('disabled')).toBe(true);
    expect(item('two').getAttribute('type')).toBe('button');
  });

  it('the focus goes into the menu as it opens, onto the first item', async () => {
    await open();
    expect(document.activeElement).toBe(item('one'));
  });

  it('arrows move round the items, skipping a disabled one; Home and End to the ends', async () => {
    await open();
    press(item('one'), 'ArrowDown');
    expect(document.activeElement).toBe(item('two'));
    press(item('two'), 'ArrowDown');
    expect(document.activeElement).toBe(item('wait'));
    press(item('wait'), 'ArrowDown');
    press(item('last'), 'ArrowDown');
    expect(document.activeElement).toBe(item('one'));
    press(item('one'), 'ArrowUp');
    expect(document.activeElement).toBe(item('last'));
    press(item('last'), 'Home');
    expect(document.activeElement).toBe(item('one'));
    press(item('one'), 'End');
    expect(document.activeElement).toBe(item('last'));
  });

  it('Escape closes it, the focus back on its button - and goes no further (a dialog around it stays)', async () => {
    const outer = vi.fn();
    host.addEventListener('keydown', outer);
    await open();
    const escape = press(item('two'), 'Escape');
    await settle(fixture);
    expect(escape.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(page.events).toEqual(['opened', 'closed']);
  });

  /**
   * Tab and Shift+Tab from the first, a middle and the last item: the browser’s own move is stopped (it would land on an
   * item about to go - with no zone the menu goes only at the next render - and then on <body>), the menu closes, and
   * the focus is on its button, where the next Tab moves on from.
   */
  it('Tab and Shift+Tab close it with the focus on its button, from any item - never on <body>', async () => {
    for (const [id, shift] of [
      ['one', false],
      ['wait', false],
      ['last', false],
      ['two', true],
      ['one', true],
    ] as const) {
      await open();
      item(id).focus();
      const tab = press(item(id), 'Tab', { shiftKey: shift });
      expect(tab.defaultPrevented, `${shift ? 'Shift+' : ''}Tab from ${id}`).toBe(true);
      expect(document.activeElement).toBe(trigger());
      await settle(fixture);
      expect(panel()).toBeNull();
      expect(document.activeElement).toBe(trigger());
      expect(document.activeElement).not.toBe(document.body);
    }
  });

  it('a click outside closes it and leaves the focus where it is; a click inside that is no item does not', async () => {
    await open();
    panel()!.click();
    await settle(fixture);
    expect(panel()).not.toBeNull();

    item('after').click();
    item('after').focus();
    await settle(fixture);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(item('after'));
  });

  it('choosing an item closes it with the focus on its button; an item that stays keeps it open', async () => {
    await open();
    item('wait').click();
    await settle(fixture);
    expect(page.chosen).toEqual(['wait']);
    expect(panel()).not.toBeNull();

    item('two').click();
    await settle(fixture);
    expect(page.chosen).toEqual(['wait', 'two']);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('a disabled item cannot be chosen and leaves the menu open', async () => {
    await open();
    item('off').click();
    await settle(fixture);
    expect(panel()).not.toBeNull();
  });

  it('the button again closes it; ArrowDown and ArrowUp on the button open it on the first and the last item', async () => {
    await open();
    trigger().click();
    await settle(fixture);
    expect(panel()).toBeNull();

    trigger().focus();
    const down = press(trigger(), 'ArrowDown');
    await settle(fixture);
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(item('one'));
    press(item('one'), 'Escape');
    await settle(fixture);

    press(trigger(), 'ArrowUp');
    await settle(fixture);
    expect(document.activeElement).toBe(item('last'));
  });

  it('Escape anywhere in the page closes it too', async () => {
    await open();
    item('after').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle(fixture);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

describe('<anotoki-menu> of radio items: one choice out of a few (the languages)', () => {
  it('menuitemradio items with aria-checked and a check mark; the focus opens on the checked one', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(RadioMenuPageComponent);
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLButtonElement>('#language')!.click();
    await settle(fixture);

    const radios = Array.from(host.querySelectorAll<HTMLElement>('[role=menuitemradio]'));
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios.map((radio) => radio.getAttribute('lang'))).toEqual(['en', 'sk', 'de']);
    expect(radios[1].querySelector('.check')).not.toBeNull();
    expect(radios[0].querySelector('.check')).toBeNull();
    expect(document.activeElement).toBe(radios[1]);
    expect(host.querySelector('[role=menu]')?.getAttribute('aria-label')).toBe('Language');

    radios[0].click();
    await settle(fixture);
    expect(fixture.componentInstance.current()).toBe('en');
    expect(host.querySelector('[role=menu]')).toBeNull();
    expect(words(host.querySelector('#language'))).toBe('SK');
    host.remove();
  });
});
