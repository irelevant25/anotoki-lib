/** One entry of the log (Anotoki\Lib\Audit\Http\AuditRoutes): who did what to what. */
export interface AuditEntry {
  id: number;
  /** ISO 8601 UTC. */
  created_at: string;
  /** The site's id of the person who acted; null for the system (a sweep, a command line). */
  actor_id: number | null;
  /** Their name, from the site; null when it does not know it. */
  actor_username: string | null;
  actor_session: string | null;
  /** `user.roles_set`, `backup.created`, ... */
  action: string;
  target_type: string | null;
  target_id: string | null;
  /** What the target belongs to (genshin: the character a talent is of). */
  scope_type: string | null;
  scope_id: string | null;
  /** Whatever was recorded with it: a change's before and after, ... */
  details: unknown;
  /** Only where the site keeps it (the IAM). */
  ip: string | null;
}

/** GET {audit}?actor=&action=&target_type=&target_id=&scope_type=&scope_id=&from=&to=&page= */
export interface AuditPage {
  total: number;
  page: number;
  pageSize: number;
  items: AuditEntry[];
}

/** GET {audit}/facets */
export interface AuditFacets {
  actions: string[];
  target_types: string[];
  scope_types: string[];
  actors: { id: number; username: string | null }[];
}

/** The filters, each a query parameter of the page's address and of the request. */
export const AUDIT_FILTERS = ['actor', 'action', 'target_type', 'target_id', 'scope_type', 'scope_id', 'from', 'to'] as const;

export type AuditFilterName = (typeof AUDIT_FILTERS)[number];

export type AuditFilter = Record<AuditFilterName, string>;

/** One line of what a change did: a field, what it was, what it became. */
export interface ChangeRow {
  field: string;
  before: string;
  after: string;
  /** False where the two read the same: shown, quieter. */
  changed: boolean;
}

/** An entry's details as the page shows them: a change's rows, and every other part as a fact. */
export interface ReadDetails {
  changes: ChangeRow[];
  facts: { name: string; value: string }[];
}
