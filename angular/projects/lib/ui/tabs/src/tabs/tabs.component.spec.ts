import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig } from '@anotoki/lib/ui/config';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { TabItem } from '../tab-item';
import { FakeRow, fakeRow } from '../testing';
import { TabsComponent } from './tabs.component';

@Component({
  selector: 'anotoki-test-tabs',
  imports: [TabsComponent],
  template: `
    <anotoki-tabs #tabs="anotokiTabs" label="Members" [tabs]="items" [(active)]="active" />
    <div role="tabpanel" [id]="tabs.panelId(active())" [attr.aria-labelledby]="tabs.tabId(active())">{{ active() }}</div>
  `,
})
class TabsPageComponent {
  readonly items = [
    { id: 'all', label: 'All', count: 12 },
    { id: 'admins', label: 'Administrators' },
    { id: 'blocked', label: 'Blocked', count: 0 },
  ];
  readonly active = signal('all');
}

/** The tabs the 0.6.0 specs draw: six, more than a phone's line holds. */
const MANY: TabItem[] = [
  { id: 'characters', label: 'Characters', icon: 'user', badge: 12 },
  { id: 'issues', label: 'Issues', badge: 3, badgeLabel: '3 open', badgeTone: 'danger' },
  { id: 'news', label: 'News', badge: 'New', badgeTone: 'primary' },
  { id: 'errors', label: 'Errors', badge: 0 },
  { id: 'japanese', label: '日本語', lang: 'ja' },
  { id: 'settings', label: 'Settings', badge: '' },
];

@Component({
  selector: 'anotoki-test-many-tabs',
  imports: [TabsComponent],
  template: `<anotoki-tabs label="Parts" [tabs]="items()" [(active)]="active" />`,
})
class ManyTabsComponent {
  readonly items = signal<readonly TabItem[]>(MANY);
  readonly active = signal('characters');
}

/** What a screen reader hears of an element: its words without what is hidden from it (aria-hidden); a space before a comma is not heard. */
function heard(element: Element | null | undefined): string {
  const said = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : node instanceof Element && node.getAttribute('aria-hidden') === 'true' ? '' : Array.from(node.childNodes, said).join('');
  return element ? said(element).replace(/\s+/g, ' ').replace(/ ,/g, ',').trim() : '';
}

describe('<anotoki-tabs>: the WAI-ARIA tabs pattern', () => {
  it('a named tablist; only the chosen tab is a Tab stop; the panel ids line up', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(TabsPageComponent);
    const host: HTMLElement = fixture.nativeElement;
    const tabs = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]'));
    expect(host.querySelector('[role=tablist]')?.getAttribute('aria-label')).toBe('Members');
    expect(tabs().map(words)).toEqual(['All 12', 'Administrators', 'Blocked 0']);
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    const panel = host.querySelector('[role=tabpanel]')!;
    expect(tabs()[0].getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);

    tabs()[0].focus();
    press(tabs()[0], 'ArrowRight');
    await settle(fixture);
    expect(fixture.componentInstance.active()).toBe('admins');
    expect(document.activeElement).toBe(tabs()[1]);
    press(tabs()[1], 'End');
    await settle(fixture);
    expect(document.activeElement).toBe(tabs()[2]);
    press(tabs()[2], 'ArrowRight');
    await settle(fixture);
    expect(document.activeElement).toBe(tabs()[0]);
    press(tabs()[0], 'ArrowLeft');
    await settle(fixture);
    expect(fixture.componentInstance.active()).toBe('blocked');
    press(tabs()[2], 'Home');
    await settle(fixture);
    expect(fixture.componentInstance.active()).toBe('all');
    tabs()[1].click();
    await settle(fixture);
    expect(fixture.componentInstance.active()).toBe('admins');
    host.remove();
  });

  it('the tablist owns its tabs alone: the strip and its arrows stand outside it', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(TabsPageComponent);
    const host: HTMLElement = fixture.nativeElement;
    const list = host.querySelector('[role=tablist]')!;
    expect(Array.from(list.children).map((child) => child.getAttribute('role'))).toEqual(['tab', 'tab', 'tab']);
    expect(list.parentElement?.classList).toContain('anotoki-tab-strip__scroller');
    // A row that fits: no fade, no arrows.
    expect(host.querySelector('anotoki-tab-strip')?.className).toBe('anotoki-tab-strip');
    expect(host.querySelector('.anotoki-tab-strip__more')).toBeNull();
    host.remove();
  });
});

