import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { ThemeService, ThemeToggleComponent, provideAnotokiShell } from '@anotoki/lib/shell';
import { tabbable } from '@anotoki/lib/ui/dom';
import { SideNavGroup } from '@anotoki/lib/ui/side-nav';
import { ShellSite, shellSite } from '../../../../shell/src/testing';
import { kitProviders, press, settle, windowOf, words } from '../../../../ui/src/testing';
import { AdminFrameAction, AdminFrameComponent, AdminFrameLink, AdminFramePerson } from './admin-frame.component';

@Component({ selector: 'anotoki-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '<p>A page of the panel</p>' })
class PageComponent {}

/** genshin's admin panel, shorter. */
const GROUPS: SideNavGroup[] = [
  { links: [{ id: 'dashboard', label: 'Dashboard', path: '/admin', exact: true, icon: 'sparkle' }] },
  {
    label: 'Database',
    links: [
      { id: 'characters', label: 'Characters', path: '/admin/characters', icon: 'user' },
      { id: 'weapons', label: 'Weapons', path: '/admin/weapons' },
    ],
  },
  { label: 'System', links: [{ id: 'feedback', label: 'Feedback', path: '/admin/feedback', badge: 3 }] },
];

/** A site's admin layout: the frame, the family's theme switch, the update line above the page, the routed page, the footer. */
@Component({
  selector: 'anotoki-test-panel',
  imports: [AdminFrameComponent, RouterOutlet, ThemeToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <anotoki-admin-frame
      [brand]="{ name: 'Genshin Admin', path: '/admin' }"
      [person]="person()"
      [back]="back()"
      [signOut]="signOut()"
      [groups]="groups"
      [navLabel]="navLabel()"
      [phoneMax]="phoneMax()"
      [skipLabel]="skipLabel()"
    >
      <anotoki-theme-toggle adminFrameTheme />
      <p adminFrameNotice class="their-notice">A database update is waiting.</p>
      <h1 id="title">The page</h1>
      <router-outlet />
      <footer adminFrameFooter class="their-footer">The foot</footer>
    </anotoki-admin-frame>
  `,
})
class PanelComponent {
  readonly groups = GROUPS;
  readonly person = signal<AdminFramePerson | null>({ name: 'Mira Nováková', email: 'mira@example.test' });
  readonly back = signal<AdminFrameLink | null>({ label: 'Back to the site', path: '/' });
  readonly signOut = signal<AdminFrameAction | null>(() => undefined);
  readonly navLabel = signal<string | null>(null);
  readonly phoneMax = signal<number | null>(860);
  readonly skipLabel = signal<string | null>(null);
}

/** A layout that gives no theme switch (a site whose theme is not the shell's yet), and nothing above or under the page. */
@Component({
  selector: 'anotoki-test-bare-panel',
  imports: [AdminFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <anotoki-admin-frame [brand]="{ name: 'Genshin Admin', path: '/admin' }" [groups]="groups">
      <h1>The page</h1>
    </anotoki-admin-frame>
  `,
})
class BarePanelComponent {
  readonly groups = GROUPS;
}

/** What a screen reader hears of an element: its words without what is hidden from it. */
function heard(element: Element | null | undefined): string {
  const said = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : node instanceof Element && node.getAttribute('aria-hidden') === 'true' ? '' : Array.from(node.childNodes, said).join('');
  return element ? said(element).replace(/\s+/g, ' ').trim() : '';
}

/** The parts of the column (or the drawer) in their order, each as it is named. */
function partsOf(root: ParentNode): string[] {
  const parts = root.querySelectorAll(
    'a.anotoki-admin-frame__brand, .anotoki-admin-frame__name, .anotoki-admin-frame__email, a.anotoki-admin-frame__back, button.anotoki-admin-frame__sign-out, [role=radiogroup], nav',
  );
  return Array.from(parts, (part) =>
    part.matches('nav') ? `navigation: ${part.getAttribute('aria-label')}` : part.matches('[role=radiogroup]') ? `theme: ${part.getAttribute('aria-label')}` : heard(part),
  );
}

describe('<anotoki-admin-frame>: genshin’s admin frame, for every admin panel (0.10.0)', () => {
  let site: ShellSite;
  let fixture: ComponentFixture<PanelComponent>;
  let host: HTMLElement;
  let panel: PanelComponent;
  let window: { resize(width: number): void };

  afterEach(() => {
    fixture?.destroy();
    host?.remove();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.style.overflow = '';
  });

  async function setUp(width: number, prepare?: (panel: PanelComponent) => void, url = '/admin'): Promise<void> {
    window = windowOf(width);
    site = shellSite();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        ...kitProviders(() => ({ language: site.language })),
        provideRouter([{ path: '**', component: PageComponent }]),
        // The shell's theme, as a site provides it: the account's, saved to it.
        provideAnotokiShell(() => ({ theme: { storageKey: 'test:theme', account: site.account, save: site.save } })),
      ],
    });
    fixture = TestBed.createComponent(PanelComponent);
    panel = fixture.componentInstance;
    prepare?.(panel);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await TestBed.inject(Router).navigateByUrl(url);
    await settle(fixture);
  }

  const frame = () => host.querySelector<HTMLElement>('anotoki-admin-frame')!;
  const column = () => frame().querySelector<HTMLElement>('header.anotoki-admin-frame__column')!;
  const menu = () => frame().querySelector<HTMLButtonElement>('button.anotoki-admin-frame__menu');
  const dialog = () => host.querySelector<HTMLDialogElement>('dialog');
  const signOutButton = (root: ParentNode = host) => root.querySelector<HTMLButtonElement>('button.anotoki-admin-frame__sign-out');

  describe('on a computer', () => {
    it('the column, top to bottom: the panel’s name linking home, the person, Back, Sign out, the theme, then the pages', async () => {
      await setUp(1280);
      expect(frame().classList).not.toContain('anotoki-admin-frame--phone');
      expect(partsOf(column())).toEqual(['Genshin Admin', 'Mira Nováková', 'mira@example.test', 'Back to the site', 'Sign out', 'theme: Theme', 'navigation: Admin panel']);
      expect(column().querySelector('a.anotoki-admin-frame__brand')?.getAttribute('href')).toBe('/admin');
      // The pages are the kit's side navigation, beside the page - no button of its own, no row, no Menu.
      expect(column().querySelectorAll('nav a').length).toBe(4);
      expect(frame().querySelector('.anotoki-admin-frame__row, .anotoki-side-nav__open')).toBeNull();
      expect(menu()).toBeNull();
    });

    it('landmarks: the column a banner holding the navigation; one <main>, the page; the notice above it and the footer after it, both outside it', async () => {
      await setUp(1280);
      const main = frame().querySelectorAll('main');
      expect(main.length).toBe(1);
      expect(main[0].id).toBe('main');
      expect(main[0].getAttribute('tabindex')).toBe('-1');
      expect(main[0].querySelector('#title')).not.toBeNull();
      expect(main[0].textContent).toContain('A page of the panel');
      expect(column().tagName).toBe('HEADER');
      expect(column().querySelectorAll('nav').length).toBe(1);
      expect(column().contains(main[0])).toBe(false);
      // The page's column: the notice, the page, the footer - in that order, neither of the site's two inside <main>.
      const pageColumn = frame().querySelector('.anotoki-admin-frame__page-column')!;
      expect(Array.from(pageColumn.querySelectorAll('.their-notice, main, .their-footer'), (part) => part.tagName.toLowerCase())).toEqual(['p', 'main', 'footer']);
      expect(main[0].querySelector('.their-notice, .their-footer')).toBeNull();
      expect(column().contains(pageColumn)).toBe(false);
    });

    it('the skip link first: it moves the focus to the page by hand - with <base href="/"> a bare #main would leave it', async () => {
      await setUp(1280);
      const skip = frame().querySelector<HTMLAnchorElement>('a.anotoki-admin-frame__skip')!;
      expect(frame().firstElementChild).toBe(skip);
      expect(tabbable(frame())[0]).toBe(skip);
      expect(words(skip)).toBe('Skip to content');
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      skip.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(document.activeElement?.id).toBe('main');

      panel.skipLabel.set('Skip to the page');
      await settle(fixture);
      expect(words(skip)).toBe('Skip to the page');
    });

    it('the person: a name and an address, either may be missing - the address never said twice; nobody, nothing', async () => {
      await setUp(1280);
      const person = () => frame().querySelector('.anotoki-admin-frame__person');
      expect(heard(person())).toBe('Mira Nováková mira@example.test');
      // The initials beside it are drawn, never heard: the name is written next to them.
      expect(person()?.querySelector('anotoki-avatar [aria-hidden="true"]')).not.toBeNull();

      const shown = async (who: AdminFramePerson | null) => {
        panel.person.set(who);
        await settle(fixture);
        return person() ? heard(person()) : null;
      };
      expect(await shown({ name: 'Mira Nováková' })).toBe('Mira Nováková');
      expect(await shown({ email: 'mira@example.test' })).toBe('mira@example.test');
      expect(await shown({ name: 'mira@example.test', email: 'mira@example.test' })).toBe('mira@example.test');
      expect(await shown({ name: '  ', email: null })).toBeNull();
      expect(await shown(null)).toBeNull();
      expect(partsOf(column())).toEqual(['Genshin Admin', 'Back to the site', 'Sign out', 'theme: Theme', 'navigation: Admin panel']);
    });

    it('Back: a page of the site (the router’s), or an address elsewhere - in the site’s words; none, none drawn', async () => {
      await setUp(1280);
      const back = () => frame().querySelector<HTMLAnchorElement>('a.anotoki-admin-frame__back');
      expect(back()?.getAttribute('href')).toBe('/');
      expect(heard(back())).toBe('Back to the site');
      back()!.click();
      await settle(fixture);
      expect(TestBed.inject(Router).url).toBe('/');

      panel.back.set({ label: 'Back to your account', href: 'https://iam.example.test/account' });
      await settle(fixture);
      expect(back()?.getAttribute('href')).toBe('https://iam.example.test/account');
      expect(heard(back())).toBe('Back to your account');

      panel.back.set(null);
      await settle(fixture);
      expect(back()).toBeNull();
    });

    it('Sign out: the site’s own, on a press; a promise keeps it "Saving…" - aria-busy, aria-disabled, the focus kept on it - and deaf to presses until it settles; none, no button', async () => {
      let finish!: () => void;
      const signOut = vi.fn(() => new Promise<void>((done) => (finish = done)));
      await setUp(1280, (admin) => admin.signOut.set(signOut));
      const button = signOutButton()!;
      expect(heard(button)).toBe('Sign out');
      expect(button.getAttribute('type')).toBe('button');

      button.focus();
      button.click();
      await settle(fixture);
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(heard(button)).toBe('Saving…');
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.disabled).toBe(false);
      expect(document.activeElement).toBe(button);
      button.click();
      await settle(fixture);
      expect(signOut).toHaveBeenCalledTimes(1);

      finish();
      await settle(fixture);
      expect(heard(button)).toBe('Sign out');
      expect(button.hasAttribute('aria-busy')).toBe(false);
      expect(button.hasAttribute('aria-disabled')).toBe(false);

      // One that answers at once, and one that fails: Sign out is ready again (the site says what went wrong).
      const atOnce = vi.fn();
      panel.signOut.set(atOnce);
      await settle(fixture);
      signOutButton()!.click();
      await settle(fixture);
      expect(atOnce).toHaveBeenCalledTimes(1);
      expect(heard(signOutButton())).toBe('Sign out');
      panel.signOut.set(() => Promise.reject(new Error('unreachable')));
      await settle(fixture);
      signOutButton()!.click();
      await settle(fixture);
      expect(heard(signOutButton())).toBe('Sign out');

      panel.signOut.set(null);
      await settle(fixture);
      expect(signOutButton()).toBeNull();
    });

    it('the theme: the family’s switch in its slot - Light, Dark, Automatic - the shell’s ThemeService, so the account’s; the word beside it for the eye alone', async () => {
      await setUp(1280);
      site.save.mockImplementation(async (mode) => site.account.set(mode));
      site.account.set('light');
      await settle(fixture);
      const theme = frame().querySelector('.anotoki-admin-frame__theme')!;
      // The site's switch, in the column's theme row - after Sign out, before the pages.
      expect(theme.querySelector('.anotoki-admin-frame__theme-slot > anotoki-theme-toggle[adminFrameTheme]')).not.toBeNull();
      expect(column().contains(theme)).toBe(true);
      const radios = () => Array.from(theme.querySelectorAll<HTMLButtonElement>('[role=radio]'));
      expect(theme.querySelector('[role=radiogroup]')?.getAttribute('aria-label')).toBe('Theme');
      expect(radios().map((radio) => radio.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'Automatic']);
      expect(radios().map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
      const label = theme.querySelector<HTMLElement>('.anotoki-admin-frame__theme-label')!;
      expect(words(label)).toBe('Theme');
      expect(label.getAttribute('aria-hidden')).toBe('true');
      expect(getComputedStyle(label).display).toBe('flex');

      const service = TestBed.inject(ThemeService);
      for (const [index, mode] of [
        [1, 'dark'],
        [2, 'auto'],
        [0, 'light'],
      ] as const) {
        radios()[index].click();
        await settle(fixture);
        expect(service.mode()).toBe(mode);
        expect(radios()[index].getAttribute('aria-checked')).toBe('true');
      }
      expect(site.save.mock.calls.map(([mode]) => mode)).toEqual(['dark', 'auto', 'light']);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('a layout that gives only the name and the pages: no person, no Back, no Sign out, no theme’s row - the frame as it is otherwise', async () => {
      windowOf(1280);
      TestBed.configureTestingModule({ providers: [...kitProviders(), provideRouter([{ path: '**', component: PageComponent }])] });
      const bare = TestBed.createComponent(BarePanelComponent);
      host = bare.nativeElement;
      document.body.appendChild(host);
      await settle(bare);
      expect(partsOf(column())).toEqual(['Genshin Admin', 'navigation: Admin panel']);
      expect(frame().querySelector('.anotoki-admin-frame__person, .anotoki-admin-frame__action, [adminFrameTheme]')).toBeNull();
      // The theme's row holds no switch: neither its slot nor the word beside it is drawn.
      const slot = frame().querySelector<HTMLElement>('.anotoki-admin-frame__theme-slot')!;
      expect(slot.childElementCount).toBe(0);
      expect(getComputedStyle(slot).display).toBe('none');
      expect(getComputedStyle(frame().querySelector('.anotoki-admin-frame__theme-label')!).display).toBe('none');
      expect(frame().querySelectorAll('main#main h1').length).toBe(1);
      bare.destroy();
    });

    it('the window never scrolls - only the two columns, each its own; the body’s overflow is given back on a phone and as the frame goes', async () => {
      document.body.style.overflow = 'clip';
      await setUp(1280);
      expect(document.body.style.overflow).toBe('hidden');
      window.resize(390);
      await settle(fixture);
      expect(document.body.style.overflow).toBe('clip');
      window.resize(1280);
      await settle(fixture);
      expect(document.body.style.overflow).toBe('hidden');
      fixture.destroy();
      expect(document.body.style.overflow).toBe('clip');
    });

    it('a new page starts at its top: the page’s column scrolled back as the address names another page - not for its query alone', async () => {
      await setUp(1280, undefined, '/admin/characters');
      const pageColumn = frame().querySelector<HTMLElement>('.anotoki-admin-frame__page-column')!;
      pageColumn.scrollTop = 400;
      await TestBed.inject(Router).navigateByUrl('/admin/characters?sort=name');
      await settle(fixture);
      expect(pageColumn.scrollTop).toBe(400);
      await TestBed.inject(Router).navigateByUrl('/admin/weapons');
      await settle(fixture);
      expect(pageColumn.scrollTop).toBe(0);
    });

    it('the navigation’s name is the site’s (the kit’s "Admin panel" by default); the frame’s words are the kit’s, in its language', async () => {
      await setUp(1280, (admin) => admin.navLabel.set('Genshin admin pages'));
      expect(column().querySelector('nav')?.getAttribute('aria-label')).toBe('Genshin admin pages');
      // The kit's words in the kit's language: English in an admin panel - Slovak here, to see they are the kit's.
      site.language.set('sk');
      panel.navLabel.set(null);
      await settle(fixture);
      expect(column().querySelector('nav')?.getAttribute('aria-label')).toBe('Administrátorský panel');
      expect(words(frame().querySelector('.anotoki-admin-frame__skip'))).toBe('Preskočiť na obsah');
      expect(heard(signOutButton())).toBe('Odhlásiť sa');
      expect(words(frame().querySelector('.anotoki-admin-frame__theme-label'))).toBe('Vzhľad');
    });
  });

  describe('on a phone', () => {
    it('a row: the panel’s name linking home and Menu (aria-haspopup="dialog", aria-expanded) - nothing else of the column, nothing of it in the tab order', async () => {
      await setUp(390);
      expect(frame().classList).toContain('anotoki-admin-frame--phone');
      const row = column().querySelector('.anotoki-admin-frame__row')!;
      const brand = row.querySelector<HTMLAnchorElement>('a.anotoki-admin-frame__brand')!;
      expect(words(brand)).toBe('Genshin Admin');
      expect(brand.getAttribute('href')).toBe('/admin');
      expect(heard(menu())).toBe('Menu');
      expect(menu()!.getAttribute('aria-haspopup')).toBe('dialog');
      expect(menu()!.getAttribute('aria-expanded')).toBe('false');
      expect(menu()!.hasAttribute('aria-controls')).toBe(false);
      expect(column().querySelector('nav, .anotoki-admin-frame__account, .anotoki-side-nav__open')).toBeNull();
      expect(tabbable(column())).toEqual([brand, menu()]);
      expect(dialog()).toBeNull();
      // The page, its notice and its footer as on a computer.
      expect(frame().querySelectorAll('main#main').length).toBe(1);
    });

    it('Menu opens the side navigation’s drawer - the panel’s name its heading, then everything the column holds: the person, Back, Sign out, the theme, the pages', async () => {
      await setUp(390);
      menu()!.click();
      await settle(fixture);
      expect(dialog()?.open).toBe(true);
      expect(document.activeElement?.tagName).toBe('H2');
      expect(words(document.activeElement)).toBe('Genshin Admin');
      expect(menu()!.getAttribute('aria-expanded')).toBe('true');
      expect(menu()!.getAttribute('aria-controls')).toBe(dialog()!.querySelector('nav')!.id);
      expect(partsOf(dialog()!)).toEqual(['Mira Nováková', 'mira@example.test', 'Back to the site', 'Sign out', 'theme: Theme', 'navigation: Admin panel']);
      // The theme works there as in the column.
      dialog()!.querySelectorAll<HTMLButtonElement>('[role=radio]')[1].click();
      await settle(fixture);
      expect(TestBed.inject(ThemeService).mode()).toBe('dark');
      expect(dialog()?.open).toBe(true);
    });

    it('a link followed in the drawer - a page, or Back - closes it, the focus back on Menu; so does Escape', async () => {
      await setUp(390);
      menu()!.click();
      await settle(fixture);
      Array.from(dialog()!.querySelectorAll<HTMLAnchorElement>('nav a'))[1].click();
      await settle(fixture);
      expect(TestBed.inject(Router).url).toBe('/admin/characters');
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(menu());
      expect(menu()!.getAttribute('aria-expanded')).toBe('false');

      menu()!.click();
      await settle(fixture);
      dialog()!.querySelector<HTMLAnchorElement>('a.anotoki-admin-frame__back')!.click();
      await settle(fixture);
      expect(TestBed.inject(Router).url).toBe('/');
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(menu());

      menu()!.click();
      await settle(fixture);
      press(dialog()!, 'Escape');
      await settle(fixture);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(menu());
    });

    it('Sign out in the drawer: the site’s own; once it is done, the drawer closes with the focus back on Menu', async () => {
      let finish!: () => void;
      const signOut = vi.fn(() => new Promise<void>((done) => (finish = done)));
      await setUp(390, (admin) => admin.signOut.set(signOut));
      menu()!.click();
      await settle(fixture);
      signOutButton(dialog()!)!.click();
      await settle(fixture);
      expect(signOut).toHaveBeenCalledTimes(1);
      // Waiting, the drawer stays - its button saying so.
      expect(dialog()?.open).toBe(true);
      expect(heard(signOutButton(dialog()!))).toBe('Saving…');
      finish();
      await settle(fixture);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(menu());
    });

    it('a phone’s width left (a turned tablet): the drawer goes, the column is back; phoneMax is the site’s measure, null never a phone', async () => {
      await setUp(390);
      menu()!.click();
      await settle(fixture);
      expect(dialog()?.open).toBe(true);
      window.resize(1280);
      await settle(fixture);
      expect(dialog()).toBeNull();
      expect(menu()).toBeNull();
      expect(partsOf(column())).toEqual(['Genshin Admin', 'Mira Nováková', 'mira@example.test', 'Back to the site', 'Sign out', 'theme: Theme', 'navigation: Admin panel']);

      window.resize(1000);
      await settle(fixture);
      expect(frame().classList).not.toContain('anotoki-admin-frame--phone');
      panel.phoneMax.set(1024);
      await settle(fixture);
      expect(frame().classList).toContain('anotoki-admin-frame--phone');
      expect(menu()).not.toBeNull();
      panel.phoneMax.set(null);
      await settle(fixture);
      expect(frame().classList).not.toContain('anotoki-admin-frame--phone');
      expect(column().querySelector('nav')).not.toBeNull();
    });
  });
});
