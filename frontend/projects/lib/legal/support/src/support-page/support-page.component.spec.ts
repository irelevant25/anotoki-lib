import { WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnotokiLegalConfig, provideAnotokiLegal } from '@anotoki/lib/legal';
import { headingLevels, inOrder, settle, words } from '../../../pages/src/testing';
import { BUILT_IN_SUPPORT_WORDS, supportWordNames } from '../words';
import { SUPPORT_URL, SupportPageComponent } from './support-page.component';

describe("<anotoki-support-page>: the owner's words, and the way to Ko-fi", () => {
  let fixture: ComponentFixture<SupportPageComponent>;
  let host: HTMLElement;
  let language: WritableSignal<string>;

  async function draw(config: Partial<AnotokiLegalConfig> | null = {}): Promise<void> {
    language = signal('en');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ...(config === null
          ? []
          : [
              provideAnotokiLegal(() => ({
                language: () => language(),
                facts: () => {
                  throw new Error('The Support page reads none of the facts: the legal pages alone do.');
                },
                ...config,
              })),
            ]),
      ],
    });
    fixture = TestBed.createComponent(SupportPageComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle(fixture);
  }

  afterEach(() => {
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it("says why, then the kit's button to the owner's Ko-fi page - a new tab, no opener, no referrer - then the thanks", async () => {
    await draw();
    expect(host.getAttribute('lang')).toBe('en');
    expect(words(host.querySelector('h1'))).toBe('Support anotoki');
    expect(inOrder(headingLevels(host))).toBe(true);
    expect(words(host.querySelector('[data-support-text]'))).toBe(
      'anotoki is made and run by me alone, in my free time, and every project here is free to use. If something here helps you or you simply enjoy it, you can support its development on Ko-fi – every coffee helps pay for the hosting and the time new features take.',
    );

    const button = host.querySelector<HTMLAnchorElement>('a[data-ko-fi]')!;
    expect(words(button)).toBe('Support on Ko-fi');
    expect(button.getAttribute('href')).toBe('https://ko-fi.com/projectanotoki');
    expect(SUPPORT_URL).toBe('https://ko-fi.com/projectanotoki');
    expect([button.getAttribute('target'), button.getAttribute('rel')]).toEqual(['_blank', 'noopener noreferrer']);
    expect(button.classList).toContain('anotoki-button');
    expect(button.classList).toContain('anotoki-button--primary');
    // The icon says it goes elsewhere, to the eye alone: the link's name is its words.
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    const thanks = host.querySelector('[data-thanks]')!;
    expect(words(thanks)).toBe('Thank you!');
    expect(button.compareDocumentPosition(thanks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("speaks Slovak - the owner of himself, addressing nobody - and an owner's rewording first", async () => {
    await draw({ translate: (key) => (language() === 'sk' && key === 'anotoki.support.thanks' ? 'Vďaka!' : null) });
    language.set('sk');
    await settle(fixture);
    expect(host.getAttribute('lang')).toBe('sk');
    expect(words(host.querySelector('h1'))).toBe('Podporiť anotoki');
    expect(words(host.querySelector('a[data-ko-fi]'))).toBe('Podporiť na Ko-fi');
    expect(words(host.querySelector('[data-thanks]'))).toBe('Vďaka!');
    expect(BUILT_IN_SUPPORT_WORDS.sk.thanks).toBe('Ďakujem!');

    const secondPerson = /^(ty|tvoj\w*|teba|tebe|tebou|vy|váš|vaš\w*|vám|vás|vami)$/;
    const verb = /(íš|eš|áš|íte|ete|áte)$/;
    for (const name of supportWordNames()) {
      for (const word of BUILT_IN_SUPPORT_WORDS.sk[name].toLowerCase().match(/\p{L}+/gu) ?? []) {
        expect(secondPerson.test(word) || verb.test(word), `${name}: "${word}"`).toBe(false);
      }
      // The address is the code's, never a word a rewording could move.
      expect(BUILT_IN_SUPPORT_WORDS.en[name]).not.toMatch(/https?:|ko-fi\.com/);
    }
  });

  it("works without the legal configuration: the page's own language", async () => {
    document.documentElement.lang = 'sk';
    await draw(null);
    expect(words(host.querySelector('h1'))).toBe('Podporiť anotoki');
    document.documentElement.lang = 'en';
  });
});
