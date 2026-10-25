import { inject } from '@angular/core';
import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import { SiteSettings } from './site-settings.service';

/**
 * Page access's half in the browser: whether a page an administrator switched off, or keeps for some readers, may
 * match - on the site's routes that begin at the root (a top-level route, or one under a layout route of path ''),
 * where the segments are the whole address: it decides for every page under its route, each by its own row
 * ('/quizzes/music' and '/quizzes' are two rows).
 *
 * A canMatch, never a canActivate: a refused canActivate has to send the visitor somewhere, which tells them the page
 * exists and was taken away; a refused canMatch lets the router go on down the list, to the site's not-found page at
 * the address they typed - as if the page had never been written (genshin's rule).
 *
 * The server's half refuses the API paths a row names (PageAccessGate): a page hidden here keeps its data only where
 * its row says so.
 *
 * ```ts
 * { path: 'quizzes', canMatch: [pageAccessGuard], loadChildren: () => ... }
 * ```
 */
export const pageAccessGuard: CanMatchFn = (_route: Route, segments: UrlSegment[]) => inject(SiteSettings).mayNavigate(`/${segments.map((segment) => segment.path).join('/')}`);
