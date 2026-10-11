/** One line of the log, as the server reads it back (Anotoki\Lib\ErrorLog\ErrorLogReader). */
export interface ErrorLogEntry {
  /** 1; 0 for a line written before the library (genshin's). */
  v: number;
  /** ISO 8601 UTC, to the millisecond. */
  at: string;
  source: 'server' | 'php' | 'client' | string;
  level: 'error' | 'warning' | 'notice';
  /** The answer's status; 0 where there was none (a PHP warning). */
  status: number;
  type: string;
  code: string | null;
  /** Redacted where it was written. */
  message: string;
  file: string | null;
  line: number | null;
  method: string | null;
  route: string | null;
  path: string | null;
  user_id: number | string | null;
  /** 12 hex of a keyed hash of the address - never the address. */
  client: string | null;
  /** At most 12 frames, never a call's arguments. */
  trace: string[] | null;
  fingerprint: string;
  /** genshin's own lines only: the address they were written with. */
  ip?: string | null;
}

/** The lines of one fingerprint: one row of the page. */
export interface ErrorLogGroup {
  fingerprint: string;
  level: ErrorLogEntry['level'];
  status: number;
  type: string;
  code: string | null;
  message: string;
  file: string | null;
  line: number | null;
  route: string | null;
  source: string;
  count: number;
  first_at: string;
  last_at: string;
  /** The paths it came through, the busiest first (at most 8). */
  paths: string[];
  /** The newest occurrence, whole. */
  latest: ErrorLogEntry;
}

export interface ErrorLogTally {
  key: string;
  errors: number;
  warnings: number;
  notices: number;
}

/** GET {errors}?days=&level=&status=&search= */
export interface ErrorLogReport {
  total: number;
  errors: number;
  warnings: number;
  notices: number;
  distinct: number;
  /** More lines were there than the 2,000 newest read. */
  truncated: boolean;
  /** The dates that have a file. */
  days: string[];
  daily: ErrorLogTally[];
  statuses: ErrorLogTally[];
  groups: ErrorLogGroup[];
  /** Lines only counted - the log was full, or their kind had its lines for the day - by UTC date. */
  dropped: Record<string, number>;
}
