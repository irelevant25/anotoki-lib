/*
 * @anotoki/lib/error-report/marker - the mark on the reporter's own request, ANOTOKI_ERROR_REPORT, and nothing else:
 * what an interceptor reads to leave a report's failure alone. Its own entry point so that an interceptor reading it -
 * the auth module's, on the first page of every site that signs in - takes a token, never the reporter with it (a
 * site's build places whole files in its chunks). @anotoki/lib/error-report re-exports it: a site imports it there.
 */

export { ANOTOKI_ERROR_REPORT } from './src/marker';
