/*
 * @anotoki/lib/ui/search (0.11.0) - accent-free search: foldText() writes a text as a search reads it - accents, case
 * and the letters written two ways aside - so that "cafe" finds "café", "furina" finds "Fúrina" and "lodz" finds
 * "Łódź"; matchesSearch() and filterBySearch() find a query's words in a text, each anywhere in it. Functions alone:
 * no Angular, no words, nothing at the module's top level - an entry point small enough for any page, the combobox's
 * filter among them.
 */

export { filterBySearch, foldText, matchesSearch, searchWords } from './src/search';
