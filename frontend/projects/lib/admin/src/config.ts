import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** The library's admin tools, each with its routes under the site's admin API (the PHP half's `*Routes::admin()`). */
export type AdminTool = 'errors' | 'audit' | 'feedback' | 'backups' | 'files' | 'site-settings';

/**
 * A request that failed, as the pages read it whatever the site's error body
 * is - the library's `{code, message}`, the IAM's `{error, code}` - or a
 * site's own error object that says status, code and message.
 */
export interface AdminFailure {
  /** The answer's status; 0 when the server was not reached. */
  status: number;
  code: string;
  /** The server's sentence (English), '' when it gave none. */
  message: string;
  /** Everything else the body said (`retry_after`, `differs`, `field`, ...). */
  details: Readonly<Record<string, unknown>>;
}

/** What a site tells the admin tools' pages, through provideAnotokiAdmin(). */
export interface AnotokiAdminConfig {
  /**
   * Whether the person is the site's ADMIN - from the token (the sites), or
   * the session (the IAM). The pages are for the site's ADMIN alone: anybody
   * else is told whose they are, and nothing is asked of the server. A signal
   * works, and is followed.
   */
  isAdmin: () => boolean;
  /** Where the tools' routes are: '/api/admin' by default - errors, audit, feedback, backups and files under it. */
  apiBase?: string;
  /** A tool mounted elsewhere than `{apiBase}/{tool}`: `{ files: '/api/admin/explorer' }`. */
  paths?: Partial<Record<AdminTool, string>>;
  /**
   * A path the server answers with - a backup's download, a file's preview -
   * as the browser opens it: the API's origin before it, where the site's API
   * is not the page's (genshin's backend address). Default: as it is.
   */
  resolveUrl?: (path: string) => string;
  /** The pages' dates and times; default en-GB in the browser's zone: '6 Oct 2026, 10:01'. */
  formatDate?: (iso: string) => string;
  /**
   * Sends the person through the IAM's sign-in again - asked for the password
   * even with a session there - and back to this page: the proof the sites
   * ask for before a backup is made, downloaded, deleted or restored (403
   * reauth_required). With the auth module: `() => auth.signIn({ prompt: 'login' })`.
   */
  signInAgain?: () => unknown;
  /** A person's page in the site's admin panel, for an id the logs name: a router link (`['/admin/people', id]`), or null for none. */
  personLink?: (id: number | string) => string | readonly unknown[] | null;
  /** The site's words for a failure (the IAM's adminErrorText); null or '' for the pages' own. */
  failureText?: (failure: AdminFailure) => string | null | undefined;
  /** The site's Migrations page, offered while a tool's table waits for an update: '/admin/migrations'. */
  migrationsRoute?: string | null;
  /** What the pages call the site: 'the IAM'. Default 'the site'. */
  siteName?: string;
  /** The names of feedback's extra fields (the PHP half's `fields`) on the admin page: `{ steps: 'Steps to reproduce' }`. */
  feedbackFields?: Readonly<Record<string, string>>;
  /**
   * The languages the site's pages are read in, by their own names - the Site settings page (0.11.0) gives each a
   * field for the maintenance page's and the announcement's words: with the translations module,
   * `() => i18n.languages().map((language) => ({ code: language.code, name: language.native_name }))`. English and
   * Slovak by default.
   */
  languages?: () => readonly { code: string; name: string }[];
  /** Said on the Backups page where restoring is switched off, after its own sentence - the site's reason (the IAM's). */
  restoreOffText?: string | null;
}

export const ANOTOKI_ADMIN_CONFIG = new InjectionToken<AnotokiAdminConfig>('ANOTOKI_ADMIN_CONFIG');

/**
 * Configures the admin tools' pages. The factory runs in an injection
 * context, so it can inject the site's own services:
 *
 * ```ts
 * provideAnotokiAdmin(() => {
 *   const auth = inject(AnotokiAuth);
 *   return { isAdmin: () => auth.isAdmin(), signInAgain: () => auth.signIn({ prompt: 'login' }), personLink: (id) => ['/admin/people', id] };
 * })
 * ```
 *
 * The pages themselves are entry points of their own (@anotoki/lib/admin/errors,
 * /audit, /feedback, /backups, /files), each on a lazy route.
 */
export function provideAnotokiAdmin(factory: () => AnotokiAdminConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_ADMIN_CONFIG, useFactory: factory }]);
}

export const DEFAULT_ADMIN_API = '/api/admin';

/** A tool's routes: `paths[tool]`, else `{apiBase}/{tool}` - without a trailing slash. */
export function adminBase(config: AnotokiAdminConfig | null | undefined, tool: AdminTool): string {
  const own = config?.paths?.[tool];
  const base = own || `${(config?.apiBase || DEFAULT_ADMIN_API).replace(/\/+$/, '')}/${tool}`;
  return base.replace(/\/+$/, '');
}
