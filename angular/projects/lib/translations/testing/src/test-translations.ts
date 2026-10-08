import { Injectable, InjectionToken, Provider, inject } from '@angular/core';
import { FALLBACK_LANGUAGE, SiteLanguage, TranslationBundle, TranslationService } from '@anotoki/lib/translations';

/** The two languages every site is released in. */
export const TEST_LANGUAGES: SiteLanguage[] = [
  { code: 'en', name: 'English', native_name: 'English' },
  { code: 'sk', name: 'Slovak', native_name: 'Slovenčina' },
];

const TEST_BUNDLE = new InjectionToken<TranslationBundle>('the bundle a spec runs with');

/**
 * The real service with a bundle already in memory, and no HTTP: what it
 * would fetch is answered from that bundle - its own language, English for any
 * other, as the server answers a language it does not offer. The bundle counts
 * as the server's own, so a navigation in a spec asks for nothing.
 */
@Injectable()
class TestTranslationService extends TranslationService {
  private readonly bundle = inject(TEST_BUNDLE);

  constructor() {
    super();
    this.use(this.bundle);
  }

  protected override fetchBundle(code: string): Promise<unknown> {
    const { language, languages, values, english } = this.bundle;
    return Promise.resolve(code === language ? this.bundle : { language: FALLBACK_LANGUAGE, languages, values: english ?? values });
  }

  protected override canAsk(): boolean {
    return true;
  }

  /** The start: here the bundle is in force already - nothing is read from storage or from the address. */
  override init(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * What a page calls after it changed the strings or the languages: here it
   * answers at once and changes nothing - the language the spec chose stays. A
   * spec that cares asks whether it was called: `vi.spyOn(i18n, 'reload')`.
   */
  override reload(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * For a spec that runs the translation service, a pipe or a component with
 * given strings - with no server, no storage and no address read:
 * `provideTestTranslations({ 'nav.home': 'Home' })` is an English bundle of
 * them; for another language, say which and give English beside it (what the
 * English areas read) -
 * `provideTestTranslations({ 'nav.home': 'Domov' }, { language: 'sk', english: { 'nav.home': 'Home' } })`.
 * A site with a compiled English passes it whole: `provideTestTranslations(en)`.
 *
 * A key that is not given comes back as itself and warns, as on the site with
 * a bundle in memory; a library key (`anotoki.*`) reads the library's words.
 * Its languages are TEST_LANGUAGES unless the spec gives its own.
 */
export function provideTestTranslations(values: Record<string, string> = {}, bundle: Partial<Omit<TranslationBundle, 'values'>> = {}): Provider[] {
  const language = bundle.language ?? FALLBACK_LANGUAGE;
  const whole: TranslationBundle = {
    language,
    languages: bundle.languages ?? TEST_LANGUAGES,
    values,
    ...(language === FALLBACK_LANGUAGE ? {} : { english: bundle.english ?? {} }),
  };
  return [
    { provide: TEST_BUNDLE, useValue: whole },
    { provide: TranslationService, useClass: TestTranslationService },
  ];
}
