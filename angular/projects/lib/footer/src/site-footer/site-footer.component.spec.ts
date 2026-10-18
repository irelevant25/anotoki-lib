import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnotokiFeedback } from '@anotoki/lib/feedback';
import { provideAnotokiLegal } from '@anotoki/lib/legal';
import { FOOTER_LIBRARY_WORDS } from '@anotoki/lib/words/footer';
import { kitProviders, press, settle, words } from '../../../ui/src/testing';
import { SiteFooterComponent, SiteFooterFan } from './site-footer.component';

/** A site's frame, its footer bound as a site binds it. */
@Component({
  selector: 'anotoki-test-footer-page',
  imports: [SiteFooterComponent],
  template: `<anotoki-site-footer [version]="version()" [whatsNew]="whatsNew()" (whatsNew)="opened = opened + 1" [feedback]="feedback()" [fan]="fan()" />`,
})
class FooterPageComponent {
  readonly version = signal<string | null>('0.3');
  readonly whatsNew = signal(true);
  readonly feedback = signal(true);
  readonly fan = signal<SiteFooterFan | null>(null);
  opened = 0;
}

/** The same with the bare attributes the README writes. */
@Component({
  selector: 'anotoki-test-footer-attributes',
  imports: [SiteFooterComponent],
  template: `<anotoki-site-footer version="1.2.0" whatsNew (whatsNew)="opened = opened + 1" feedback fan="hoyoverse" />`,
})
class FooterAttributesComponent {
  opened = 0;
}

