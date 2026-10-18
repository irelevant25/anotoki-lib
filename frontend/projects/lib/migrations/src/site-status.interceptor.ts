import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { ANOTOKI_MIGRATIONS_CONFIG } from './config';
import { jsonObject, withoutQuery } from './http';
import { SiteStatus } from './site-status.service';

/**
 * Hears the server say the site is not ready: a 503 whose JSON body's code is
 * update_pending or not_set_up is reported to SiteStatus, and the gate shows
 * the status page. The request still fails as it did. The status path's own
 * requests pass untouched (SiteStatus reads those itself).
 */
export const siteStatusInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(ANOTOKI_MIGRATIONS_CONFIG);
  if (withoutQuery(request.url) === withoutQuery(config.statusUrl)) {
    return next(request);
  }

  const status = inject(SiteStatus);
  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 503) {
          return;
        }
        const body = jsonObject(error.error);
        const code = body?.['code'];
        if (code === 'update_pending' || code === 'not_set_up') {
          const installed = body?.['installed'];
          status.report(code, typeof installed === 'boolean' ? installed : undefined);
        }
      },
    }),
  );
};
