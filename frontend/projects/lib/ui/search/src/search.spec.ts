import { filterBySearch, foldText, matchesSearch, searchWords } from './search';

describe('accent-free search (ui/search): "cafe" finds "café"', () => {
  it('folds accents, marks and case away, in Slovak, English and the letters Unicode writes whole', () => {
    expect(foldText('Café')).toBe('cafe');
    expect(foldText('Fúrina')).toBe('furina');
    expect(foldText('Ščťžýáíéúôäňľĺŕď')).toBe('sctzyaieuoanllrd');
    expect(foldText('ŠČŤŽÝÁÍÉÚÔÄŇĽĹŔĎ')).toBe('sctzyaieuoanllrd');
    expect(foldText('Łódź')).toBe('lodz');
    expect(foldText('Straße')).toBe('strasse');
    expect(foldText('Æron Øster Œuvre Þór ıstanbul Đorđe')).toBe('aeron oster oeuvre thor istanbul dorde');
    // Compatibility forms: a ligature, full-width letters.
    expect(foldText('ﬁre ＡＢＣ')).toBe('fire abc');
    // Words of other scripts stay as they are (no accents to take), lower case where they have one.
    expect(foldText('日本語 Ελλάδα')).toBe('日本語 ελλαδα');
    expect(foldText('')).toBe('');
  });

  it('splits a query into its folded words, nothing empty', () => {
    expect(searchWords('  Hydro   Sword ')).toEqual(['hydro', 'sword']);
    expect(searchWords('   ')).toEqual([]);
  });

  it('finds every word of the query anywhere in the text - several texts read as one', () => {
    expect(matchesSearch('Café de Flore', 'cafe')).toBe(true);
    expect(matchesSearch('Café de Flore', 'flore CAFÉ')).toBe(true);
    expect(matchesSearch('Café de Flore', 'cafe paris')).toBe(false);
    expect(matchesSearch(['Furina', 'Hydro', null, 'Sword'], 'hydro swo')).toBe(true);
    expect(matchesSearch('Neuvillette', 'fur')).toBe(false);
    expect(matchesSearch('anything', '   ')).toBe(true);
  });

  it('filters items by the text a search reads of each, in their own order', () => {
    const characters = [
      { name: 'Fúrina', element: 'Hydro' },
      { name: 'Neuvillette', element: 'Hydro' },
      { name: 'Arlecchino', element: 'Pyro' },
    ];
    expect(filterBySearch(characters, 'hydro', (character) => [character.name, character.element]).map((character) => character.name)).toEqual(['Fúrina', 'Neuvillette']);
    expect(filterBySearch(characters, 'FURI', (character) => character.name).map((character) => character.name)).toEqual(['Fúrina']);
    expect(filterBySearch(characters, '', (character) => character.name)).toEqual(characters);
    expect(filterBySearch(characters, '', (character) => character.name)).not.toBe(characters);
  });
});
