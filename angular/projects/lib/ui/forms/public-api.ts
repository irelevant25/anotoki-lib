/*
 * @anotoki/lib/ui/forms - the family's fields: text field, textarea, password
 * field, select, checkbox, switch, radio group and code input. Each a real
 * native control with a real label, its hint and error tied to it.
 *
 * For lazy pages: nothing a site draws on every page should import it - a page
 * that draws a select where the first load is imports @anotoki/lib/ui/select
 * (0.6.0), the select alone.
 */

export { FieldBase } from '@anotoki/lib/ui/field';
export type { TextFieldType } from './src/text-field/text-field.component';
export { TextFieldComponent } from './src/text-field/text-field.component';
export { TextareaComponent } from './src/textarea/textarea.component';
export { PasswordFieldComponent } from './src/password-field/password-field.component';
// The select is an entry point of its own since 0.6.0 (a first load can take it alone); named here as before.
export type { SelectOption } from '@anotoki/lib/ui/select';
export { SelectComponent } from '@anotoki/lib/ui/select';
export { CheckboxComponent } from './src/checkbox/checkbox.component';
export { SwitchComponent } from './src/switch/switch.component';
export type { RadioOption } from './src/radio-group/radio-group.component';
export { RadioGroupComponent } from './src/radio-group/radio-group.component';
export { CodeInputComponent } from './src/code-input/code-input.component';
