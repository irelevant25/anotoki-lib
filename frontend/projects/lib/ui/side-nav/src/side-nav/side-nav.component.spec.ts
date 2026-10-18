import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { tabbable } from '@anotoki/lib/ui/dom';
import { kitProviders, press, settle, windowOf, words } from '../../../src/testing';
import { SideNavGroup } from '../side-nav-item';
import { SideNavTriggerDirective } from '../side-nav-trigger.directive';
import { SideNavComponent } from './side-nav.component';

@Component({ selector: 'anotoki-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

/** genshin's admin panel, as the side navigation's groups. */
const GROUPS: SideNavGroup[] = [
  { links: [{ id: 'dashboard', label: 'Dashboard', path: '/admin', exact: true, icon: 'sparkle' }] },
  {
    label: 'Database',
    links: [
      { id: 'characters', label: 'Characters', path: '/admin/characters', icon: 'user' },
      { id: 'weapons', label: 'Weapons', path: '/admin/weapons' },
    ],
  },
  {
    label: 'Localization',
    collapsible: true,
    links: [
      { id: 'languages', label: 'Languages', path: '/admin/languages' },
      { id: 'guides', label: 'Guides', path: '/admin/guides', badge: 'Beta' },
    ],
  },
  {
    label: 'System',
    collapsed: true,
    links: [
      { id: 'accounts', label: 'Accounts & access', href: 'https://iam.example.test/admin', newTab: true },
      { id: 'feedback', label: 'Feedback', path: '/admin/feedback', badge: 3 },
      { id: 'reviews', label: 'Reviews', path: '/admin/reviews', badge: 12, badgeLabel: '12 reviews due' },
      { id: 'errors', label: 'Error log', path: '/admin/errors', badge: 0, lang: 'en' },
    ],
  },
];

@Component({
  selector: 'anotoki-test-admin',
  imports: [SideNavComponent, SideNavTriggerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (own()) {
      <button id="mine" type="button" [anotokiSideNavTrigger]="nav">Menu</button>
    }
    <anotoki-side-nav
      #nav="anotokiSideNav"
      label="Admin panel"
      [heading]="heading()"
      [buttonLabel]="buttonLabel()"
      [groups]="groups()"
      [phoneMax]="phoneMax()"
      [headingLevel]="level()"
      [current]="current()"
    />
  `,
})
class AdminComponent {
  readonly own = signal(false);
  readonly heading = signal<string | null>(null);
  readonly buttonLabel = signal<string | null>(null);
  readonly groups = signal<readonly SideNavGroup[]>(GROUPS);
  readonly phoneMax = signal<number | null>(860);
  readonly level = signal<2 | 3 | null>(null);
  readonly current = signal<string | null>(null);
}

/** What a screen reader hears of an element: its words without what is hidden from it; a space before a comma is not heard. */
function heard(element: Element | null | undefined): string {
  const said = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : node instanceof Element && node.getAttribute('aria-hidden') === 'true' ? '' : Array.from(node.childNodes, said).join('');
  return element ? said(element).replace(/\s+/g, ' ').replace(/ ,/g, ',').trim() : '';
}

describe('<anotoki-side-nav>: links in groups beside the page, in the kit’s drawer on a phone (0.6.0)', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let host: HTMLElement;
  let page: AdminComponent;
  let window: { resize(width: number): void };
  let language: ReturnType<typeof signal<string>>;

  afterEach(() => {
    host?.remove();
    vi.unstubAllGlobals();
  });

  async function setUp(width: number, url = '/admin', prepare?: (page: AdminComponent) => void): Promise<void> {
    window = windowOf(width);
    language = signal('en');
    TestBed.configureTestingModule({ providers: [...kitProviders(() => ({ language })), provideRouter([{ path: '**', component: PageComponent }])] });
    fixture = TestBed.createComponent(AdminComponent);
    page = fixture.componentInstance;
    prepare?.(page);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await TestBed.inject(Router).navigateByUrl(url);
    await settle(fixture);
  }

  const go = async (url: string) => {
    await TestBed.inject(Router).navigateByUrl(url);
    await settle(fixture);
  };
  const side = () => host.querySelector<HTMLElement>('anotoki-side-nav')!;
  const nav = () => host.querySelector<HTMLElement>('nav');
  const links = (root: ParentNode | null = nav()) => Array.from(root?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
  const label = (link: Element) => words(link.querySelector('.anotoki-side-nav__label'));
  /** The links' words, the page's marked "[page]". */
  const marked = () => links().map((link) => `${label(link)}${link.getAttribute('aria-current') === 'page' ? ' [page]' : ''}`);
  const ownButton = () => host.querySelector<HTMLButtonElement>('.anotoki-side-nav__open');
  const dialog = () => host.querySelector<HTMLDialogElement>('dialog');

  describe('beside the page', () => {
    it('a named nav: each group’s heading names its list, a group without one is links alone; icons drawn, never heard', async () => {
      await setUp(1280);
      expect(nav()?.getAttribute('aria-label')).toBe('Admin panel');
      expect(ownButton()).toBeNull();
      const lists = Array.from(nav()!.querySelectorAll('ul'));
      expect(lists.map((list) => (list.getAttribute('aria-labelledby') ? words(document.getElementById(list.getAttribute('aria-labelledby')!)) : null))).toEqual([
        null,
        'Database',
        'Localization',
        'System',
      ]);
      expect(nav()!.querySelector('[role=heading]')).toBeNull();
      expect(links().map((link) => link.getAttribute('href'))).toEqual([
        '/admin',
        '/admin/characters',
        '/admin/weapons',
        '/admin/languages',
        '/admin/guides',
        'https://iam.example.test/admin',
        '/admin/feedback',
        '/admin/reviews',
        '/admin/errors',
      ]);
      const icon = links()[1].querySelector('anotoki-icon svg');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(links()[2].querySelector('anotoki-icon')).toBeNull();
    });

    it('the page’s link is aria-current="page" - the router’s, the area’s home on its own address alone - or the one `current` names', async () => {
      await setUp(1280, '/admin');
      expect(marked().filter((link) => link.endsWith('[page]'))).toEqual(['Dashboard [page]']);
      await go('/admin/characters/12');
      expect(marked().filter((link) => link.endsWith('[page]'))).toEqual(['Characters [page]']);
      page.current.set('weapons');
      await settle(fixture);
      expect(marked().filter((link) => link.endsWith('[page]'))).toEqual(['Weapons [page]']);
      page.current.set(null);
      await go('/elsewhere');
      expect(marked().filter((link) => link.endsWith('[page]'))).toEqual([]);
    });

    it('a badge is seen alone and heard after the label - a number as the top bar says it ("3 new"), the site’s words, a word as it is; a 0 is nothing new', async () => {
      await setUp(1280, '/admin/feedback');
      const [guides, , feedback, reviews, errors] = links().slice(4);
      expect(words(feedback.querySelector('.anotoki-side-nav__badge'))).toBe('3');
      expect(feedback.querySelector('.anotoki-side-nav__badge')?.getAttribute('aria-hidden')).toBe('true');
      expect(heard(feedback)).toBe('Feedback, 3 new');
      expect(heard(reviews)).toBe('Reviews, 12 reviews due');
      expect(heard(guides)).toBe('Guides, Beta');
      expect(errors.querySelector('.anotoki-side-nav__badge')).toBeNull();
      expect(heard(errors)).toBe('Error log');

      language.set('sk');
      await settle(fixture);
      expect(heard(links()[6])).toBe('Feedback, nové: 3');
      // Inside a link marked as English (an admin panel's words), the Slovak count says it is Slovak.
      page.groups.set([{ links: [{ label: 'Feedback', path: '/admin/feedback', badge: 3, lang: 'en' }] }]);
      await settle(fixture);
      const counted = links()[0].querySelector('.anotoki-visually-hidden');
      expect(links()[0].getAttribute('lang')).toBe('en');
      expect(counted?.getAttribute('lang')).toBe('sk');
    });

    it('a page elsewhere: a plain link that opens a new tab, its icon saying so; never the page’s', async () => {
      await setUp(1280, '/admin');
      const accounts = links()[5];
      expect(accounts.getAttribute('target')).toBe('_blank');
      expect(accounts.getAttribute('rel')).toBe('noopener');
      expect(accounts.querySelector('.anotoki-side-nav__external svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(accounts.hasAttribute('aria-current')).toBe(false);
      expect(heard(accounts)).toBe('Accounts & access');
    });

    it('`headingLevel`: the groups’ headings join the page’s outline', async () => {
      await setUp(1280, '/admin', (admin) => admin.level.set(3));
      const heads = Array.from(nav()!.querySelectorAll('[role=heading]'));
      expect(heads.map((head) => `${head.getAttribute('aria-level')} ${words(head)}`)).toEqual(['3 Database', '3 Localization', '3 System']);
    });

    it('a collapsible group: its heading a button (aria-expanded, aria-controls); closed, its links leave the tab order; a closed one opens by itself while it holds the page’s link', async () => {
      await setUp(1280, '/admin');
      const toggles = () => Array.from(nav()!.querySelectorAll<HTMLButtonElement>('.anotoki-side-nav__toggle'));
      expect(toggles().map(words)).toEqual(['Localization', 'System']);
      expect(toggles().map((toggle) => toggle.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
      const system = document.getElementById(toggles()[1].getAttribute('aria-controls')!)!;
      expect(system.tagName).toBe('UL');
      expect(system.hidden).toBe(true);
      const stops = () => tabbable(side()).map((element) => (element.matches('a') ? label(element) : words(element)));
      expect(stops()).toEqual(['Dashboard', 'Characters', 'Weapons', 'Localization', 'Languages', 'Guides', 'System']);

      toggles()[0].click();
      await settle(fixture);
      expect(toggles()[0].getAttribute('aria-expanded')).toBe('false');
      expect(document.getElementById(toggles()[0].getAttribute('aria-controls')!)?.hidden).toBe(true);
      expect(stops()).toEqual(['Dashboard', 'Characters', 'Weapons', 'Localization', 'System']);

      // The page is in System: it opens by itself, the page's link marked.
      await go('/admin/reviews');
      expect(toggles()[1].getAttribute('aria-expanded')).toBe('true');
      expect(system.hidden).toBe(false);
      expect(marked().filter((link) => link.endsWith('[page]'))).toEqual(['Reviews [page]']);
      // ... and closes again when asked, the page still in it - and stays closed while the site makes its groups again
      // (a count beside a link moved: new objects, the same links).
      toggles()[1].click();
      await settle(fixture);
      expect(toggles()[1].getAttribute('aria-expanded')).toBe('false');
      page.groups.set(GROUPS.map((group) => ({ ...group, links: group.links.map((link) => (link.id === 'feedback' ? { ...link, badge: 4 } : { ...link })) })));
      await settle(fixture);
      expect(toggles()[1].getAttribute('aria-expanded')).toBe('false');
      expect(marked().filter((link) => link.endsWith('[page]'))).toEqual(['Reviews [page]']);
      expect(heard(links()[6])).toBe('Feedback, 4 new');
    });
  });

  describe('on a phone', () => {
    it('in its place its own button alone - aria-expanded, aria-haspopup="dialog" - and nothing else of it in the tab order', async () => {
      await setUp(390);
      expect(side().classList).toContain('anotoki-side-nav--phone');
      expect(nav()).toBeNull();
      const button = ownButton()!;
      expect(words(button)).toBe('Admin panel');
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(button.hasAttribute('aria-controls')).toBe(false);
      expect(tabbable(side())).toEqual([button]);
      expect(dialog()).toBeNull();
    });

    it('the button opens the drawer, the focus in; a link followed in it closes it and gives the focus back to the button', async () => {
      await setUp(390, '/admin');
      // Not focused first, as Safari leaves a clicked button: the focus still comes back to it.
      ownButton()!.click();
      await settle(fixture);
      expect(dialog()?.open).toBe(true);
      expect(document.activeElement?.tagName).toBe('H2');
      expect(words(document.activeElement)).toBe('Admin panel');
      const button = ownButton()!;
      expect(button.getAttribute('aria-expanded')).toBe('true');
      const inDrawer = dialog()!.querySelector('nav')!;
      expect(button.getAttribute('aria-controls')).toBe(inDrawer.id);
      expect(inDrawer.getAttribute('aria-label')).toBe('Admin panel');
      expect(marked().filter((link) => link.endsWith('[page]'))).toEqual(['Dashboard [page]']);

      links(inDrawer)[1].click();
      await settle(fixture);
      expect(TestBed.inject(Router).url).toBe('/admin/characters');
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(ownButton());
      expect(ownButton()!.getAttribute('aria-expanded')).toBe('false');
      expect(ownButton()!.hasAttribute('aria-controls')).toBe(false);
    });

    it('Escape, the backdrop and the drawer’s Close each close it, the focus back on the button', async () => {
      await setUp(390, '/admin');
      ownButton()!.click();
      await settle(fixture);
      press(dialog()!, 'Escape');
      await settle(fixture);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(ownButton());

      ownButton()!.click();
      await settle(fixture);
      const backdrop = dialog()!;
      backdrop.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle(fixture);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(ownButton());

      ownButton()!.click();
      await settle(fixture);
      dialog()!.querySelector<HTMLButtonElement>('.anotoki-drawer__close')!.click();
      await settle(fixture);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(ownButton());
    });

    it('a link opened elsewhere - a new tab from a modified click - leaves the drawer open', async () => {
      await setUp(390, '/admin');
      ownButton()!.click();
      await settle(fixture);
      // (The browser's new tab is not jsdom's to open: the click's own default is kept from it.)
      dialog()!.addEventListener('click', (event) => event.preventDefault());
      links(dialog())[2].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      await settle(fixture);
      expect(dialog()?.open).toBe(true);
    });

    it('the site’s own button ([anotokiSideNavTrigger]): the navigation draws none; it says what it opens, opens it, and has the focus back', async () => {
      await setUp(390, '/admin', (admin) => admin.own.set(true));
      expect(ownButton()).toBeNull();
      const mine = host.querySelector<HTMLButtonElement>('#mine')!;
      expect(mine.getAttribute('aria-haspopup')).toBe('dialog');
      expect(mine.getAttribute('aria-expanded')).toBe('false');
      expect(mine.hasAttribute('aria-controls')).toBe(false);
      mine.click();
      await settle(fixture);
      expect(dialog()?.open).toBe(true);
      expect(mine.getAttribute('aria-expanded')).toBe('true');
      expect(mine.getAttribute('aria-controls')).toBe(dialog()!.querySelector('nav')!.id);
      press(dialog()!, 'Escape');
      await settle(fixture);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(mine);

      // Gone again: the navigation's own button is back.
      page.own.set(false);
      await settle(fixture);
      expect(ownButton()).not.toBeNull();
    });

    it('`buttonLabel` and `heading` word the button and the drawer', async () => {
      await setUp(390, '/admin', (admin) => {
        admin.buttonLabel.set('Menu');
        admin.heading.set('Genshin Admin');
      });
      expect(words(ownButton())).toBe('Menu');
      ownButton()!.click();
      await settle(fixture);
      expect(words(dialog()!.querySelector('h2'))).toBe('Genshin Admin');
      expect(dialog()!.querySelector('nav')?.getAttribute('aria-label')).toBe('Admin panel');
    });

    it('a phone’s width left (a turned tablet) closes the drawer and puts the column back; phoneMax null is never a phone', async () => {
      await setUp(390, '/admin');
      ownButton()!.click();
      await settle(fixture);
      expect(dialog()?.open).toBe(true);
      window.resize(1280);
      await settle(fixture);
      expect(dialog()).toBeNull();
      expect(ownButton()).toBeNull();
      expect(nav()?.id).not.toBe('');
      expect(side().classList).not.toContain('anotoki-side-nav--phone');
      window.resize(390);
      await settle(fixture);
      expect(ownButton()?.getAttribute('aria-expanded')).toBe('false');

      page.phoneMax.set(null);
      await settle(fixture);
      expect(ownButton()).toBeNull();
      expect(nav()).not.toBeNull();
    });
  });
});

/** genshin's admin panel itself: the navigation in the area's own page, its paths relative to it ("dashboard"). */
@Component({
  selector: 'anotoki-test-area',
  imports: [RouterOutlet, SideNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<anotoki-side-nav label="Admin panel" [groups]="groups" [phoneMax]="null" /><router-outlet />`,
})
class AreaComponent {
  readonly groups: SideNavGroup[] = [
    { links: [{ id: 'dashboard', label: 'Dashboard', path: 'dashboard' }] },
    { label: 'Database', links: [{ id: 'characters', label: 'Characters', path: 'characters' }] },
  ];
}

describe('<anotoki-side-nav>: paths relative to the page that draws it (0.6.0)', () => {
  it('reads each path as routerLink does, and marks the page’s link', async () => {
    TestBed.configureTestingModule({
      providers: [
        ...kitProviders(),
        provideRouter([
          {
            path: 'admin',
            component: AreaComponent,
            children: [
              { path: 'dashboard', component: PageComponent },
              { path: 'characters', component: PageComponent },
              { path: 'characters/:id', component: PageComponent },
            ],
          },
          { path: '**', component: PageComponent },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/characters/7', AreaComponent);
    await settle(harness.fixture);
    const area = harness.routeNativeElement as HTMLElement;
    const links = Array.from(area.querySelectorAll<HTMLAnchorElement>('nav a'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/admin/dashboard', '/admin/characters']);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([null, 'page']);
    await harness.navigateByUrl('/admin/dashboard');
    await settle(harness.fixture);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual(['page', null]);
  });
});
