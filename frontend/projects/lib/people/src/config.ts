import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/**
 * A person as the People page lists them: GET {apiBase}'s `people` (the PHP
 * half's PeopleRoutes::admin()). `sub` is the IAM's id, a decimal string as the
 * tokens carry it; the times are ISO 8601 UTC, null where the site keeps none
 * (a site without a last-seen column); `anonymized_at` is when the IAM deleted
 * the account (the name is its placeholder then, `deleted-{sub}`); `iam_url`
 * the account's page in the IAM's admin panel. The site's own columns are
 * fields of their own, by their keys.
 */
export interface PeoplePerson {
  sub: string;
  name: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  anonymized_at: string | null;
  iam_url: string;
  [column: string]: unknown;
}

/** A column of the site's own (its PeopleColumn): a count, text, or a time. */
export interface PeopleColumn {
  key: string;
  label: string;
  kind: 'count' | 'text' | 'time';
}

/** Where the scrub of the IAM's deleted accounts stands on this site: null until the library's tables are there. */
export interface PeopleSync {
  since: string | null;
  checked_at: string | null;
  ok_at: string | null;
  error: string | null;
  scrubbed: number;
}

/** The site's visitors line (its `visitors` closure): how many, and whatever else the site counts. */
export interface PeopleVisitors {
  count: number;
  [more: string]: unknown;
}

/** GET {apiBase}?q=&page= - one page of people, newest seen first. */
export interface PeopleList {
  people: PeoplePerson[];
  columns: PeopleColumn[];
  total: number;
  page: number;
  page_size: number;
  visitors: PeopleVisitors | null;
  sync: PeopleSync | null;
  /** Everything the module needs is in the database: the site's table, its anonymized_at, the library's tables. */
  ready: boolean;
  /** What is missing, in the server's English. */
  problems: string[];
}

/** DELETE {apiBase}/{sub} - what the site's delete hook took, by label; and a note of its own. */
export interface PeopleDeleted {
  deleted: Record<string, number>;
  note?: string | null;
}

/** POST {apiBase}/sync - the scrub run now, and where it stands after it. */
export interface PeopleSyncRun {
  run: {
    state: 'done' | 'more' | 'stopped' | 'unreachable' | 'busy' | 'not_ready';
    handled: number;
    scrubbed: number;
    error: string | null;
    problems: string[];
  };
  sync: PeopleSync | null;
}

/** The question before a delete, in the site's words. */
export interface PeopleDeleteQuestion {
  title: string;
  message: string;
  /** The yes: "Delete" by default. */
  confirm?: string;
}

/** Deleting what the site keeps of a person - offered only where the site's PeopleRoutes has its delete hook. */
export interface PeopleDeleteConfig {
  /** The button's words in a row: "Delete their progress". Default "Delete their data". */
  label?: string;
  /**
   * The question before a delete, named by the person and what the site keeps of them - its columns' values on
   * the row. Default: the family's, which names the counts.
   */
  question?: (person: PeoplePerson, columns: readonly PeopleColumn[]) => PeopleDeleteQuestion;
  /** Whether there is anything to delete (the build analyzer: not at no game accounts and no imports). Default: yes. */
  allowed?: (person: PeoplePerson) => boolean;
  /** After a delete went through: the site's own work (Piano Academy reloads its progress when it was the reader's own). */
  done?: (person: PeoplePerson, answer: PeopleDeleted) => unknown;
}

/** What a site tells the People page, through provideAnotokiPeople(). The functions run in an injection context. */
export interface AnotokiPeopleConfig {
  /** The site's PeopleRoutes::admin() base. Default '/api/admin/people'. */
  apiBase?: string;
  /** Whether the reader is the site's ADMIN, from the token (a signal works); default yes - the route's adminGuard decides. */
  isAdmin?: () => boolean;
  /** The reader's IAM id, which marks their own row "you": `() => inject(AnotokiAuth).sub()`. */
  me?: () => string | null;
  /** The page's lead, in the site's words: whom it keeps and what. Default the family's sentence. */
  lead?: string;
  /** A moment as the page shows it. Default en-GB in the browser's time zone, '6 Oct 2026, 10:01'. */
  formatDate?: (iso: string) => string;
  /** Deleting a person's data, with the site's words; none: no delete (a site without the delete hook). */
  delete?: PeopleDeleteConfig | null;
  /** The visitors line from the answer's `visitors`; null says nothing. Default "{n} visitors - people using the site without signing in." */
  visitorsLine?: (visitors: PeopleVisitors) => string | null;
  /** The site's route showing <anotoki-migrations-page>: linked while the database lacks what the page needs. */
  migrationsRoute?: string | null;
}

export const ANOTOKI_PEOPLE_CONFIG = new InjectionToken<AnotokiPeopleConfig>('ANOTOKI_PEOPLE_CONFIG');

/**
 * Configures the People page (@anotoki/lib/people/page). The factory runs in an
 * injection context, so it can inject the site's own services; so do the
 * functions it gives. Without it the page takes the defaults: the family's
 * words, '/api/admin/people', and no delete.
 *
 * ```ts
 * provideAnotokiPeople(() => {
 *   const auth = inject(AnotokiAuth);
 *   return {
 *     me: () => auth.sub(),
 *     lead: 'Everybody who signed in and whom Piano Academy keeps anything of, the most recently seen first.',
 *     delete: { label: 'Delete their progress', done: (person) => person.sub === auth.sub() && inject(ProgressStore).reload() },
 *     visitorsLine: (visitors) => `${visitors.count} visitors, practising without signing in.`,
 *   };
 * })
 * ```
 */
export function provideAnotokiPeople(factory: () => AnotokiPeopleConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ANOTOKI_PEOPLE_CONFIG, useFactory: factory }]);
}

export const DEFAULT_PEOPLE_API = '/api/admin/people';
