import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { type Mock } from 'vitest';
import { kitProviders, press, settle, windowOf, words } from '../../../ui/src/testing';
import { provideAnotokiShell } from '../config';
import { ShellSite, shellSite } from '../testing';
import { TopBarAction, TopBarBrand, TopBarComponent, TopBarLink, TopBarMenuItem, TopBarMenuNote, TopBarPerson, TopBarPhoneMark } from './top-bar.component';

const SURVEY: TopBarBrand = { area: 'survey', link: '/', label: 'anotoki survey: the open surveys' };
const ADMIN: TopBarBrand = { area: 'survey', panel: 'admin panel', link: '/admin', label: 'anotoki survey · admin panel - home' };
const LINKS: TopBarLink[] = [
  { id: 'surveys', label: 'Surveys', path: '/admin', under: ['/admin/surveys/'] },
  { id: 'translations', label: 'Translations', path: '/admin/translations' },
  { id: 'languages', label: 'Languages', path: '/admin/languages' },
];
const MIRA: TopBarPerson = { name: 'Mira', email: 'mira@example.test', role: 'Administrator' };
const ITEMS: TopBarMenuItem[] = [
  { id: 'account', label: 'Your anotoki account', icon: 'user', href: 'https://iam.example.test/account', newTab: true },
  { id: 'admin', label: 'Admin panel', icon: 'shield', path: '/admin' },
];

