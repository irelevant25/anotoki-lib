/*
 * @anotoki/lib/ui/multiselect (0.11.0) - <anotoki-multiselect>: several things chosen out of a list - a filter's
 * compact button that says what is chosen ("Furina, Neuvillette and 3 more", a count beside it), over the kit's popover
 * of the kit's checkboxes, one a choice, and Clear. Genshin's multiselect, for every site's filters and forms. Its words
 * (`anotoki.multiselect.*`) are @anotoki/lib/words/multiselect, read by the multiselect itself.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export type { MultiselectOption } from './src/multiselect/multiselect.component';
export { MultiselectComponent } from './src/multiselect/multiselect.component';
