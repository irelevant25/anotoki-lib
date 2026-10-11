/*
 * @anotoki/lib/admin/feedback - the administrators' feedback, <anotoki-feedback-page>
 * (English, for the site's ADMIN alone): an entry point of its own, on a lazy route.
 *
 *   { path: 'feedback', loadComponent: () => import('@anotoki/lib/admin/feedback').then((m) => m.FeedbackPageComponent) }
 *
 * The unread count beside the navigation's entry is @anotoki/lib/admin's FeedbackUnread; the form visitors
 * send it with is @anotoki/lib/feedback's. The server's half: Anotoki\Lib\Feedback\Http\FeedbackRoutes::admin().
 */

export type { FeedbackFacets, FeedbackList, FeedbackMessage, FeedbackStatus } from './src/models';
export { FeedbackPageComponent } from './src/feedback-page/feedback-page.component';
