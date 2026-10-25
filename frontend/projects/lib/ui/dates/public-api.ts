/*
 * @anotoki/lib/ui/dates (0.11.0) - dates and times as every anotoki site writes them: in the anotoki account's date
 * order and on its clock where it chose them (the IAM's `preferences` claim - provideAnotokiUi's `dateChoices`), else
 * in the page language's own way (Intl, in the page's locale - provideAnotokiUi's `locale`, which the translations
 * module's forKit() gives); and how long ago or how soon ("5 minutes ago", "včera"), in the page's language and its
 * plurals. The pipes `anotokiDate` and `anotokiAgo`, AnotokiDates for a page's own code, and the functions under them
 * for code with no injector. Its words (`anotoki.dates.*`: "just now", "in a moment", "on {date}") are
 * @anotoki/lib/words/dates, read by the pipes themselves.
 */

export type { DateValue, DateWriting, DayStyle, RelativeOptions, RelativeWords } from './src/dates';
export { calendarDays, formatDate, formatDateTime, formatInOrder, formatRelative, formatTime, readDate } from './src/dates';
export type { AgoPipeOptions, DatePipeOptions, DatePipeStyle } from './src/pipes';
export { AnotokiAgoPipe, AnotokiDatePipe, AnotokiDates } from './src/pipes';
