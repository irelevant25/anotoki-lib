import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig } from './config';
import { AnotokiWords, fillWords } from './anotoki-words.service';
import { kitProviders } from './testing';
import { ANOTOKI_WORD_KEYS, BUILT_IN_WORDS } from './words';

describe('AnotokiWords: the kit says its words in the page language', () => {
  function words(config?: () => AnotokiUiConfig): AnotokiWords {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    return TestBed.inject(AnotokiWords);
  }

  it('reads English with no configuration at all - never a key', () => {
    const kit = words();
    expect(kit.language()).toBe('en');
    expect(kit.lang()).toBe('en');
    expect(kit.foreignLang()).toBeNull();
    expect(kit.t('ui.close')).toBe('Close');
    expect(kit.t('topbar.account')).toBe('Your anotoki account');
  });

  it('has Slovak built in - informal, and the owner’s "Tvoj anotoki účet"', () => {
    const kit = words(() => ({ language: () => 'sk' }));
    expect(kit.lang()).toBe('sk');
    expect(kit.t('ui.retry')).toBe('Skúsiť znova');
    expect(kit.t('topbar.account')).toBe('Tvoj anotoki účet');
    expect(kit.t('topbar.menuButton', { name: 'Mira' })).toBe('Tvoja ponuka: Mira');
    expect(kit.t('language.notSaved')).toContain('do tvojho anotoki účtu');
  });

  it('every key has Slovak, and no word is empty', () => {
    for (const key of ANOTOKI_WORD_KEYS) {
      expect(BUILT_IN_WORDS['en'][key], key).not.toBe('');
      expect(BUILT_IN_WORDS['sk'][key], key).not.toBe('');
    }
    expect(Object.keys(BUILT_IN_WORDS['sk']).sort()).toEqual([...ANOTOKI_WORD_KEYS].sort());
  });

  it('a regional code reads its language (sk-SK as sk)', () => {
    const kit = words(() => ({ language: () => 'sk-SK' }));
    expect(kit.t('ui.cancel')).toBe('Zrušiť');
    expect(kit.lang()).toBe('sk-sk');
  });

  it('follows the page language as a signal', () => {
    const language = signal('en');
    const kit = words(() => ({ language }));
    expect(kit.t('theme.dark')).toBe('Dark');
    language.set('sk');
    expect(kit.t('theme.dark')).toBe('Tmavý');
  });

  it('a site words a key its own way, per language: the survey’s formal Slovak', () => {
    const language = signal('sk');
    const kit = words(() => ({ language, words: { sk: { 'topbar.account': 'Váš anotoki účet', 'topbar.menuButton': 'Vaša ponuka: {name}' } } }));
    expect(kit.t('topbar.account')).toBe('Váš anotoki účet');
    expect(kit.t('topbar.menuButton', { name: 'Mira' })).toBe('Vaša ponuka: Mira');
    expect(kit.t('topbar.signOut')).toBe('Odhlásiť sa');
    language.set('en');
    expect(kit.t('topbar.account')).toBe('Your anotoki account');
  });

  it('a lookup comes first (a translations module), and an empty answer falls back', () => {
    const strings: Record<string, string> = { 'anotoki.ui.close': 'Schließen', 'anotoki.ui.cancel': '' };
    const kit = words(() => ({ language: () => 'de', lookup: (key) => strings['anotoki.' + key] ?? null }));
    expect(kit.t('ui.close')).toBe('Schließen');
    expect(kit.t('ui.cancel')).toBe('Cancel');
    expect(kit.t('ui.retry')).toBe('Try again');
    expect(kit.lang()).toBe('de');
  });

  it('a language nobody has words for reads English, marked as English', () => {
    const kit = words(() => ({ language: () => 'de' }));
    expect(kit.t('ui.close')).toBe('Close');
    expect(kit.lang()).toBe('en');
    expect(kit.foreignLang()).toBe('en');
  });

  it('a language the site has some words for is that language; what it lacks reads English', () => {
    const kit = words(() => ({ language: () => 'de', words: { de: { 'ui.close': 'Schließen' } } }));
    expect(kit.t('ui.close')).toBe('Schließen');
    expect(kit.t('ui.cancel')).toBe('Cancel');
    expect(kit.lang()).toBe('de');
  });

  it('fills placeholders, and leaves one with no value as it is', () => {
    expect(fillWords('{first}-{last} of {total}', { first: 1, last: 50, total: 230 })).toBe('1-50 of 230');
    expect(fillWords('Your menu: {name}', {})).toBe('Your menu: {name}');
    expect(fillWords('No placeholders')).toBe('No placeholders');
  });
});
