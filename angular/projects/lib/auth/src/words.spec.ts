import { LIBRARY_WORDS } from '@anotoki/lib/words';
import { BUILT_IN_WORDS, SIGN_IN_WORD_NAMES, failureText, signInKey, signInWords } from './words';

describe('the words of signing in', () => {
  it('built in for English and informal Slovak, the same words in both', () => {
    expect(Object.keys(BUILT_IN_WORDS.sk)).toEqual(Object.keys(BUILT_IN_WORDS.en));
    expect(signInWords('sk').words.retry).toBe('Skúsiť znova');
    expect(signInWords('sk-SK').lang).toBe('sk-sk');
    expect(signInWords('de')).toEqual({ lang: 'en', words: BUILT_IN_WORDS.en });
    expect(signInWords(null).lang).toBe('en');
  });

  it("the library's words anotoki.signIn.*, every one of them, from php/resources/library-words.json", () => {
    const keys = Object.keys(LIBRARY_WORDS.en).filter((key) => key.startsWith('anotoki.signIn.'));
    expect(keys).toEqual(SIGN_IN_WORD_NAMES.map((name) => signInKey(name)));
    for (const language of ['en', 'sk'] as const) {
      for (const name of SIGN_IN_WORD_NAMES) {
        expect(BUILT_IN_WORDS[language][name], `${language} ${name}`).toBe(LIBRARY_WORDS[language][`anotoki.signIn.${name}`]);
      }
    }
  });

  it("the site's own words, and its bundle's, over the built-in ones", () => {
    expect(signInWords('sk', { sk: { retry: 'Ešte raz', back: '' } }).words).toMatchObject({ retry: 'Ešte raz', back: 'Späť' });
    expect(signInWords('de', { de: { retry: 'Nochmal' } })).toMatchObject({ lang: 'de', words: { retry: 'Nochmal', back: 'Back' } });
    const bundle: Record<string, string> = { 'anotoki.signIn.back': 'Zurück' };
    const translated = signInWords('de', undefined, (key) => bundle[key] ?? key);
    expect(translated).toMatchObject({ lang: 'de', words: { back: 'Zurück', retry: 'Try again' } });
    expect(signInKey('signingIn')).toBe('anotoki.signIn.signingIn');
  });

  it('a failure is worded from its code alone', () => {
    const words = BUILT_IN_WORDS.en;
    expect(failureText('access_denied', words)).toBe(words.notCompleted);
    expect(failureText('state_mismatch', words)).toBe(words.expired);
    expect(failureText('storage_unavailable', words)).toBe(words.storageUnavailable);
    expect(failureText('unavailable', words)).toBe(words.unavailable);
    expect(failureText('server_error', words)).toBe('The sign-in failed (server_error).');
    expect(failureText('<script>alert(1)</script>', words)).toBe('The sign-in failed (unknown).');
  });
});
