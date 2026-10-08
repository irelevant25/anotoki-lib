import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SK_BUNDLE, TranslationsSite, settled, translationsProviders, translationsSite } from './testing';
import { TranslatePluralPipe } from './translate-plural.pipe';
import { TranslatePipe } from './translate.pipe';
import { TranslationService } from './translation.service';

@Component({
  selector: 'anotoki-test-words',
  imports: [TranslatePipe, TranslatePluralPipe],
  template: `
    <p id="plain">{{ 'theme.label' | translate }}</p>
    <p id="filled">{{ 'greeting.named' | translate: { name: who() } }}</p>
    <p id="plural">{{ 'reviews.due' | translatePlural: count() }}</p>
    <p id="library">{{ 'anotoki.ui.close' | translate }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class WordsComponent {
  readonly who = signal('Mira');
  readonly count = signal(1);
}

describe('the translate and translatePlural pipes', () => {
  let site: TranslationsSite;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en']);
    site = translationsSite();
    TestBed.configureTestingModule({ providers: translationsProviders(site, { waits: { retry: 0 } }) });
  });

  afterEach(() => vi.restoreAllMocks());

  const text = (host: HTMLElement, id: string) => host.querySelector(`#${id}`)?.textContent?.trim();

  it('word the page - and word it again when the language changes under constant keys (impure, on an OnPush page)', async () => {
    const i18n = TestBed.inject(TranslationService);
    await i18n.init();
    const fixture = TestBed.createComponent(WordsComponent);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;

    expect(text(host, 'plain')).toBe('Appearance');
    expect(text(host, 'filled')).toBe('Hello, Mira!');
    expect(text(host, 'plural')).toBe('1 review due');
    expect(text(host, 'library')).toBe('Close');

    site.respond = () => Promise.resolve(SK_BUNDLE);
    await i18n.setLanguage('sk');
    await fixture.whenStable();
    expect(text(host, 'plain')).toBe('Vzhľad');
    expect(text(host, 'filled')).toBe('Ahoj, Mira!');
    expect(text(host, 'plural')).toBe('1 opakovanie');
    expect(text(host, 'library')).toBe('Zavrieť');

    fixture.componentInstance.count.set(3);
    fixture.componentInstance.who.set('Ondrej');
    await fixture.whenStable();
    expect(text(host, 'plural')).toBe('3 opakovania');
    expect(text(host, 'filled')).toBe('Ahoj, Ondrej!');
  });

  it('read the compiled English while no bundle is in memory', async () => {
    site.respond = () => Promise.reject(new Error('offline'));
    const i18n = TestBed.inject(TranslationService);
    await i18n.init();
    await settled();
    const fixture = TestBed.createComponent(WordsComponent);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(text(host, 'plain')).toBe('Theme');
    expect(text(host, 'plural')).toBe('1 review due');
    expect(text(host, 'library')).toBe('Close');
  });
});
