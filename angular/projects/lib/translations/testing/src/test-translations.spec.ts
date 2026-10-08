import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { TEST_LANGUAGES, provideTestTranslations } from './test-translations';

describe('provideTestTranslations(): a site’s specs, worded with no server', () => {
  function service(...providers: ReturnType<typeof provideTestTranslations>): TranslationService {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), ...providers] });
    return TestBed.inject(TranslationService);
  }

  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('words the page from the strings it was given - in English by default, the family’s two languages on offer', () => {
    const i18n = service(...provideTestTranslations({ 'nav.home': 'Home', 'reviews.due.one': '{count} review', 'reviews.due.other': '{count} reviews' }));
    expect(i18n.ready()).toBe(true);
    expect(i18n.language()).toBe('en');
    expect(i18n.languages()).toEqual(TEST_LANGUAGES);
    expect(i18n.t('nav.home')).toBe('Home');
    expect(i18n.plural('reviews.due', 2)).toBe('2 reviews');
    // A key not given is the key, as on the site; a library key reads the library's words.
    expect(i18n.t('nav.missing')).toBe('nav.missing');
    expect(i18n.t('anotoki.ui.close')).toBe('Close');
  });

  it('runs in another language, with English beside it for the English areas', () => {
    const i18n = service(...provideTestTranslations({ 'nav.home': 'Domov' }, { language: 'sk', english: { 'nav.home': 'Home' } }));
    expect(i18n.t('nav.home')).toBe('Domov');
    expect(i18n.t('anotoki.ui.close')).toBe('Zavrieť');
    i18n.noteAddress('/admin');
    expect(i18n.t('nav.home')).toBe('Home');
  });

  it('switches between the bundles it was given, with no HTTP', async () => {
    const i18n = service(...provideTestTranslations({ 'nav.home': 'Domov' }, { language: 'sk', english: { 'nav.home': 'Home' } }));
    expect(await i18n.setLanguage('en')).toBe(true);
    expect(i18n.t('nav.home')).toBe('Home');
    expect(await i18n.setLanguage('sk')).toBe(true);
    expect(i18n.t('nav.home')).toBe('Domov');
  });

  it('has an init() and a reload() that answer at once and leave the language the spec chose', async () => {
    const i18n = service(...provideTestTranslations({ 'nav.home': 'Domov' }, { language: 'sk', english: { 'nav.home': 'Home' } }));
    await i18n.init();
    await i18n.reload();
    expect(i18n.language()).toBe('sk');
  });
});
