import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { provideLibraryWords } from '@anotoki/lib/ui/config';
import { SITE_STATUS_LIBRARY_WORDS } from '@anotoki/lib/words/site-status';

/**
 * Where the site stands, as its pages know it: 'unknown' until the server was
 * asked (the pages show as usual meanwhile), then what the server says -
 * 'maintenance' (0.11.0) while its administrators have closed it (the site
 * settings' "Getting in").
 */
export type SiteState = 'unknown' | 'ready' | 'update-pending' | 'not-set-up' | 'unavailable' | 'maintenance';

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
  /**
   * Starts the site's sign-in, returning to the current page - or to `returnTo`
   * where one is given (0.11.0: the staff sign-in, while the site is closed for
   * maintenance, returns to '/'): `(returnTo) => auth.signIn({ returnTo })`.
   */
  signIn: (returnTo?: string) => unknown;
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
  /**
   * The routes anybody reaches while the site is closed for maintenance (0.11.0), each with everything under it: the
   * sign-in's way back (the auth module's callback and its failure's screen), the legal pages, About and Support -
   * what the site keeps is said to whoever asks. The family's paths by default (DEFAULT_OPEN_WHILE_CLOSED).
   */
  openWhileClosed?: readonly string[];
  /** Where an administrator signs in while the site is closed for maintenance: the status page offers Sign in there; '/staff'. */
  staffRoute?: string;
}

export const ANOTOKI_MIGRATIONS_CONFIG = new InjectionToken<AnotokiMigrationsConfig>('ANOTOKI_MIGRATIONS_CONFIG');

/**
 * Configures the module. The factory runs in an injection context, so it can
 * inject the site's own services (its AuthService, its translations).
 *
 * It registers the status page's words (`anotoki.siteStatus.*`) with the
 * translations module: they reach a site's words with this module, and with
 * nothing else.
 */
export function provideAnotokiMigrations(factory: () => AnotokiMigrationsConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_MIGRATIONS_CONFIG, useFactory: factory }, provideLibraryWords(SITE_STATUS_LIBRARY_WORDS)]);
}

export const DEFAULT_SETUP_URL = '/setup.php';
export const DEFAULT_RETRY_SECONDS = 30;
export const DEFAULT_STAFF_ROUTE = '/staff';
/** The sign-in's way back, the legal pages, About and Support: the family's paths (the auth module's, the legal module's). */
export const DEFAULT_OPEN_WHILE_CLOSED: readonly string[] = ['/auth', '/terms', '/privacy', '/contact', '/about', '/support'];
