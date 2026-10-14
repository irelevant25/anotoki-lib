/*
 * @anotoki/lib/ui/combobox - <anotoki-combobox>: one or several things chosen out of many by typing (genshin's
 * characters with their portraits) - the ARIA 1.2 combobox with a list box under it: typing filters (accents and case
 * aside), the arrow keys, Enter and Escape, an option's picture beside its name, "No matches", a long list drawn a part
 * at a time ("12 more: keep typing"); several chosen are the kit's removable chips (ui/chips). Its words
 * (`anotoki.combobox.*`) are @anotoki/lib/words/combobox, read by the combobox itself.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export type { ComboboxOption } from './src/options';
export { foldText } from './src/options';
export { ComboboxComponent } from './src/combobox/combobox.component';
