import { HttpContextToken } from '@angular/common/http';

/**
 * Set on the reporter's own request, for a site's interceptors: a report is no request to retry, to sign in again
 * for, or to show a failure of. Skip your error handling for it - never your headers: the CSRF header (the IAM's
 * X-IAM-Request) is what lets the report in. `request.context.get(ANOTOKI_ERROR_REPORT)` says which it is. The
 * library's own anotokiAuthInterceptor does so (0.6.0).
 */
export const ANOTOKI_ERROR_REPORT = /* @__PURE__ */ new HttpContextToken<boolean>(() => false);
