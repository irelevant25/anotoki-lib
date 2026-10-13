import { TestBed } from '@angular/core/testing';
import { DrawnPage, drawPage, headingLevels, inOrder, settle, words } from '../testing';
import { TermsPageComponent } from './terms-page.component';

describe("<anotoki-terms-page>: the family's terms around the site's facts", () => {
  let drawn: DrawnPage<TermsPageComponent>;
  const host = () => drawn.host;
  const section = (name: string) => host().querySelector(`[data-section="${name}"]`);

  afterEach(() => {
    drawn?.fixture.destroy();
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
  });

  it("says what the site is in its own words, then who runs it - the family's operator", async () => {
    drawn = await drawPage(TermsPageComponent);
    expect(words(host().querySelector('h1'))).toBe('Terms of use');
    expect(words(host().querySelector('.anotoki-page-header__lead'))).toBe('The rules for using Piano Academy, in plain words.');
    expect(words(section('what')?.querySelector('h2'))).toBe('What Piano Academy is');
    expect(words(section('what')?.querySelector('[data-about]'))).toBe('Piano Academy teaches reading music and playing the piano, a little every day.');
    expect(words(section('what'))).toContain('Piano Academy is one of the anotoki sites, run by Code Hero s.r.o., and costs nothing to use.');
    expect(words(section('warranty'))).toContain('As far as Slovak law allows, Code Hero s.r.o. is not liable');
  });

  it('says the age rule, the account, fair use, Slovak law - every section a heading, in order', async () => {
    drawn = await drawPage(TermsPageComponent);
    expect(words(section('age'))).toContain("Someone under 16 needs a parent's or guardian's permission to make an anotoki account.");
    expect(words(section('account'))).toContain('Signing in to Piano Academy uses an anotoki account: one account for every anotoki site');
    expect(words(section('law'))).toContain('governed by the law of the Slovak Republic');
    expect(inOrder(headingLevels(host()))).toBe(true);
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    expect(Array.from(host().querySelectorAll('[data-section]')).map((each) => each.getAttribute('data-section'))).toEqual([
      'what',
      'account',
      'age',
      'use',
      'send',
      'availability',
      'warranty',
      'law',
      'contact',
    ]);
  });

  it('carries the fan clause only where the site asks for it', async () => {
    drawn = await drawPage(TermsPageComponent);
    expect(host().querySelector('[data-fan]')).toBeNull();
    expect(words(host())).not.toContain('HoYoverse');

    drawn.facts.update((facts) => ({ ...facts, fanDisclaimer: 'hoyoverse' }));
    await settle(drawn.fixture);
    expect(words(host().querySelector('[data-section="fan"] h2'))).toBe('A fan-made project');
    expect(words(host().querySelector('[data-fan]'))).toBe(
      'This site is a fan-made project and is not affiliated with or endorsed by HoYoverse. Genshin Impact and its names, images and content belong to their respective owners.',
    );
  });

  it("links the address to write to - joined in the page - and the site's Contact page", async () => {
    drawn = await drawPage(TermsPageComponent, { config: { paths: { contact: '/write-to-us' } } });
    const email = section('contact')?.querySelector<HTMLAnchorElement>('[data-email] a');
    expect(email?.getAttribute('href')).toBe('mailto:support@anotoki.eu');
    expect(words(email)).toBe('support@anotoki.eu');
    expect(words(section('contact')?.querySelector('[data-email]'))).toBe('Questions about these terms: write to support@anotoki.eu.');
    expect(section('contact')?.querySelector('[data-contact-page]')?.getAttribute('href')).toBe('/write-to-us');
  });

  it("dates the page by the later of the site's day and the library's, written as the language writes days", async () => {
    drawn = await drawPage(TermsPageComponent);
    const updated = host().querySelector('[data-updated]');
    expect(words(updated)).toBe('Last updated: 20 October 2026');
    expect(updated?.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-20');

    drawn.facts.update((facts) => ({ ...facts, updated: { terms: '2026-01-01', privacy: '2027-01-01' } }));
    drawn.language.set('sk');
    await settle(drawn.fixture);
    expect(words(host().querySelector('[data-updated]'))).toBe('Naposledy aktualizované: 13. októbra 2026');
  });

  it('speaks Slovak without addressing anybody, and says the IAM is the account on its own pages', async () => {
    drawn = await drawPage(TermsPageComponent, { language: 'sk', facts: { account: { isIam: true, deleteUrl: '/account/security' }, site: 'anotoki účet' } });
    expect(host().getAttribute('lang')).toBe('sk');
    expect(words(host().querySelector('h1'))).toBe('Podmienky používania');
    expect(words(section('account'))).toContain('Toto je účet anotoki: jeden účet pre všetky stránky anotoki.');
    expect(words(section('age'))).toContain('Osoba mladšia ako 16 rokov potrebuje na založenie účtu anotoki súhlas rodiča alebo zákonného zástupcu.');
  });

  it("lists its sections at the top, each link taking the focus to its section's heading", async () => {
    drawn = await drawPage(TermsPageComponent);
    const toc = host().querySelector('nav');
    expect(words(toc?.querySelector('#' + toc?.getAttribute('aria-labelledby')))).toBe('On this page');
    const links = Array.from(toc?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    expect(links.map((link) => words(link))).toEqual([
      'What Piano Academy is',
      'Your anotoki account',
      'Age',
      'Using the site fairly',
      'Messages and feedback',
      'Availability and changes',
      'No warranty, limited liability',
      'Governing law',
      'Contact',
    ]);

    links[2].click();
    expect(document.activeElement).toBe(section('age')?.querySelector('h2'));
    expect(links[2].getAttribute('href')).toBe('#' + section('age')?.querySelector('h2')?.id);
  });
});
