import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { kitProviders, settle, words } from '../../../ui/src/testing';
import { ShellComponent, ShellNavItem } from './shell.component';

@Component({ selector: 'anotoki-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

const NAV: ShellNavItem[] = [
  { link: '/admin', label: 'Overview', icon: 'sparkle', exact: true },
  { link: '/admin/users', label: 'Users', icon: 'user' },
];

/** What a screen reader hears of an element: its words without what is hidden from it; a space before a comma is not heard. */
function heard(element: Element | null | undefined): string {
  const said = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : node instanceof Element && node.getAttribute('aria-hidden') === 'true' ? '' : Array.from(node.childNodes, said).join('');
  return element ? said(element).replace(/\s+/g, ' ').replace(/ ,/g, ',').trim() : '';
}

@Component({
  selector: 'anotoki-test-frame',
  imports: [ShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <anotoki-shell [nav]="nav()" [navLabel]="navLabel()" [skipLabel]="skipLabel()" [maxWidth]="maxWidth()">
      <header topBar class="their-bar">A site's own header</header>
      <h1 id="title">The page</h1>
      <footer shellFooter class="their-footer">The foot</footer>
    </anotoki-shell>
  `,
})
class FramePageComponent {
  readonly nav = signal<readonly ShellNavItem[]>([]);
  readonly navLabel = signal<string | null>(null);
  readonly skipLabel = signal<string | null>(null);
  readonly maxWidth = signal<string | null>(null);
}

describe('<anotoki-shell>: the frame of a site’s pages', () => {
  let language: ReturnType<typeof signal<string>>;

  async function draw() {
    language = signal('en');
    TestBed.configureTestingModule({ providers: [...kitProviders(() => ({ language })), provideRouter([{ path: '**', component: PageComponent }])] });
    const fixture = TestBed.createComponent(FramePageComponent);
    document.body.appendChild(fixture.nativeElement);
    await settle(fixture);
    return fixture;
  }

  it('a skip link first, then any bar (a site’s own header too), then the page in <main>, then the foot', async () => {
    const fixture = await draw();
    const frame: HTMLElement = fixture.nativeElement.querySelector('anotoki-shell');
    const order = Array.from(frame.children).map((child) => child.tagName.toLowerCase() + (child.classList.length ? '.' + child.classList[0] : ''));
    expect(order).toEqual(['a.anotoki-shell__skip-link', 'header.their-bar', 'div.anotoki-shell__frame', 'footer.their-footer']);
    expect(frame.querySelector('main#main')?.getAttribute('tabindex')).toBe('-1');
    expect(frame.querySelector('main #title')).not.toBeNull();
    expect(frame.querySelector('nav')).toBeNull();
    fixture.nativeElement.remove();
  });

  it('the skip link moves the focus to the page by hand - with <base href="/"> a bare #main would leave it', async () => {
    const fixture = await draw();
    const skip = fixture.nativeElement.querySelector('.anotoki-shell__skip-link') as HTMLAnchorElement;
    expect(words(skip)).toBe('Skip to content');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    skip.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('main');

    language.set('sk');
    await settle(fixture);
    expect(words(skip)).toBe('Preskočiť na obsah');
    fixture.componentInstance.skipLabel.set('Na stránku');
    await settle(fixture);
    expect(words(skip)).toBe('Na stránku');
    fixture.nativeElement.remove();
  });

  it('a side navigation: named, the section marked as the page (aria-current), and the frame wider with the bar lined up', async () => {
    const fixture = await draw();
    fixture.componentInstance.nav.set(NAV);
    fixture.componentInstance.navLabel.set('Admin panel');
    await settle(fixture);
    await TestBed.inject(Router).navigateByUrl('/admin/users');
    await settle(fixture);
    const frame: HTMLElement = fixture.nativeElement.querySelector('anotoki-shell');
    expect(frame.classList).toContain('anotoki-shell--has-nav');
    expect(frame.querySelector('nav')?.getAttribute('aria-label')).toBe('Admin panel');
    const links = Array.from(frame.querySelectorAll<HTMLAnchorElement>('nav a'));
    expect(links.map(words)).toEqual(['Overview', 'Users']);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([null, 'page']);
    expect(links[1].classList).toContain('anotoki-shell__nav-link--active');
    fixture.nativeElement.remove();
  });

  it('a count beside a section (0.8.1): seen alone, heard after its label - "Feedback, 3 new", or the site’s words - and nothing at 0', async () => {
    const fixture = await draw();
    const nav = (feedback: number | string | null): ShellNavItem[] => [
      { link: '/admin', label: 'Overview', icon: 'sparkle', exact: true },
      { link: '/admin/feedback', label: 'Feedback', icon: 'mail', badge: feedback },
      { link: '/admin/reviews', label: 'Reviews', badge: 12, badgeLabel: '12 reviews due' },
      { link: '/admin/errors', label: 'Error log', badge: '0' },
    ];
    fixture.componentInstance.nav.set(nav(3));
    await settle(fixture);
    await TestBed.inject(Router).navigateByUrl('/admin/feedback');
    await settle(fixture);
    const links = () => Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('nav a'));
    const badge = (link: HTMLAnchorElement) => link.querySelector('.anotoki-shell__nav-badge');

    expect(words(badge(links()[1]))).toBe('3');
    expect(badge(links()[1])?.getAttribute('aria-hidden')).toBe('true');
    expect(links().map(heard)).toEqual(['Overview', 'Feedback, 3 new', 'Reviews, 12 reviews due', 'Error log']);
    expect([badge(links()[0]), badge(links()[3])]).toEqual([null, null]);
    expect(links()[1].getAttribute('aria-current')).toBe('page');
    expect(links()[1].querySelector('.anotoki-visually-hidden')?.hasAttribute('lang')).toBe(false);

    // The count moves with the site's own (the unread feedback); nothing new, nothing shown.
    fixture.componentInstance.nav.set(nav('99+'));
    await settle(fixture);
    expect([words(badge(links()[1])), heard(links()[1])]).toEqual(['99+', 'Feedback, 99+ new']);
    for (const none of [0, null, '']) {
      fixture.componentInstance.nav.set(nav(none));
      await settle(fixture);
      expect([badge(links()[1]), heard(links()[1])]).toEqual([null, 'Feedback']);
    }

    // The kit's words in the page's language - and, on a page in a language the kit has none for, its English, said so.
    fixture.componentInstance.nav.set(nav(3));
    language.set('sk');
    await settle(fixture);
    expect(heard(links()[1])).toBe('Feedback, nové: 3');
    language.set('de');
    await settle(fixture);
    expect(heard(links()[1])).toBe('Feedback, 3 new');
    expect(links()[1].querySelector('.anotoki-visually-hidden')?.getAttribute('lang')).toBe('en');
    expect(links()[2].querySelector('.anotoki-visually-hidden')?.hasAttribute('lang')).toBe(false);
    fixture.nativeElement.remove();
  });

  it('as wide as the site says (maxWidth), the bar inside lined up with it; the kit’s widths without it', async () => {
    const fixture = await draw();
    const frame: HTMLElement = fixture.nativeElement.querySelector('anotoki-shell');
    const widths = () => [frame.style.getPropertyValue('--_shell-width'), frame.style.getPropertyValue('--anotoki-topbar-max-width')];
    // Without it the stylesheet's own (84rem, 88rem beside a side navigation) hold: nothing is written on the element.
    expect(widths()).toEqual(['', '']);

    fixture.componentInstance.maxWidth.set('88rem');
    await settle(fixture);
    expect(widths()).toEqual(['88rem', '88rem']);

    fixture.componentInstance.nav.set(NAV);
    fixture.componentInstance.maxWidth.set('96rem');
    await settle(fixture);
    expect(widths()).toEqual(['96rem', '96rem']);

    fixture.componentInstance.maxWidth.set(null);
    await settle(fixture);
    expect(widths()).toEqual(['', '']);
    fixture.nativeElement.remove();
  });
});