describe("<anotoki-site-footer>: the family's footer - the build analyzer's", () => {
  let fixture: ComponentFixture<unknown>;

  async function setUp<T>(page: Type<T>, options: { language?: string; lookup?: (key: string) => string | null } = {}) {
    const language = signal(options.language ?? 'en');
    TestBed.configureTestingModule({
      providers: kitProviders(
        () => ({ language: () => language(), lookup: options.lookup }),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAnotokiLegal(() => ({
          language: () => language(),
          facts: () => {
            throw new Error('The footer reads none of the facts: the legal pages alone do.');
          },
        })),
        provideAnotokiFeedback(() => ({ language: () => language() })),
      ),
    });
    const drawn = TestBed.createComponent(page);
    fixture = drawn;
    const host = drawn.nativeElement as HTMLElement;
    document.body.appendChild(host);
    await settle(drawn);
    return { fixture: drawn, host, page: drawn.componentInstance, language };
  }

  /** The row as it is read: each part's words, the dots between them. */
  const row = (host: HTMLElement) => Array.from(host.querySelectorAll('.anotoki-site-footer__row > *')).map((part) => words(part));
  /** Terms · Privacy · Contact as they are drawn: [the words, where each goes]. */
  const legalLinks = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLAnchorElement>('anotoki-legal-links a')).map((link) => [words(link), link.getAttribute('href')]);

  /** Presses Send feedback and waits for the form - its code comes with the first press - and for the page to be drawn. */
  async function openFeedback(host: HTMLElement): Promise<Element> {
    const button = host.querySelector<HTMLButtonElement>('[data-open-feedback]')!;
    button.focus();
    button.click();
    for (let i = 0; i < 20 && !host.querySelector('[data-feedback-dialog] anotoki-feedback-form'); i++) {
      await settle(fixture);
    }
    // Made at once when its code is here already: drawn with the next render, as before anybody can press in it.
    await settle(fixture);
    return host.querySelector('[data-feedback-dialog]')!;
  }

  afterEach(() => {
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it("draws the row - Version · What's new · Send feedback - then Terms · Privacy · Contact, in a footer of its own", async () => {
    const { host } = await setUp(FooterPageComponent);
    const footer = host.querySelector('anotoki-site-footer > footer.anotoki-site-footer__footer')!;
    expect(footer).not.toBeNull();
    expect(host.querySelector('anotoki-site-footer')?.classList).toContain('anotoki-site-footer');
    expect(row(host)).toEqual(['Version 0.3', '·', "What's new", '·', 'Send feedback']);
    // The version's figures are of one width (tabular, the footer's styles); the dots are drawn, never read.
    expect(host.querySelector('.anotoki-site-footer__row > .anotoki-site-footer__version')).not.toBeNull();
    const dots = Array.from(host.querySelectorAll('.anotoki-site-footer__dot'));
    expect(dots).toHaveLength(2);
    expect(dots.every((dot) => dot.getAttribute('aria-hidden') === 'true')).toBe(true);
    // The kit's small link buttons, each naming the dialog it opens.
    for (const button of Array.from(host.querySelectorAll<HTMLButtonElement>('.anotoki-site-footer__row button'))) {
      expect(button.classList).toContain('anotoki-button--link');
      expect(button.classList).toContain('anotoki-button--sm');
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      expect(button.getAttribute('type')).toBe('button');
    }
    // Under the row, never in it: the family's legal links, to the paths of the site's legal configuration.
    expect(footer.children[0].classList).toContain('anotoki-site-footer__row');
    expect(footer.children[1].tagName.toLowerCase()).toBe('anotoki-legal-links');
    expect(host.querySelector('.anotoki-site-footer__row anotoki-legal-links')).toBeNull();
    expect(legalLinks(host)).toEqual([
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
      ['Contact', '/contact'],
    ]);
    expect(host.querySelector('[data-fan]')).toBeNull();
    expect(host.querySelector('[lang]')).toBeNull();
  });

  it('leaves no stray dot: a part that is off takes its dot with it, and with none the row is not drawn', async () => {
    const { fixture, host, page } = await setUp(FooterPageComponent);

    page.version.set(null);
    await settle(fixture);
    expect(row(host)).toEqual(["What's new", '·', 'Send feedback']);

    page.feedback.set(false);
    await settle(fixture);
    expect(row(host)).toEqual(["What's new"]);

    page.version.set('1.2.0');
    await settle(fixture);
    expect(row(host)).toEqual(['Version 1.2.0', '·', "What's new"]);

    page.whatsNew.set(false);
    page.feedback.set(true);
    await settle(fixture);
    expect(row(host)).toEqual(['Version 1.2.0', '·', 'Send feedback']);

    page.feedback.set(false);
    await settle(fixture);
    expect(row(host)).toEqual(['Version 1.2.0']);
    expect(host.querySelector('.anotoki-site-footer__dot')).toBeNull();

    // A version of blanks is none: no "Version", and no row at all with nothing else in it - the legal links stay.
    page.version.set('  ');
    await settle(fixture);
    expect(host.querySelector('.anotoki-site-footer__row')).toBeNull();
    expect(host.querySelector('.anotoki-site-footer__footer')?.firstElementChild?.tagName.toLowerCase()).toBe('anotoki-legal-links');
    expect(legalLinks(host)).toHaveLength(3);
  });

  it("tells the site What's new was pressed - the site opens its own", async () => {
    const { fixture, host, page } = await setUp(FooterPageComponent);
    host.querySelector<HTMLButtonElement>('[data-whats-new]')!.click();
    await settle(fixture);
    expect(page.opened).toBe(1);
    expect(host.querySelector('[data-feedback-dialog]')).toBeNull();
  });

  it('takes the bare attributes too: whatsNew, feedback, fan="hoyoverse"', async () => {
    const { fixture, host, page } = await setUp(FooterAttributesComponent);
    expect(row(host)).toEqual(['Version 1.2.0', '·', "What's new", '·', 'Send feedback']);
    expect(words(host.querySelector('[data-fan]'))).toBe('This site is a fan-made project and is not affiliated with or endorsed by HoYoverse.');
    host.querySelector<HTMLButtonElement>('[data-whats-new]')!.click();
    await settle(fixture);
    expect(page.opened).toBe(1);
  });

  it("opens the library's feedback form in the kit's dialog - its code fetched with the press - and gives the focus back to the button", async () => {
    const { fixture, host } = await setUp(FooterPageComponent);
    expect(host.querySelector('anotoki-feedback-form')).toBeNull();

    let dialog = await openFeedback(host);
    // Named by the button's words; the form draws no heading of its own, and has its Cancel.
    expect(words(dialog.querySelector('.anotoki-dialog__title'))).toBe('Send feedback');
    expect(dialog.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('anotoki-feedback-form')).not.toBeNull();
    expect(dialog.querySelector('anotoki-feedback-form h2, anotoki-feedback-form h3')).toBeNull();
    expect(dialog.hasAttribute('lang')).toBe(false);
    // Outside the footer's own <footer>: the dialog is drawn over the page, not in the footer's landmark.
    expect(host.querySelector('footer [data-feedback-dialog]')).toBeNull();

    // The form's Cancel closes it: the focus is back on the button.
    dialog.querySelector<HTMLButtonElement>('anotoki-feedback-form [data-cancel]')!.click();
    await settle(fixture);
    expect(host.querySelector('[data-feedback-dialog]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-open-feedback]'));

    // Again - its code here already - and Escape this time.
    dialog = await openFeedback(host);
    expect(dialog.querySelector('anotoki-feedback-form')).not.toBeNull();
    press(dialog.querySelector('dialog')!, 'Escape');
    await settle(fixture);
    expect(host.querySelector('[data-feedback-dialog]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-open-feedback]'));

    // And its close button.
    dialog = await openFeedback(host);
    dialog.querySelector<HTMLButtonElement>('.anotoki-dialog__close')!.click();
    await settle(fixture);
    expect(host.querySelector('[data-feedback-dialog]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-open-feedback]'));
  });

  it('says the fan clause only where the site asks for it - last, under Terms · Privacy · Contact', async () => {
    const { fixture, host, page } = await setUp(FooterPageComponent);
    expect(host.querySelector('[data-fan]')).toBeNull();

    page.fan.set('hoyoverse');
    await settle(fixture);
    const fan = host.querySelector('[data-fan]')!;
    expect(fan.tagName.toLowerCase()).toBe('p');
    expect(words(fan)).toBe(FOOTER_LIBRARY_WORDS.en['anotoki.footer.fanHoyoverse']);
    expect(fan.previousElementSibling?.tagName.toLowerCase()).toBe('anotoki-legal-links');
    expect(fan.nextElementSibling).toBeNull();

    page.fan.set(null);
    await settle(fixture);
    expect(host.querySelector('[data-fan]')).toBeNull();
  });

  it('speaks Slovak without addressing anybody - the row, the links, the fan clause and the dialog', async () => {
    const { fixture, host, page } = await setUp(FooterPageComponent, { language: 'sk' });
    page.fan.set('hoyoverse');
    await settle(fixture);
    expect(row(host)).toEqual(['Verzia 0.3', '·', 'Čo je nové', '·', 'Poslať spätnú väzbu']);
    expect(legalLinks(host).map(([label]) => label)).toEqual(['Podmienky', 'Súkromie', 'Kontakt']);
    expect(words(host.querySelector('[data-fan]'))).toBe('Táto stránka je fanúšikovský projekt a nie je prepojená so spoločnosťou HoYoverse ani ňou schválená.');
    expect(host.querySelector('[lang]')).toBeNull();

    const dialog = await openFeedback(host);
    expect(words(dialog.querySelector('.anotoki-dialog__title'))).toBe('Poslať spätnú väzbu');
    expect(dialog.querySelector('anotoki-feedback-form')?.getAttribute('lang')).toBe('sk');
  });

  it("puts the site's own words first - the database's, through the kit's lookup - and marks English on a page of another language", async () => {
    // The site's Slovak rewording of the button, as the translations module's forKit() answers it.
    const reworded = await setUp(FooterPageComponent, { language: 'sk', lookup: (key) => (key === 'footer.feedback' ? 'Napíšte nám' : null) });
    expect(row(reworded.host)).toEqual(['Verzia 0.3', '·', 'Čo je nové', '·', 'Napíšte nám']);
    const named = await openFeedback(reworded.host);
    expect(words(named.querySelector('.anotoki-dialog__title'))).toBe('Napíšte nám');
    fixture.destroy();
    document.body.innerHTML = '';
    TestBed.resetTestingModule();

    // A language the library has no words for: English, each part saying so.
    const { host, page } = await setUp(FooterPageComponent, { language: 'de' });
    page.fan.set('hoyoverse');
    await settle(fixture);
    expect(row(host)).toEqual(['Version 0.3', '·', "What's new", '·', 'Send feedback']);
    for (const part of [host.querySelector('[data-version]'), host.querySelector('[data-whats-new]'), host.querySelector('[data-open-feedback]'), host.querySelector('[data-fan]')]) {
      expect(part?.getAttribute('lang')).toBe('en');
    }
    expect(host.querySelector('.anotoki-site-footer__dot')?.hasAttribute('lang')).toBe(false);
    const dialog = await openFeedback(host);
    expect(dialog.getAttribute('lang')).toBe('en');
  });
});
