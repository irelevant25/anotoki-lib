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

@Component({
  selector: 'anotoki-test-frame',
  imports: [ShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <anotoki-shell [nav]="nav()" [navLabel]="navLabel()" [skipLabel]="skipLabel()">
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
    expect(order).toEqual(['a.skip-link', 'header.their-bar', 'div.frame', 'footer.their-footer']);
    expect(frame.querySelector('main#main')?.getAttribute('tabindex')).toBe('-1');
    expect(frame.querySelector('main #title')).not.toBeNull();
    expect(frame.querySelector('nav')).toBeNull();
    fixture.nativeElement.remove();
  });

  it('the skip link moves the focus to the page by hand - with <base href="/"> a bare #main would leave it', async () => {
    const fixture = await draw();
    const skip = fixture.nativeElement.querySelector('.skip-link') as HTMLAnchorElement;
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
    expect(frame.classList).toContain('has-nav');
    expect(frame.querySelector('nav')?.getAttribute('aria-label')).toBe('Admin panel');
    const links = Array.from(frame.querySelectorAll<HTMLAnchorElement>('nav a'));
    expect(links.map(words)).toEqual(['Overview', 'Users']);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([null, 'page']);
    expect(links[1].classList).toContain('is-active');
    fixture.nativeElement.remove();
  });
});
