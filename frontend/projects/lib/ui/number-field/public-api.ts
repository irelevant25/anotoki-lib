/*
 * @anotoki/lib/ui/number-field (0.11.0) - <anotoki-number-field>: a number typed - its value a number, or null while
 * the field holds none - between `min` and `max`, in the field's `step` (whole numbers by default; 0.01 two decimals;
 * 'any'); a dot or a comma before the decimals, written the page's way once left; why what was typed is not taken said
 * under it. A field of the kit's. Its words (`anotoki.numberField.*`) are @anotoki/lib/words/number-field, read by the
 * field itself.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export { NumberFieldComponent, readNumber } from './src/number-field/number-field.component';
