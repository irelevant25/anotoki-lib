/*
 * @anotoki/lib/ui/date-field - <anotoki-date-field>: a date typed in the reader's date format (the anotoki account's
 * `date_format`, or the page language's own), or chosen in a calendar that opens from a button inside the field - a
 * dialog of a month's days (the arrow keys, Page Up and Page Down for the months, Home and End, Escape back to the
 * field). `min` and `max`; a day and a month without a year (`dayMonth`, a birthday). The value is ISO: 'YYYY-MM-DD',
 * or '--MM-DD' for a day and a month; '' while there is none. Its words (`anotoki.dateField.*`) are
 * @anotoki/lib/words/date-field, read by the field itself.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export type { DateFieldFormat } from './src/dates';
export { DateFieldComponent } from './src/date-field/date-field.component';
