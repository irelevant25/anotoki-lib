/*
 * @anotoki/lib/admin/parts - what the admin tools' pages share (the site's
 * configuration read once, how a failure, a date and a size are said, the
 * pages' icons and their in-page question): an entry point of its own so that
 * every page's lazy chunk shares one copy, and no first load of a site holds
 * any of it. Internal to the library's admin pages; not a site's API.
 */

export type { QueryParams } from './src/admin-tools';
export { AdminTools, query } from './src/admin-tools';
export { defaultFailureText, failureNumber, mayStillRun, readFailure } from './src/failure';
export { ago, counted, defaultFormatDate, formatBytes, formatCount, formatDay } from './src/format';
export { registerAdminIcons } from './src/icons';
export type { Question } from './src/questions';
export { Questions } from './src/questions';
export { AdminQuestionComponent } from './src/question/question.component';
