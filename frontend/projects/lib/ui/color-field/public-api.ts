/*
 * @anotoki/lib/ui/color-field - <anotoki-color-field>: a colour - the device's own colour picker behind a colour box,
 * and its code typed beside it (#rrggbb, checked) kept in step with it - with suggested colours under it if the page
 * gives some, each with its name (a radio group: never a colour alone). The value is '#rrggbb', lower-case; '' for none.
 * Its words (`anotoki.colorField.*`) are @anotoki/lib/words/color-field, read by the field itself.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export type { ColorSwatch } from './src/color-field/color-field.component';
export { ColorFieldComponent, readColor } from './src/color-field/color-field.component';
