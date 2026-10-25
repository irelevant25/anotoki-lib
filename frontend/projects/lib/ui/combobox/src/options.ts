import { foldText } from '@anotoki/lib/ui/search';

// The filter folds a text as every search of the family does (ui/search, 0.11.0) - named here as before.
export { foldText };

/** One choice of a combobox. */
export interface ComboboxOption {
  value: string;
  /** Its name: shown, and what typing finds it by. */
  label: string;
  /** A small picture beside the name (a character's portrait): its address. Drawn with an empty alt - the name beside it says it. */
  picture?: string | null;
  /** More words typing finds it by, never shown ("Hydro", a nickname). */
  keywords?: string | null;
  /** The name's language, where it is not the page's. */
  lang?: string | null;
  /** Shown, and not to be chosen. */
  disabled?: boolean;
}

/** An option with what the filter reads of it, folded once. */
export interface FoldedOption {
  readonly option: ComboboxOption;
  /** Its place among the options: its element's id. */
  readonly index: number;
  readonly label: string;
  readonly words: string;
}

/** The options as the filter reads them. */
export function foldOptions(options: readonly ComboboxOption[]): FoldedOption[] {
  return options.map((option, index) => {
    const label = foldText(option.label);
    return { option, index, label, words: option.keywords ? `${label} ${foldText(option.keywords)}` : label };
  });
}

/** The options a typed text finds - its words anywhere in the name or the keywords - those whose name starts with it first. */
export function matchOptions(options: readonly FoldedOption[], typed: string): readonly FoldedOption[] {
  const query = foldText(typed.trim());
  if (query === '') {
    return options;
  }
  const found = options.filter((entry) => entry.words.includes(query));
  return [...found.filter((entry) => entry.label.startsWith(query)), ...found.filter((entry) => !entry.label.startsWith(query))];
}
