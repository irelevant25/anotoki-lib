/*
 * @anotoki/lib/error-report - the browser's errors in the site's error log
 * (the owner's decision of 2026-10-11): an Angular ErrorHandler that tells
 * the console, as Angular's own does, and reports each error to the site's
 * ErrorLogRoutes::client() route through the app's own HttpClient - so the
 * site's interceptors add what its writes carry (the IAM's X-IAM-Request) -
 * scrubbed, at most a few a page load, each once. Tiny, and in every first
 * load:
 *
 *   providers: [provideHttpClient(withInterceptors([...])), provideBrowserGlobalErrorListeners(), provideAnotokiErrorReport()]
 *
 * The server's half: Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes::client().
 */

// The report's mark lives in an entry point of its own (@anotoki/lib/error-report/marker), which the auth module's
// interceptor reads without the reporter; named here too, where a site has always taken it.
export { ANOTOKI_ERROR_REPORT } from '@anotoki/lib/error-report/marker';
export type { AnotokiErrorReportConfig, ErrorReport } from './src/error-report';
export { ANOTOKI_ERROR_REPORT_CONFIG, AnotokiErrorReporter, DEFAULT_ERROR_REPORT_ENDPOINT, describeError, provideAnotokiErrorReport, scrubText, storedValues } from './src/error-report';
