import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig, AnotokiWordTable } from '@anotoki/lib/ui/config';
import { kitProviders } from '../../src/testing';
import { PieceWordTable, pieceWords } from './piece-words';

const TABLE: PieceWordTable<'anotoki.chips.remove' | 'anotoki.chips.more'> = {
  en: { 'anotoki.chips.remove': 'Remove: {name}', 'anotoki.chips.more': 'More' },
  sk: { 'anotoki.chips.remove': 'Odstrániť: {name}', 'anotoki.chips.more': 'Viac' },
};

function reader(config?: () => AnotokiUiConfig) {
  TestBed.configureTestingModule({ providers: kitProviders(config) });
  return runInInjectionContext(TestBed.inject(Injector), () => pieceWords(TABLE));
}

describe('pieceWords(): a kit piece’s own words, read as the kit reads its own', () => {
  it('the built-in words of the page’s language (or its primary subtag), English otherwise - marked so', () => {
    const language = signal('sk-SK');
    const word = reader(() => ({ language }));
    expect(word('anotoki.chips.remove', { name: 'Furina' })).toEqual({ text: 'Odstrániť: Furina', lang: null });

    language.set('en-GB');
    expect(word('anotoki.chips.more')).toEqual({ text: 'More', lang: null });

    language.set('de');
    expect(word('anotoki.chips.remove', { name: 'Furina' })).toEqual({ text: 'Remove: Furina', lang: 'en' });
  });

  it('the site’s string first - its lookup (the database’s), then its own words - never a key', () => {
    const strings = new Map<string, string>([['anotoki.chips.remove', 'Vymazať {name}']]);
    const word = reader(() => ({
      language: () => 'sk',
      lookup: (key) => strings.get('anotoki.' + key) ?? null,
      words: { sk: { 'chips.more': 'Ďalšie' } as unknown as AnotokiWordTable },
    }));
    expect(word('anotoki.chips.remove', { name: 'Furina' })).toEqual({ text: 'Vymazať Furina', lang: null });
    expect(word('anotoki.chips.more')).toEqual({ text: 'Ďalšie', lang: null });

    // An empty string from the site is no string: the built-in words stand.
    strings.set('anotoki.chips.remove', '');
    expect(word('anotoki.chips.remove', { name: 'Furina' }).text).toBe('Odstrániť: Furina');
  });

  it('without any configuration: English', () => {
    const word = reader();
    expect(word('anotoki.chips.remove', { name: 'Furina' })).toEqual({ text: 'Remove: Furina', lang: null });
  });
});