describe('<anotoki-tabs>: an icon before a tab’s words and the kit’s badge after them (0.6.0)', () => {
  async function setUp(config?: () => AnotokiUiConfig) {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    const fixture = await draw(ManyTabsComponent);
    const host: HTMLElement = fixture.nativeElement;
    return { fixture, host, tabs: () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]')) };
  }

  it('the badge is seen as it is and heard after the label - itself after a comma, or the site’s words ("Issues, 3 open")', async () => {
    const { host, tabs } = await setUp();
    const badges = tabs().map((tab) => tab.querySelector('anotoki-badge'));
    expect(badges.map(words)).toEqual(['12', '3', 'New', '0', null, null]);
    expect(badges.filter(Boolean).map((badge) => badge!.getAttribute('aria-hidden'))).toEqual(['true', 'true', 'true', 'true']);
    expect(badges.filter(Boolean).map((badge) => badge!.getAttribute('data-tone'))).toEqual(['neutral', 'danger', 'primary', 'neutral']);
    // A 0 is a count too; an empty badge is none.
    expect(tabs().map(heard)).toEqual(['Characters, 12', 'Issues, 3 open', 'News, New', 'Errors, 0', '日本語', 'Settings']);
    host.remove();
  });

  it('an icon before the words, drawn and never heard; a label in another language says so', async () => {
    const { host, tabs } = await setUp();
    const icon = tabs()[0].querySelector('anotoki-icon');
    expect(icon).not.toBeNull();
    expect(tabs()[0].firstElementChild).toBe(icon);
    expect(icon?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(tabs()[1].querySelector('anotoki-icon')).toBeNull();
    expect(tabs()[4].querySelector('.anotoki-tabs__label')?.getAttribute('lang')).toBe('ja');
    expect(tabs()[0].querySelector('.anotoki-tabs__label')?.hasAttribute('lang')).toBe(false);
    host.remove();
  });
});

describe('<anotoki-tabs>: a row that does not fit scrolls sideways, with a hint that more is there (0.6.0)', () => {
  let row: FakeRow;

  afterEach(() => row?.stop());

  async function setUp(options: { active?: string; config?: () => AnotokiUiConfig } = {}) {
    // Six tabs of 150 px in a strip of 300: the row is three views long.
    row = fakeRow({ width: 300, tab: 150 });
    TestBed.configureTestingModule({ providers: kitProviders(options.config) });
    const fixture = TestBed.createComponent(ManyTabsComponent);
    if (options.active) {
      fixture.componentInstance.active.set(options.active);
    }
    document.body.appendChild(fixture.nativeElement);
    await settle(fixture);
    const host: HTMLElement = fixture.nativeElement;
    const strip = host.querySelector<HTMLElement>('anotoki-tab-strip')!;
    const scroller = host.querySelector<HTMLElement>('.anotoki-tab-strip__scroller')!;
    return {
      fixture,
      host,
      strip,
      scroller,
      tabs: () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]')),
      arrows: () => Array.from(host.querySelectorAll<HTMLButtonElement>('.anotoki-tab-strip__more')),
    };
  }

  it('at the start: the far edge fades under an arrow - for the eye and the pointer, out of the tab order and hidden from screen readers', async () => {
    const { host, strip, arrows } = await setUp();
    expect(strip.classList).toContain('anotoki-tab-strip--forward');
    expect(strip.classList).not.toContain('anotoki-tab-strip--back');
    expect(arrows().map((arrow) => arrow.className)).toEqual(['anotoki-tab-strip__more anotoki-tab-strip__more--forward']);
    const [more] = arrows();
    expect(more.getAttribute('aria-hidden')).toBe('true');
    expect(more.tabIndex).toBe(-1);
    expect(more.getAttribute('type')).toBe('button');
    expect(more.title).toBe('More tabs');
    expect(more.hasAttribute('lang')).toBe(false);
    // Never inside the tablist, never taking the focus from where it is.
    expect(more.closest('[role=tablist]')).toBeNull();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    more.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    host.remove();
  });

  it('an arrow moves the row most of a view on; then both edges fade, and at the end only the near one', async () => {
    const { fixture, host, strip, scroller, arrows } = await setUp();
    arrows()[0].click();
    await settle(fixture);
    expect(row.moves).toEqual([{ left: 240, behavior: 'smooth' }]);
    expect(row.left(scroller)).toBe(240);
    expect(strip.classList).toContain('anotoki-tab-strip--back');
    expect(strip.classList).toContain('anotoki-tab-strip--forward');
    expect(arrows().map((arrow) => arrow.title)).toEqual(['Earlier tabs', 'More tabs']);

    arrows()[1].click();
    await settle(fixture);
    expect(row.left(scroller)).toBe(480);
    // The last step: to the row's end, and no further.
    arrows()[1].click();
    await settle(fixture);
    expect(row.moves.at(-1)).toEqual({ left: 120, behavior: 'smooth' });
    expect(row.left(scroller)).toBe(600);
    expect(strip.classList).toContain('anotoki-tab-strip--back');
    expect(strip.classList).not.toContain('anotoki-tab-strip--forward');
    expect(arrows().map((arrow) => arrow.title)).toEqual(['Earlier tabs']);

    arrows()[0].click();
    await settle(fixture);
    expect(row.moves.at(-1)).toEqual({ left: -240, behavior: 'smooth' });
    expect(row.left(scroller)).toBe(360);
    host.remove();
  });

  it('a person who asked for less motion: the row jumps', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    try {
      const { fixture, host, arrows } = await setUp();
      arrows()[0].click();
      await settle(fixture);
      expect(row.moves).toEqual([{ left: 240, behavior: 'auto' }]);
      host.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the chosen tab is brought into view as it is drawn (at once), and whenever it changes (gliding) - clear of the fade', async () => {
    // "Japanese" (the fifth, 600-750 px) chosen as the page opens: brought in at once, 44 px clear of the far edge.
    const { fixture, host, scroller, tabs } = await setUp({ active: 'japanese' });
    expect(row.moves).toEqual([{ left: 494, behavior: 'auto' }]);
    expect(row.left(scroller)).toBe(494);

    // The page chooses the first: the row glides back to its start - and no further.
    fixture.componentInstance.active.set('characters');
    await settle(fixture);
    expect(row.moves.at(-1)).toEqual({ left: -494, behavior: 'smooth' });
    expect(row.left(scroller)).toBe(0);

    // End from the keyboard: the focus on the last tab brings it in at once, as a browser brings in what it focuses;
    // chosen and already in view, it moves nothing more.
    tabs()[0].focus();
    press(tabs()[0], 'End');
    await settle(fixture);
    expect(fixture.componentInstance.active()).toBe('settings');
    expect(document.activeElement).toBe(tabs()[5]);
    expect(row.moves.at(-1)).toEqual({ left: 600, behavior: 'auto' });
    expect(row.left(scroller)).toBe(600);
    expect(row.moves.length).toBe(3);
    host.remove();
  });

  it('a tab that takes the focus is brought into view clear of the fade, at once; one in view is left where it is', async () => {
    const { fixture, host, scroller, tabs } = await setUp();
    // The first, at the row's start: nowhere further to go.
    tabs()[0].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(row.moves).toEqual([]);
    // "Issues" (150-300 px) ends under the far fade: 44 px in.
    tabs()[1].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(row.moves).toEqual([{ left: 44, behavior: 'auto' }]);
    // "Errors" (450-600 px, 406-556 in view now): its end 44 px from the view's.
    tabs()[3].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(fixture);
    expect(row.moves.at(-1)).toEqual({ left: 300, behavior: 'auto' });
    expect(row.left(scroller)).toBe(344);
    // Focused again, in view and clear of both fades: left where it is.
    tabs()[3].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(row.moves.length).toBe(2);
    host.remove();
  });

  it('the arrows’ words in Slovak, and in the site’s own words where it has them', async () => {
    const language = signal('sk');
    const first = await setUp({ config: () => ({ language }) });
    expect(first.arrows()[0].title).toBe('Ďalšie karty');
    first.arrows()[0].click();
    await settle(first.fixture);
    expect(first.arrows().map((arrow) => arrow.title)).toEqual(['Predchádzajúce karty', 'Ďalšie karty']);
    first.host.remove();
    row.stop();
    TestBed.resetTestingModule();

    const second = await setUp({ config: () => ({ language: () => 'sk', lookup: (key) => ((key as string) === 'tabs.scrollForward' ? 'Ďalej' : null) }) });
    expect(second.arrows()[0].title).toBe('Ďalej');
    second.host.remove();
  });
});
