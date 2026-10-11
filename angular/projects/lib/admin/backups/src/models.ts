export type BackupKind = 'daily' | 'manual' | 'before-migration' | 'before-restore';

/** One backup, as the list has it (Anotoki\Lib\Backups\Http\BackupsRoutes) - its tables when asked for it alone. */
export interface BackupInfo {
  /** `YYYYMMDD-HHMMSSZ-<kind>-<32 hex>`: the name a restore's confirmation ends with. */
  id: string;
  site?: string;
  kind: BackupKind;
  created_at: string;
  library_version?: string;
  encrypted: boolean;
  /** 'complete'; 'unlisted' for a file put back by hand without its list entry. */
  status: string;
  file?: string;
  /** Bytes on disk. */
  size: number;
  /** The site's id of who made it; null for the ones made by themselves. */
  created_by: number | string | null;
  description: string | null;
  table_count?: number;
  rows?: number;
  duration_ms?: number;
  /** A manual one kept for more than 90 days. */
  stale?: boolean;
  /** Restoring it here can be done now: the site allows it and the schema is the backup's. */
  restorable?: boolean;
  tables?: { name: string; rows: number; bytes: number }[];
}

/** The status card's facts. */
export interface BackupsStatus {
  directory_writable: boolean;
  free_bytes: number | null;
  last_daily: string | null;
  /** This server's PHP can COPY a table through PDO: without it no backup is made. */
  copy_available: boolean;
  encrypted: boolean;
  cipher_available: boolean;
  /** The site lets a backup be restored here (the IAM: no). */
  restore_enabled: boolean;
  /** ... and nothing in the database stands in the way. */
  restorable: boolean;
  problems: string[];
  count: number;
  total_bytes: number;
  database_bytes: number | null;
}

/** GET {backups} */
export interface BackupsAnswer {
  backups: BackupInfo[];
  status: BackupsStatus;
}

/** GET {backups}/proof - what the page asks for before a backup is made, downloaded, deleted or restored. */
export type ProofKind = 'password' | 'recent_sign_in';

/** GET {backups}/{id}/preview - what a restore would do, table by table. */
export interface RestorePreview {
  id: string;
  kind: BackupKind;
  created_at: string;
  restorable: boolean;
  /** Why it cannot be restored here, in the server's words. */
  reasons: string[];
  /** Tables a restore never touches (the bookkeeping, the audit log, the site's own). */
  kept: string[];
  live: { rows: number; tables: number };
  backup: { rows: number; tables: number };
  /** The rows there now that a restore takes away. */
  lost: number;
  /** The tables whose rows would change: now, in the backup (null: not in it), now less the backup. */
  differences: { name: string; live: number; backup: number | null; delta: number }[];
}

/** POST {backups}/{id}/restore */
export interface RestoreResult {
  restored: string;
  /** The backup of what was there, made first: the way back. */
  before_restore: string;
  tables: number;
  rows: number;
  duration_ms: number;
  /** The site's work after a restore failed (the restore itself stands). */
  after_restore_error: string | null;
}
