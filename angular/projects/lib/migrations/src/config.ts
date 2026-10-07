import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/**
 * Where the site stands, as its pages know it: 'unknown' until the server was
 * asked (the pages show as usual meanwhile), then what the server says.
 */
export type SiteState = 'unknown' | 'ready' | 'update-pending' | 'not-set-up' | 'unavailable';

/** The words visitors read while the site is not ready; built in for 'en' and 'sk'. */
export interface SiteStatusWords {
  updatingTitle: string;
  updatingText: string;
  unavailableTitle: string;
  unavailableText: string;
  notSetUpTitle: string;
  notSetUpText: string;
  openSetup: string;
  tryAgain: string;
  signIn: string;
}

/** What a site tells the module, through provideAnotokiMigrations(). */
export interface AnotokiMigrationsConfig {
  /** The public status path, '/api/site-status'. */
  statusUrl: string;
  /** The admin migrations routes, '/api/admin/migrations'. */
  apiBase: string;
  /** The site's route that shows <anotoki-migrations-page>, '/admin/migrations'. */
  migrationsRoute: string;
  /** The setup page, offered only while the site was never installed; default '/setup.php'. */
  setupUrl?: string;
  /** Whether the person is the site's ADMIN, from the token (a signal works). */
  isAdmin: () => boolean;
  isSignedIn: () => boolean;
  /** Starts the site's sign-in, returning to the current page. */
  signIn: () => unknown;
  /** The page's language; 'en' and 'sk' are built in, others read English. */
  language: () => string;
  /** Per language, words to use instead of the built-in ones. */
  words?: Record<string, Partial<SiteStatusWords>>;
  /** The Migrations page's dates; default en-GB, '6 Oct 2026, 10:01'. */
  formatDate?: (iso: string) => string;
  /** After an Apply leaves nothing applicable: reload the strings, resume the boot. */
  onUpToDate?: () => unknown;
  /** How often the waiting pages ask again, in seconds; default 30. */
  retrySeconds?: number;
}

export const ANOTOKI_MIGRATIONS_CONFIG = new InjectionToken<AnotokiMigrationsConfig>('ANOTOKI_MIGRATIONS_CONFIG');

/**
 * Configures the module. The factory runs in an injection context, so it can
 * inject the site's own services (its AuthService, its translations).
 */
export function provideAnotokiMigrations(factory: () => AnotokiMigrationsConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_MIGRATIONS_CONFIG, useFactory: factory }]);
}

export const DEFAULT_SETUP_URL = '/setup.php';
export const DEFAULT_RETRY_SECONDS = 30;

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** '2026-10-06T10:01:02Z' -> '6 Oct 2026, 10:01' (in the browser's time zone). */
export function defaultFormatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}
