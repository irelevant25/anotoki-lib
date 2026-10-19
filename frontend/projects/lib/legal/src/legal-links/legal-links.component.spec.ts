import { Component, WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ANOTOKI_LIBRARY_WORDS } from '@anotoki/lib/ui/config';
import { LEGAL_LINKS_LIBRARY_WORDS } from '@anotoki/lib/words/legal-links';
import { AnotokiLegalConfig, LEGAL_OPERATOR, legalEmail, legalOperator, legalPaths, provideAnotokiLegal } from '../config';
import { BUILT_IN_LEGAL_LINK_WORDS, legalLinkWords } from '../link-words';
import { LegalLinksComponent } from './legal-links.component';

/** Lets pending promises, timers of 0 and change detection run out. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }
}

@Component({ selector: 'show-page', template: '' })
class PageComponent {}

describe('the legal configuration: the operator, the paths, the address joined in the page', () => {
  it("is the family's operator unless a site names another: Code Hero s.r.o., its site, the support address", () => {
    expect(legalOperator()).toEqual({ name: 'Code Hero s.r.o.', url: 'https://codehero.sk', email: ['support', 'anotoki.eu'], details: [] });
    expect(legalEmail(legalOperator().email)).toBe('support@anotoki.eu');
    expect(legalOperator({ name: 'Another s.r.o.', url: null, email: ' hello@example.test ', details: ['Street 1, Town'] })).toEqual({
      name: 'Another s.r.o.',
      url: null,
      email: ' hello@example.test ',
      details: ['Street 1, Town'],
    });
    expect(legalEmail(' hello@example.test ')).toBe('hello@example.test');
  });

  it('keeps the address in two parts, so no file holds it whole for a harvester to read', () => {
    expect(Array.isArray(LEGAL_OPERATOR.email)).toBe(true);
    expect(JSON.stringify(LEGAL_OPERATOR)).not.toContain('@');
  });

  it("takes the site's paths, the defaults under them", () => {
    expect(legalPaths()).toEqual({ terms: '/terms', privacy: '/privacy', contact: '/contact', about: '/about', support: '/support' });
    expect(legalPaths({ privacy: '/legal/privacy', support: '/help/support' })).toEqual({
      terms: '/terms',
      privacy: '/legal/privacy',
      contact: '/contact',
      about: '/about',
      support: '/help/support',
    });
  });

  it("words the links in the page's language, an owner's rewording over the built-in words", () => {
    expect(legalLinkWords('sk')).toEqual({ lang: 'sk', words: BUILT_IN_LEGAL_LINK_WORDS.sk });
    expect(legalLinkWords('de')).toEqual({ lang: 'en', words: BUILT_IN_LEGAL_LINK_WORDS.en });
    const reworded = legalLinkWords('en', (key) => (key === 'anotoki.legalLinks.terms' ? 'Terms of use' : key));
    expect(reworded.words).toEqual({ label: 'Legal', terms: 'Terms of use', privacy: 'Privacy', contact: 'Contact', about: 'About', support: 'Support' });
    // The Slovak Support link is a verb (0.8.0, the owner's word): "Podporiť", never "Podpora".
    expect([BUILT_IN_LEGAL_LINK_WORDS.sk.about, BUILT_IN_LEGAL_LINK_WORDS.sk.support]).toEqual(['O projekte', 'Podporiť']);
  });
});

describe('<anotoki-legal-links>: About · Support · Terms · Privacy · Contact in a footer', () => {
  let fixture: ComponentFixture<LegalLinksComponent>;
  let host: HTMLElement;
  let language: WritableSignal<string>;

  async function draw(config: Partial<AnotokiLegalConfig> | null = {}, inputs: Record<string, unknown> = {}): Promise<void> {
    language = signal('en');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'terms', component: PageComponent },
          { path: 'legal/privacy', component: PageComponent },
        ]),
        ...(config === null
          ? []
          : [provideAnotokiLegal(() => ({ language: () => language(), facts: () => ({ site: '', about: '', account: { deleteUrl: '' }, data: [], storage: [], processors: [] }), ...config }))]),
      ],
    });
    fixture = TestBed.createComponent(LegalLinksComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle(fixture);
  }

  const links = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('a')).map((link) => [link.textContent?.trim(), link.getAttribute('href')]);

  afterEach(() => {
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it('draws the links to the default paths - About and Support first - in a navigation of their own, and registers their words', async () => {
    await draw();
    expect(links()).toEqual([
      ['About', '/about'],
      ['Support', '/support'],
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
      ['Contact', '/contact'],
    ]);
    const nav = host.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Legal');
    expect(nav?.querySelectorAll('ul > li')).toHaveLength(5);
    expect(host.hasAttribute('lang')).toBe(false);
    expect(TestBed.inject(ANOTOKI_LIBRARY_WORDS)).toContain(LEGAL_LINKS_LIBRARY_WORDS);
  });

  it("goes to the site's paths - the configuration's, and this piece's own over them", async () => {
    await draw({ paths: { privacy: '/legal/privacy', about: '/about-us' } }, { paths: { contact: '/write-to-us', support: '/donate' } });
    expect(links()).toEqual([
      ['About', '/about-us'],
      ['Support', '/donate'],
      ['Terms', '/terms'],
      ['Privacy', '/legal/privacy'],
      ['Contact', '/write-to-us'],
    ]);
  });

  it('marks the page that is open', async () => {
    await draw();
    await TestBed.inject(Router).navigateByUrl('/terms');
    await settle(fixture);
    const terms = host.querySelector('[data-legal-link="terms"]');
    expect(terms?.getAttribute('aria-current')).toBe('page');
    expect(terms?.classList.contains('anotoki-legal-links__link--active')).toBe(true);
    expect(host.querySelector('[data-legal-link="privacy"]')?.hasAttribute('aria-current')).toBe(false);
  });

  it("speaks the page's language, an owner's rewording first, and says when its words are another language's", async () => {
    // The Slovak bundle's rewording, as the translations module's libraryWord() answers it in Slovak alone.
    await draw({ translate: (key) => (language() === 'sk' && key === 'anotoki.legalLinks.privacy' ? 'Osobné údaje' : null) });
    language.set('sk');
    await settle(fixture);
    expect(links().map(([label]) => label)).toEqual(['O projekte', 'Podporiť', 'Podmienky', 'Osobné údaje', 'Kontakt']);
    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('Právne informácie');

    language.set('de');
    await settle(fixture);
    expect(links().map(([label]) => label)).toEqual(['About', 'Support', 'Terms', 'Privacy', 'Contact']);
    expect(host.getAttribute('lang')).toBe('en');
  });

  it("works without the configuration too: the page's own language and the default paths", async () => {
    document.documentElement.lang = 'sk';
    await draw(null);
    expect(links()).toEqual([
      ['O projekte', '/about'],
      ['Podporiť', '/support'],
      ['Podmienky', '/terms'],
      ['Súkromie', '/privacy'],
      ['Kontakt', '/contact'],
    ]);
    document.documentElement.lang = 'en';
  });
});
