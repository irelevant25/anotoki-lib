/*
 * Accent-free search, one way for every site: what genshin's diacritics table, the survey's slug and the build
 * analyzer's builds filter each did their own way, and the combobox's filter.
 */

/**
 * The letters Unicode writes whole - no base letter and mark to part - in their plain spelling: a search for "lodz"
 * finds "Łódź", "strasse" finds "Straße", "aeron" finds "Æron". Lower case: they are looked up after the text is.
 */
const PLAIN: Readonly<Record<string, string>> = {
  ł: 'l',
  đ: 'd',
  ð: 'd',
  ø: 'o',
  ħ: 'h',
  ı: 'i',
  ŀ: 'l',
  ŧ: 't',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};

/**
 * A text as a search reads it: without its accents and marks (Unicode's compatibility decomposition, the marks taken
 * away - "Fúrina" -> "furina", "ﬁ" -> "fi", a full-width "Ａ" -> "a"), in lower case, and the letters written two ways
 * in their plain spelling (PLAIN). Two texts a person reads as the same word fold to the same text.
 */
export function foldText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[łđðøħıŀŧßæœþ]/g, (letter) => PLAIN[letter] ?? letter);
}

/** A query's words, folded: what a person typed, split at its spaces, nothing empty. */
export function searchWords(query: string): string[] {
  return foldText(query)
    .split(/\s+/)
    .filter((word) => word !== '');
}

/**
 * Whether a text holds every word of a query, each anywhere in it - accents and case aside: "hydro sword" finds
 * "Furina - Hydro, Sword". A text may be several (a name, its element, its weapon), read as one. An empty query finds
 * everything.
 */
export function matchesSearch(text: string | readonly (string | null | undefined)[], query: string): boolean {
  const words = searchWords(query);
  if (words.length === 0) {
    return true;
  }
  const folded = foldText(typeof text === 'string' ? text : text.filter((part) => part).join(' '));
  return words.every((word) => folded.includes(word));
}

/**
 * The items whose text holds every word of the query, in their own order - each item's text folded once, the query's
 * words once. `textOf` says what of an item a search reads: its name, or its name and its keywords.
 */
export function filterBySearch<T>(items: readonly T[], query: string, textOf: (item: T) => string | readonly (string | null | undefined)[]): T[] {
  const words = searchWords(query);
  if (words.length === 0) {
    return [...items];
  }
  return items.filter((item) => {
    const text = textOf(item);
    const folded = foldText(typeof text === 'string' ? text : text.filter((part) => part).join(' '));
    return words.every((word) => folded.includes(word));
  });
}