@Component({ selector: 'anotoki-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

@Component({
  selector: 'anotoki-test-bar',
  imports: [TopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <anotoki-top-bar
      #bar="anotokiTopBar"
      [brand]="brand()"
      [links]="links()"
      [navLabel]="navLabel()"
      [person]="person()"
      [menuItems]="items()"
      [signIn]="signIn()"
      [signOut]="signOut()"
      [languages]="languages()"
      [phoneMax]="phoneMax()"
      [nameMin]="nameMin()"
      [shortBrandMax]="shortBrandMax()"
      [width]="width()"
      [phoneMark]="phoneMark()"
      [menuNote]="menuNote()"
      [isolateKeys]="isolateKeys()"
      (languageChanged)="languageChanged.push($event)"
    >
      <span topBarWidgets class="widget">{{ bar.phone() ? 'phone' : 'desktop' }}</span>
    </anotoki-top-bar>
  `,
})
class BarPageComponent {
  readonly brand = signal<TopBarBrand>(SURVEY);
  readonly links = signal<readonly TopBarLink[]>(LINKS);
  readonly navLabel = signal<string | null>(null);
  readonly person = signal<TopBarPerson | null>(MIRA);
  readonly items = signal<readonly TopBarMenuItem[]>(ITEMS);
  readonly signIn = signal<TopBarAction | null>(null);
  readonly signOut = signal<TopBarAction | null>(null);
  readonly languages = signal(true);
  readonly phoneMax = signal(760);
  readonly nameMin = signal<number | null>(null);
  readonly shortBrandMax = signal<number | null>(null);
  readonly width = signal<'wide' | 'narrow'>('wide');
  readonly phoneMark = signal<TopBarPhoneMark | null>(null);
  readonly menuNote = signal<TopBarMenuNote | null>(null);
  readonly isolateKeys = signal(true);
  readonly languageChanged: string[] = [];
}

describe('<anotoki-top-bar>: the family’s one bar', () => {
  let site: ShellSite;
  let page: BarPageComponent;
  let fixture: ComponentFixture<BarPageComponent>;
  let host: HTMLElement;
  let window: { resize(width: number): void };
  let signOut: Mock<() => unknown>;
  let signIn: Mock<() => unknown>;

  const personButton = () => host.querySelector<HTMLButtonElement>('.person-button')!;
  const phoneButton = () => host.querySelector<HTMLButtonElement>('.menu-button')!;
  const menu = () => host.querySelector<HTMLElement>('anotoki-top-bar [role=menu]:not([aria-label="Language"]):not([aria-label="Jazyk"])');
  const items = () => Array.from(menu()?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
  const navLinks = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('.nav a'));
  const parts = (selector: string) => Array.from(host.querySelectorAll(selector)).map(words);
  /** A link as "words href", with " [page]" for aria-current and " [here]" for the section the page is in. */
  const described = (link: HTMLAnchorElement) =>
    `${words(link)} ${link.getAttribute('href')}${link.getAttribute('aria-current') === 'page' ? ' [page]' : ''}${link.classList.contains('is-active') ? ' [here]' : ''}`;
  /** What stands in an element, in order: each child as tag.firstClass. */
  const childrenOf = (selector: string) => Array.from(host.querySelector(selector)!.children).map((child) => child.tagName.toLowerCase() + (child.classList.length ? '.' + child.classList[0] : ''));

  async function draw(width = 1280, language = 'en'): Promise<void> {
    window = windowOf(width);
    site = shellSite();
    site.language.set(language);
    TestBed.configureTestingModule({
      providers: [
        ...kitProviders(() => ({ language: site.language })),
        provideRouter([{ path: '**', component: PageComponent }]),
        provideAnotokiShell(() => ({
          theme: { storageKey: 'test:theme' },
          languages: { current: site.language, offered: site.offered, choose: site.choose },
        })),
      ],
    });
    fixture = TestBed.createComponent(BarPageComponent);
    page = fixture.componentInstance;
    signOut = vi.fn<() => unknown>();
    signIn = vi.fn<() => unknown>();
    page.signOut.set(signOut);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle(fixture);
  }

  async function at(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await settle(fixture);
  }

  async function openMenu(): Promise<void> {
    const button = host.querySelector<HTMLButtonElement>('.person-button') ?? phoneButton();
    button.focus();
    button.click();
    await settle(fixture);
  }

  afterEach(() => {
    host?.remove();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('is one row in the family’s order: the brand, the links, then the widgets, the language, the theme and the person', async () => {
    await draw();
    expect(childrenOf('.row')).toEqual(['anotoki-brand.anotoki-brand', 'nav.nav', 'div.actions']);
    expect(childrenOf('.actions')).toEqual([
      'span.widget',
      'anotoki-language-switcher.anotoki-language-switcher',
      'anotoki-theme-toggle.anotoki-theme-toggle',
      'button.person-button',
      'anotoki-menu.anotoki-menu',
    ]);
    expect(host.querySelector('.nav')?.getAttribute('aria-label')).toBe('Main navigation');
    expect(parts('anotoki-brand .wordmark > span')).toEqual(['anotoki', 'survey']);
    expect(host.querySelector('anotoki-brand a')?.getAttribute('aria-label')).toBe('anotoki survey: the open surveys');
    // A widget reads the bar's fold through #bar="anotokiTopBar".
    expect(words(host.querySelector('.widget'))).toBe('desktop');
  });

  it('marks the link of the page, and the section the page is in', async () => {
    await draw();
    await at('/admin');
    expect(navLinks().map(described)).toEqual(['Surveys /admin [page] [here]', 'Translations /admin/translations', 'Languages /admin/languages']);
    await at('/admin/surveys/42?tab=answers');
    expect(navLinks().map(described)[0]).toBe('Surveys /admin [here]');
    page.navLabel.set('The sections');
    await settle(fixture);
    expect(host.querySelector('.nav')?.getAttribute('aria-label')).toBe('The sections');
  });

  it('the person’s menu: its button named with the name it shows; the name, the address, the role; the site’s items; Sign out', async () => {
    await draw();
    expect(personButton().getAttribute('aria-label')).toBe('Your menu: Mira');
    expect(words(personButton().querySelector('.person-name'))).toBe('Mira');
    expect(words(personButton().querySelector('.initial'))).toBe('M');
    await openMenu();
    expect(menu()?.getAttribute('aria-label')).toBe('Your menu');
    expect(parts('.menu-head > span')).toEqual(['Mira', 'mira@example.test', 'Administrator']);
    expect(items().map(words)).toEqual(['Your anotoki account', 'Admin panel', 'Sign out']);
    const account = items()[0];
    expect(account.getAttribute('href')).toBe('https://iam.example.test/account');
    expect(account.getAttribute('target')).toBe('_blank');
    expect(account.getAttribute('rel')).toBe('noopener');
    expect(account.querySelector('.external')).not.toBeNull();
    expect(items()[1].getAttribute('href')).toBe('/admin');
    expect(menu()?.querySelectorAll('anotoki-menu-separator').length).toBe(1);
  });

  it('the address is not said twice when it is the name; no role, no role line', async () => {
    await draw();
    page.person.set({ name: 'mira@example.test', email: 'mira@example.test' });
    await settle(fixture);
    await openMenu();
    expect(parts('.menu-head > span')).toEqual(['mira@example.test']);
  });

  it('moves the focus into the menu as it opens; the arrows and End between its items; Escape back to its button', async () => {
    await draw();
    await openMenu();
    expect(personButton().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items()[0]);
    press(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    press(items()[1], 'End');
    expect(document.activeElement).toBe(items().at(-1));
    press(items().at(-1)!, 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    press(items()[0], 'Escape');
    await settle(fixture);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(personButton());
  });

  /**
   * Tab and Shift+Tab from the first, a middle and the last item: the browser’s own move is stopped (it would land on
   * an item about to go - with no zone the menu goes only at the next render - and then on <body>), the menu closes,
   * and the focus is on its button, where the next Tab moves on from.
   */
  async function expectTabOut(button: () => HTMLButtonElement, middle: number): Promise<void> {
    const count = items().length;
    for (const [which, shift] of [
      [0, false],
      [middle, false],
      [count - 1, false],
      [middle, true],
    ] as const) {
      if (!menu()) {
        button().focus();
        button().click();
        await settle(fixture);
      }
      expect(items().length).toBe(count);
      items()[which].focus();
      const tab = press(items()[which], 'Tab', { shiftKey: shift });
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(button());
      await settle(fixture);
      expect(menu()).toBeNull();
      expect(button().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button());
    }
  }

  it('closes on Tab and Shift+Tab with the focus on its button, from any item - never on <body>', async () => {
    await draw();
    await openMenu();
    await expectTabOut(personButton, 1);
  });

  it('closes on a click outside it - a click inside it is no reason to', async () => {
    await draw();
    await openMenu();
    host.querySelector<HTMLElement>('.menu-head')!.click();
    await settle(fixture);
    expect(menu()).not.toBeNull();
    document.body.click();
    await settle(fixture);
    expect(menu()).toBeNull();
    expect(personButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('follows a change of language without being drawn again', async () => {
    await draw();
    site.language.set('sk');
    await settle(fixture);
    expect(personButton().getAttribute('aria-label')).toBe('Tvoja ponuka: Mira');
    expect(host.querySelector('.nav')?.getAttribute('aria-label')).toBe('Hlavná navigácia');
    await openMenu();
    expect(menu()?.getAttribute('aria-label')).toBe('Tvoja ponuka');
    expect(items().at(-1)?.textContent?.trim()).toBe('Odhlásiť sa');
  });

  it('the language: the switcher where the site’s pages are translated; a choice made there is told (languageChanged)', async () => {
    await draw();
    const switcher = host.querySelector<HTMLButtonElement>('anotoki-language-switcher .switcher')!;
    expect(switcher.getAttribute('aria-label')).toBe('Language: English (EN)');
    switcher.click();
    await settle(fixture);
    host.querySelector<HTMLElement>('anotoki-language-switcher [role=menuitemradio][lang=sk]')!.click();
    await settle(fixture);
    expect(page.languageChanged).toEqual(['sk']);
    page.languages.set(false);
    await settle(fixture);
    expect(host.querySelector('anotoki-language-switcher')).toBeNull();
  });

  describe('Sign out and Sign in', () => {
    it('Sign out: the site’s action, then the menu closes with the focus on its button', async () => {
      await draw();
      await openMenu();
      items().at(-1)!.click();
      await settle(fixture);
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(personButton());
    });

    it('a Sign out that waits: its item stays, disabled, with a spinner and "Saving…", the menu open and the focus on its button', async () => {
      await draw();
      let finish!: () => void;
      signOut.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
      await openMenu();
      items().at(-1)!.click();
      await settle(fixture);
      const item = menu()!.querySelector<HTMLButtonElement>('.sign-out-item')!;
      expect(menu()).not.toBeNull();
      expect(item.disabled).toBe(true);
      expect(item.getAttribute('aria-busy')).toBe('true');
      expect(words(item)).toBe('Saving…');
      expect(item.querySelector('anotoki-spinner')).not.toBeNull();
      expect(document.activeElement).toBe(personButton());
      // The arrows leave the waiting item out.
      expect(items().map(words)).toEqual(['Your anotoki account', 'Admin panel', 'Saving…']);

      finish();
      await settle(fixture);
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(personButton());
    });

    it('a Sign out that fails stops waiting; the site says why', async () => {
      await draw();
      signOut.mockRejectedValue(new Error('offline'));
      await openMenu();
      items().at(-1)!.click();
      await settle(fixture);
      expect(menu()).toBeNull();
    });

    it('signed out: Sign in in the row - waiting, it says "Saving…"; no Sign in offered, nothing', async () => {
      await draw();
      page.person.set(null);
      page.signIn.set(signIn);
      await settle(fixture);
      const button = host.querySelector<HTMLButtonElement>('.sign-in')!;
      expect(words(button)).toBe('Sign in');
      expect(button.classList).toContain('is-primary');
      let finish!: () => void;
      signIn.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
      button.click();
      await settle(fixture);
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(button.disabled).toBe(true);
      expect(words(button)).toBe('Saving…');
      finish();
      await settle(fixture);
      expect(words(button)).toBe('Sign in');

      page.signIn.set(null);
      await settle(fixture);
      expect(host.querySelector('.sign-in')).toBeNull();
      expect(host.querySelector('.person-button')).toBeNull();
    });
  });

  describe('keys stay in the bar (isolateKeys)', () => {
    it('no key pressed in the bar reaches document; Escape is handled inside', async () => {
      await draw();
      const heard = vi.fn();
      document.addEventListener('keydown', heard);
      press(navLinks()[0], 'Enter');
      press(personButton(), ' ');
      await openMenu();
      press(personButton(), 'Escape');
      await settle(fixture);
      document.removeEventListener('keydown', heard);
      expect(heard).not.toHaveBeenCalled();
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(personButton());
    });

    it('isolateKeys false lets them through', async () => {
      await draw();
      page.isolateKeys.set(false);
      await settle(fixture);
      const heard = vi.fn();
      document.addEventListener('keydown', heard);
      press(navLinks()[0], 'Enter');
      document.removeEventListener('keydown', heard);
      expect(heard).toHaveBeenCalledTimes(1);
    });
  });

  it('a menu open for one person closes when the person changes, and when the links change', async () => {
    await draw();
    await openMenu();
    page.person.set({ name: 'Jo' });
    await settle(fixture);
    expect(menu()).toBeNull();
    await openMenu();
    page.person.set({ name: 'Jo' });
    await settle(fixture);
    expect(menu()).not.toBeNull();
    page.links.set(LINKS.slice(0, 1));
    await settle(fixture);
    expect(menu()).toBeNull();
  });

  it('the menu notes heading both menus ("Not saved yet")', async () => {
    await draw();
    page.menuNote.set({ title: 'Not saved yet', text: 'Your progress waits for the connection.' });
    await settle(fixture);
    await openMenu();
    expect(parts('.menu-note > *')).toEqual(['Not saved yet', 'Your progress waits for the connection.']);
  });

  it('narrow: the row as wide as a narrow page', async () => {
    await draw();
    page.width.set('narrow');
    await settle(fixture);
    expect(host.querySelector('.row')?.classList).toContain('is-narrow');
  });

  describe('on a phone', () => {
    it('is the brand (short), the widgets, the language, the theme and a menu button - nothing else in the row', async () => {
      await draw(390);
      expect(parts('anotoki-brand .wordmark > span')).toEqual(['survey']);
      expect(host.querySelector('.nav')).toBeNull();
      expect(host.querySelector('.person-button')).toBeNull();
      expect(childrenOf('.actions')).toEqual([
        'span.widget',
        'anotoki-language-switcher.anotoki-language-switcher',
        'anotoki-theme-toggle.anotoki-theme-toggle',
        'button.round',
        'anotoki-menu.anotoki-menu',
      ]);
      expect(words(host.querySelector('.widget'))).toBe('phone');
      expect(phoneButton().getAttribute('aria-label')).toBe('Menu');
      expect(phoneButton().getAttribute('aria-haspopup')).toBe('menu');
      expect(phoneButton().getAttribute('aria-expanded')).toBe('false');
    });

    it('a short form of the area where the site has one; an admin panel’s "admin panel" small under it', async () => {
      await draw(390);
      page.brand.set({ ...SURVEY, area: 'Piano Academy', short: 'Piano' });
      await settle(fixture);
      expect(parts('anotoki-brand .wordmark > span')).toEqual(['Piano']);
      page.brand.set(ADMIN);
      await settle(fixture);
      expect(parts('anotoki-brand .wordmark > span')).toEqual(['survey', '·', 'admin panel']);
      expect(host.querySelector('.wordmark')?.classList).toContain('has-panel');
    });

    it('holds the links, a separator and the person’s menu: the focus in, the arrows, Home, Escape back to its button', async () => {
      await draw(360);
      await at('/admin/translations');
      await openMenu();
      expect(phoneButton().getAttribute('aria-expanded')).toBe('true');
      expect(menu()?.getAttribute('aria-label')).toBe('Menu');
      expect(items().map(words)).toEqual(['Surveys', 'Translations', 'Languages', 'Your anotoki account', 'Admin panel', 'Sign out']);
      expect(items()[1].getAttribute('aria-current')).toBe('page');
      expect(menu()?.querySelectorAll('anotoki-menu-separator').length).toBe(2);
      expect(parts('.menu-head > span')).toEqual(['Mira', 'mira@example.test', 'Administrator']);
      expect(document.activeElement).toBe(items()[0]);

      press(items()[0], 'ArrowUp');
      expect(document.activeElement).toBe(items().at(-1));
      press(items().at(-1)!, 'Home');
      expect(document.activeElement).toBe(items()[0]);
      press(items()[0], 'Escape');
      await settle(fixture);
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(phoneButton());
    });

    it('closes when a link is chosen, on a click outside, and on Tab out of it from any item', async () => {
      await draw(390);
      await openMenu();
      items()[1].click();
      await settle(fixture);
      expect(menu()).toBeNull();
      expect(TestBed.inject(Router).url).toBe('/admin/translations');

      await openMenu();
      document.body.click();
      await settle(fixture);
      expect(menu()).toBeNull();

      await openMenu();
      await expectTabOut(phoneButton, 3);
    });

    it('signed out: Sign in in the menu, after the links - waiting there, the focus on the menu’s button', async () => {
      await draw(360);
      page.person.set(null);
      page.signIn.set(signIn);
      await settle(fixture);
      await openMenu();
      expect(items().map(words)).toEqual(['Surveys', 'Translations', 'Languages', 'Sign in']);
      let finish!: () => void;
      signIn.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
      items().at(-1)!.click();
      await settle(fixture);
      expect(menu()).not.toBeNull();
      expect(words(menu()!.querySelector('.sign-in-item'))).toBe('Saving…');
      expect(document.activeElement).toBe(phoneButton());
      finish();
      await settle(fixture);
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(phoneButton());
    });

    it('a separator only between groups that exist; no menu button when there is nothing to hold', async () => {
      await draw(390);
      page.links.set([]);
      await settle(fixture);
      await openMenu();
      expect(items().map(words)).toEqual(['Your anotoki account', 'Admin panel', 'Sign out']);
      expect(menu()?.querySelectorAll('anotoki-menu-separator').length).toBe(1);
      press(items()[0], 'Escape');
      await settle(fixture);

      page.person.set(null);
      await settle(fixture);
      expect(host.querySelector('.menu-button')).toBeNull();
    });

    it('a badge on the menu button, and the button’s name says it ("Menu: 125 reviews due")', async () => {
      await draw(390);
      page.links.set([{ id: 'kanji', label: 'Kanji', path: '/kanji', badge: 125 }]);
      page.phoneMark.set({ badge: 125, label: 'Menu: 125 reviews due' });
      await settle(fixture);
      expect(words(phoneButton().querySelector('.mark-badge'))).toBe('125');
      expect(phoneButton().querySelector('.mark-badge')?.getAttribute('aria-hidden')).toBe('true');
      expect(phoneButton().getAttribute('aria-label')).toBe('Menu: 125 reviews due');
      await openMenu();
      expect(words(items()[0])).toBe('Kanji 125');
    });

    it('a dot on the menu button, with a description for screen readers ("Not saved yet")', async () => {
      await draw(390);
      page.phoneMark.set({ dot: true, description: 'Not saved yet' });
      await settle(fixture);
      expect(phoneButton().querySelector('.mark-dot')).not.toBeNull();
      const described = phoneButton().getAttribute('aria-describedby')!;
      expect(words(document.getElementById(described))).toBe('Not saved yet');
      expect(phoneButton().getAttribute('aria-label')).toBe('Menu');
    });

    it('is a desktop’s bar from phoneMax + 1: the links and the person in the row again', async () => {
      await draw(761);
      expect(host.querySelector('.menu-button')).toBeNull();
      expect(navLinks().length).toBe(3);
      expect(personButton()).not.toBeNull();
      expect(parts('anotoki-brand .wordmark > span')).toEqual(['anotoki', 'survey']);
    });

    it('closes an open menu when the window crosses phoneMax, either way', async () => {
      await draw(390);
      await openMenu();
      expect(items().length).toBe(6);
      window.resize(761);
      await settle(fixture);
      expect(host.querySelector('.menu-button')).toBeNull();
      expect(menu()).toBeNull();
      expect(personButton().getAttribute('aria-expanded')).toBe('false');

      await openMenu();
      expect(items().length).toBe(3);
      window.resize(760);
      await settle(fixture);
      expect(host.querySelector('.person-button')).toBeNull();
      expect(menu()).toBeNull();
      expect(phoneButton().getAttribute('aria-expanded')).toBe('false');
    });

    it('a site’s own phoneMax', async () => {
      await draw(1000);
      expect(host.querySelector('.menu-button')).toBeNull();
      page.phoneMax.set(1040);
      await settle(fixture);
      expect(host.querySelector('.menu-button')).not.toBeNull();
    });
  });

  describe('only the person’s name gives way above phoneMax', () => {
    it('the name hides below nameMin (phoneMax + 201 by default)', async () => {
      await draw(960);
      expect(host.querySelector('.topbar')?.classList).toContain('is-nameless');
      window.resize(961);
      await settle(fixture);
      expect(host.querySelector('.topbar')?.classList).not.toContain('is-nameless');
      page.nameMin.set(1241);
      await settle(fixture);
      expect(host.querySelector('.topbar')?.classList).toContain('is-nameless');
    });

    it('shortBrandMax: an admin panel’s brand short above phoneMax, its links still in the row (the survey’s 761-960)', async () => {
      await draw(900);
      page.brand.set(ADMIN);
      page.shortBrandMax.set(960);
      await settle(fixture);
      expect(parts('anotoki-brand .wordmark > span')).toEqual(['survey', '·', 'admin panel']);
      expect(navLinks().length).toBe(3);
      window.resize(961);
      await settle(fixture);
      expect(words(host.querySelector('anotoki-brand .wordmark'))).toBe('anotoki survey · admin panel');
    });
  });

  it('in development, says once when its row overflows above phoneMax - a reminder to measure again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let report: (() => void) | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          report = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    await draw();
    const row = host.querySelector<HTMLElement>('.row')!;
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 900 });
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 800 });
    report!();
    report!();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('phoneMax (760 px)');
    warn.mockRestore();
  });
});
