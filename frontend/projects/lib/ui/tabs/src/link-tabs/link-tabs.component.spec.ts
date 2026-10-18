import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { kitProviders, settle, words } from '../../../src/testing';
import { LinkTabItem } from '../tab-item';
import { FakeRow, fakeRow } from '../testing';
import { LinkTabsComponent } from './link-tabs.component';

@Component({ selector: 'anotoki-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

/** Japanese Academy's Kanji, as its section's tabs. */
const KANJI: LinkTabItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/kanji' },
  { id: 'lessons', label: 'Lessons', path: '/kanji/lessons', icon: 'sparkle' },
  { id: 'reviews', label: 'Reviews', path: '/kanji/reviews', badge: 125, badgeLabel: '125 due' },
  { id: 'practice', label: 'Practice', path: ['/kanji', 'practice'] },
  { id: 'browse', label: 'Browse', path: '/kanji/browse', exact: true, lang: 'en' },
];

@Component({
  selector: 'anotoki-test-kanji',
  imports: [LinkTabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<anotoki-link-tabs label="Kanji" [links]="links()" [current]="current()" />`,
})
class KanjiComponent {
  readonly links = signal<readonly LinkTabItem[]>(KANJI);
  readonly current = signal<string | null>(null);
}

/** What a screen reader hears of an element: its words without what is hidden from it; a space before a comma is not heard. */
function heard(element: Element | null | undefined): string {
  const said = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : node instanceof Element && node.getAttribute('aria-hidden') === 'true' ? '' : Array.from(node.childNodes, said).join('');
  return element ? said(element).replace(/\s+/g, ' ').replace(/ ,/g, ',').trim() : '';
}

describe('<anotoki-link-tabs>: a section’s pages drawn as tabs, each a link of its own (0.6.0)', () => {
  let row: FakeRow | null = null;

  afterEach(() => {
    row?.stop();
    row = null;
  });

  async function setUp(url = '/kanji') {
    TestBed.configureTestingModule({ providers: [...kitProviders(), provideRouter([{ path: '**', component: PageComponent }])] });
    const fixture = TestBed.createComponent(KanjiComponent);
    document.body.appendChild(fixture.nativeElement);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await settle(fixture);
    const host: HTMLElement = fixture.nativeElement;
    const links = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('nav a'));
    /** The links' words, the page's marked "[page]". */
    const marked = () => links().map((link) => `${words(link.querySelector('.anotoki-link-tabs__label'))}${link.getAttribute('aria-current') === 'page' ? ' [page]' : ''}`);
    const go = async (to: string) => {
      await router.navigateByUrl(to);
      await settle(fixture);
    };
    return { fixture, host, router, links, marked, go };
  }

  it('a named nav of ordinary links - each its own Tab stop, each an address of its own; never the tabs pattern', async () => {
    const { host, links } = await setUp();
    const nav = host.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Kanji');
    expect(links().map((link) => link.getAttribute('href'))).toEqual(['/kanji', '/kanji/lessons', '/kanji/reviews', '/kanji/practice', '/kanji/browse']);
    expect(links().map((link) => link.tabIndex)).toEqual([0, 0, 0, 0, 0]);
    expect(links().some((link) => link.hasAttribute('role') || link.hasAttribute('aria-selected') || link.hasAttribute('tabindex'))).toBe(false);
    expect(host.querySelector('[role=tablist], [role=tab]')).toBeNull();
    // The arrows of the strip, were they there, stand inside the nav but out of the links' way.
    expect(links()[0].closest('.anotoki-tab-strip__scroller')).not.toBeNull();
    host.remove();
  });

  it('the page’s link is aria-current="page" - the router’s: the most specific of those the address is at or under', async () => {
    const { host, marked, go } = await setUp('/kanji');
    expect(marked()).toEqual(['Dashboard [page]', 'Lessons', 'Reviews', 'Practice', 'Browse']);
    // The section's home and its page both match: the page.
    await go('/kanji/lessons');
    expect(marked()).toEqual(['Dashboard', 'Lessons [page]', 'Reviews', 'Practice', 'Browse']);
    await go('/kanji/lessons/42?from=dashboard');
    expect(marked()).toEqual(['Dashboard', 'Lessons [page]', 'Reviews', 'Practice', 'Browse']);
    await go('/kanji/practice');
    expect(marked()).toEqual(['Dashboard', 'Lessons', 'Reviews', 'Practice [page]', 'Browse']);
    // Browse is the page's on its own address alone (exact): under it, the section's home is.
    await go('/kanji/browse');
    expect(marked()).toEqual(['Dashboard', 'Lessons', 'Reviews', 'Practice', 'Browse [page]']);
    await go('/kanji/browse?sort=new');
    expect(marked()).toEqual(['Dashboard', 'Lessons', 'Reviews', 'Practice', 'Browse [page]']);
    await go('/kanji/browse/7');
    expect(marked()).toEqual(['Dashboard [page]', 'Lessons', 'Reviews', 'Practice', 'Browse']);
    await go('/exam');
    expect(marked()).toEqual(['Dashboard', 'Lessons', 'Reviews', 'Practice', 'Browse']);
    host.remove();
  });

  it('`current` names the page’s link whatever the address says (a session drawn over the dashboard); null gives it back to the router', async () => {
    const { fixture, host, marked } = await setUp('/kanji');
    fixture.componentInstance.current.set('reviews');
    await settle(fixture);
    expect(marked()).toEqual(['Dashboard', 'Lessons', 'Reviews [page]', 'Practice', 'Browse']);
    fixture.componentInstance.current.set('nothing-of-these');
    await settle(fixture);
    expect(marked()).toEqual(['Dashboard', 'Lessons', 'Reviews', 'Practice', 'Browse']);
    fixture.componentInstance.current.set(null);
    await settle(fixture);
    expect(marked()).toEqual(['Dashboard [page]', 'Lessons', 'Reviews', 'Practice', 'Browse']);
    host.remove();
  });

  it('a click follows the link, as routerLink does: the page’s link moves with the address', async () => {
    const { fixture, host, router, links, marked } = await setUp('/kanji');
    links()[2].click();
    await settle(fixture);
    expect(router.url).toBe('/kanji/reviews');
    expect(marked()).toEqual(['Dashboard', 'Lessons', 'Reviews [page]', 'Practice', 'Browse']);
    host.remove();
  });

  it('an icon and the kit’s badge as the tabs’: the badge seen, heard after the label ("Reviews, 125 due"); a label of another language says so', async () => {
    const { host, links } = await setUp('/kanji');
    expect(links()[1].firstElementChild?.tagName.toLowerCase()).toBe('anotoki-icon');
    const badge = links()[2].querySelector('anotoki-badge')!;
    expect(words(badge)).toBe('125');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(links().map(heard)).toEqual(['Dashboard', 'Lessons', 'Reviews, 125 due', 'Practice', 'Browse']);
    expect(links()[4].querySelector('.anotoki-link-tabs__label')?.getAttribute('lang')).toBe('en');
    host.remove();
  });

  it('a row that does not fit scrolls in the kit’s strip, the page’s link brought into view as the address changes', async () => {
    row = fakeRow({ width: 300, tab: 150 });
    const { host, go } = await setUp('/kanji');
    const strip = host.querySelector('anotoki-tab-strip')!;
    const scroller = host.querySelector('.anotoki-tab-strip__scroller')!;
    expect(strip.classList).toContain('anotoki-tab-strip--forward');
    expect(row.left(scroller)).toBe(0);
    const titles = () => Array.from(host.querySelectorAll<HTMLElement>('.anotoki-tab-strip__more')).map((arrow) => arrow.title);
    // Reviews, the third (300-450 px): its end 44 px clear of the view's.
    await go('/kanji/reviews');
    expect(row.moves.at(-1)).toEqual({ left: 194, behavior: 'smooth' });
    expect(row.left(scroller)).toBe(194);
    expect(strip.classList).toContain('anotoki-tab-strip--back');
    expect(strip.classList).toContain('anotoki-tab-strip--forward');
    expect(titles()).toEqual(['Earlier tabs', 'More tabs']);
    // Browse, the last (600-750 px): to the row's end, and no further.
    await go('/kanji/browse');
    expect(row.moves.at(-1)).toEqual({ left: 256, behavior: 'smooth' });
    expect(row.left(scroller)).toBe(450);
    expect(strip.classList).not.toContain('anotoki-tab-strip--forward');
    expect(titles()).toEqual(['Earlier tabs']);
    host.remove();
  });
});
