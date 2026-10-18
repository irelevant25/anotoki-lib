import { HttpErrorResponse, HttpEvent, HttpEventType, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import type { AuditEntry } from '@anotoki/lib/admin/audit';
import type { BackupInfo, BackupsStatus } from '@anotoki/lib/admin/backups';
import type { ErrorLogEntry, ErrorLogGroup } from '@anotoki/lib/admin/errors';
import type { FeedbackMessage, FeedbackStatus } from '@anotoki/lib/admin/feedback';
import type { FileEntry, FileRootInfo, TrashItem } from '@anotoki/lib/admin/files';
import { Observable, concat, delay, of, throwError } from 'rxjs';

/*
 * The showcase's imagined server for the admin tools and the feedback form: the
 * routes the PHP half answers (Anotoki\Lib\ErrorLog, Audit, Feedback, Backups,
 * Files), in their wire format, answered from memory - with a refusal where
 * the PHP half would give one. Never published.
 *
 * ?iam=1: the IAM's backups (encrypted, restoring switched off, the password as the proof).
 * ?proof=password: the password as the proof on a site's backups.
 * ?unavailable=1: the audit log's and the feedback's tables wait for an update (503 feature_unavailable).
 */

const params = new URLSearchParams(location.search);
export const IAM_CASE = params.get('iam') === '1';
const PASSWORD_PROOF = IAM_CASE || params.get('proof') === 'password';
const UNAVAILABLE = params.get('unavailable') === '1';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const started = Date.now();
const ago = (ms: number) => new Date(started - ms).toISOString();
const day = (daysAgo: number) => new Date(started - daysAgo * DAY).toISOString().slice(0, 10);

// ── Errors ───────────────────────────────────────────────────────────────────

function entry(overrides: Partial<ErrorLogEntry>): ErrorLogEntry {
  return {
    v: 1,
    at: ago(2 * HOUR),
    source: 'server',
    level: 'error',
    status: 500,
    type: 'RuntimeException',
    code: 'server_error',
    message: '',
    file: null,
    line: null,
    method: 'GET',
    route: null,
    path: null,
    user_id: null,
    client: '3fa2c1b09e7d',
    trace: null,
    fingerprint: '000000000000',
    ...overrides,
  };
}

interface Cause {
  group: Omit<ErrorLogGroup, 'latest' | 'count' | 'first_at' | 'last_at' | 'paths'>;
  latest: ErrorLogEntry;
  /** How many on each of the last seven days, today last. */
  perDay: number[];
  paths: string[];
}

function cause(group: Cause['group'], latest: Partial<ErrorLogEntry>, perDay: number[], paths: string[]): Cause {
  return { group, latest: entry({ ...group, ...latest, fingerprint: group.fingerprint }), perDay, paths };
}

let causes: Cause[] = [
  cause(
    {
      fingerprint: 'a1b2c3d4e5f6',
      level: 'error',
      status: 500,
      type: 'PDOException',
      code: 'server_error',
      message: 'SQLSTATE[23505]: Unique violation: duplicate key value violates unique constraint "people_name_key" [detail]',
      file: 'api/routes/admin.php',
      line: 412,
      route: '/api/admin/people/{id}',
      source: 'server',
    },
    {
      method: 'PUT',
      path: '/api/admin/people/42',
      user_id: 7,
      trace: [
        'api/routes/admin.php:412 PDOStatement->execute()',
        'api/people.php:88 savePerson()',
        'vendor/slim/slim/Slim/Handlers/Strategies/RequestResponse.php:38 {closure}()',
        'vendor/slim/slim/Slim/Routing/Route.php:362 Slim\\Handlers\\Strategies\\RequestResponse->__invoke()',
      ],
    },
    [2, 0, 4, 1, 3, 0, 4],
    ['/api/admin/people/42', '/api/admin/people/9', '/api/admin/people/131'],
  ),
  cause(
    { fingerprint: '0f0f0f0f0f0f', level: 'warning', status: 404, type: 'HttpNotFoundException', code: 'not_found', message: 'Not found.', file: null, line: null, route: null, source: 'server' },
    { path: '/wp-login.php', method: 'GET' },
    [9, 12, 7, 15, 11, 8, 14],
    ['/wp-login.php', '/.env', '/xmlrpc.php'],
  ),
  cause(
    {
      fingerprint: 'c0ffee000001',
      level: 'warning',
      status: 0,
      type: 'Warning',
      code: null,
      message: 'Undefined array key "rarity"',
      file: 'api/characters.php',
      line: 57,
      route: '/api/characters/{id}',
      source: 'php',
    },
    { path: '/api/characters/12', trace: ['api/characters.php:57 characterCard()', 'api/routes/site.php:120 {closure}()'] },
    [0, 1, 0, 0, 2, 1, 1],
    ['/api/characters/12'],
  ),
  cause(
    {
      fingerprint: 'b00b1e5ca1e5',
      level: 'error',
      status: 0,
      type: 'TypeError',
      code: null,
      message: "Cannot read properties of undefined (reading 'name')",
      file: null,
      line: null,
      // As ErrorLog::recordClient() writes a page's own error: the report's own request (POST /api/client-errors) as
      // its method and route, the page's path as its path.
      route: '/api/client-errors',
      source: 'client',
    },
    { path: '/characters/amber', method: 'POST', user_id: 9, trace: ['at CharacterPage.title (main-4f2a.js:1:20431)', 'at executeTemplate (main-4f2a.js:1:88213)'] },
    [0, 0, 0, 1, 0, 0, 2],
    ['/characters/amber', '/characters/diluc'],
  ),
  cause(
    {
      fingerprint: 'deadbeef0042',
      level: 'error',
      status: 504,
      type: 'Response',
      code: 'timeout',
      message: 'The database did not answer in time.',
      file: null,
      line: null,
      route: '/api/admin/backups',
      source: 'server',
    },
    { method: 'POST', path: '/api/admin/backups', user_id: 7 },
    [1, 0, 0, 0, 0, 0, 0],
    ['/api/admin/backups'],
  ),
];

function errorReport(request: HttpRequest<unknown>): object {
  const days = Math.max(1, Math.min(30, Number(request.params.get('days')) || 7));
  const level = request.params.get('level') ?? '';
  const status = request.params.get('status') ?? '';
  const search = (request.params.get('search') ?? '').toLowerCase();
  const shown = Math.min(days, 7);
  const matches = (each: Cause) =>
    (!level || each.group.level === level) &&
    (!status || String(each.group.status) === status) &&
    (!search || [each.group.type, each.group.code, each.group.message, each.group.route, each.group.file, ...each.paths].join('\n').toLowerCase().includes(search));
  const chosen = causes.filter(matches);
  const counted = (each: Cause) => each.perDay.slice(7 - shown).reduce((sum, count) => sum + count, 0);
  const groups = chosen
    .map((each) => ({
      ...each.group,
      count: counted(each),
      first_at: ago((shown - 0.5) * DAY),
      last_at: each.latest.at,
      paths: each.paths,
      latest: each.latest,
    }))
    .filter((group) => group.count > 0)
    .sort((a, b) => b.count - a.count);
  const daily = Array.from({ length: days }, (_, index) => {
    const back = days - 1 - index;
    const tally = { key: day(back), errors: 0, warnings: 0, notices: 0 };
    for (const each of chosen) {
      const count = back < 7 ? each.perDay[6 - back] : 0;
      tally[each.group.level === 'warning' ? 'warnings' : each.group.level === 'notice' ? 'notices' : 'errors'] += count;
    }
    return tally;
  });
  const statuses = new Map<string, { key: string; errors: number; warnings: number; notices: number }>();
  for (const group of groups) {
    const key = String(group.status);
    const tally = statuses.get(key) ?? { key, errors: 0, warnings: 0, notices: 0 };
    tally[group.level === 'warning' ? 'warnings' : group.level === 'notice' ? 'notices' : 'errors'] += group.count;
    statuses.set(key, tally);
  }
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return {
    total,
    errors: groups.filter((group) => group.level === 'error').reduce((sum, group) => sum + group.count, 0),
    warnings: groups.filter((group) => group.level === 'warning').reduce((sum, group) => sum + group.count, 0),
    notices: 0,
    distinct: groups.length,
    truncated: false,
    days: causes.length ? [day(0), day(1), day(2)] : [],
    daily,
    statuses: [...statuses.values()].sort((a, b) => Number(a.key) - Number(b.key)),
    groups,
    dropped: causes.length ? { [day(3)]: 41 } : {},
  };
}

function occurrences(fingerprint: string): ErrorLogEntry[] {
  const found = causes.find((each) => each.group.fingerprint === fingerprint);
  if (!found) {
    return [];
  }
  return found.paths.flatMap((path, index) => [
    { ...found.latest, at: ago((index + 1) * 3 * HOUR), path },
    { ...found.latest, at: ago((index + 2) * 7 * HOUR), path, user_id: null, client: '9be41d07aa21' },
  ]);
}

// ── Audit ────────────────────────────────────────────────────────────────────

const ACTORS = [
  { id: 7, username: 'mira' },
  { id: 9, username: 'jonas' },
];

const auditEntries: AuditEntry[] = Array.from({ length: 64 }, (_, index) => {
  const at = ago(index * 5 * HOUR + 17 * 60_000);
  const actor = index % 5 === 4 ? null : ACTORS[index % 2];
  const kinds: Omit<AuditEntry, 'id' | 'created_at' | 'actor_id' | 'actor_username' | 'actor_session' | 'ip'>[] = [
    { action: 'user.roles_set', target_type: 'user', target_id: '42', scope_type: null, scope_id: null, details: { before: { roles: ['MEMBER'] }, after: { roles: ['ADMIN', 'MEMBER'] } } },
    {
      action: 'content.update',
      target_type: 'talents',
      target_id: String(80 + (index % 7)),
      scope_type: 'characters',
      scope_id: '12',
      details: { name: { old: 'Sharpshooter', new: 'Sharpshooter (passive)' }, level: { old: 4, new: 4 } },
    },
    { action: 'feedback.status_changed', target_type: 'feedback', target_id: String(30 - (index % 9)), scope_type: null, scope_id: null, details: { from: 'new', to: 'resolved' } },
    {
      action: 'backup.created',
      target_type: 'backup',
      target_id: `20261010-0300${String(index % 60).padStart(2, '0')}Z-daily-0123456789abcdef0123456789abcdef`,
      scope_type: null,
      scope_id: null,
      details: { kind: 'daily', size: 1_572_864, tables: 18 },
    },
    {
      action: 'file.uploaded',
      target_type: 'file',
      target_id: 'assets:Characters/amber.png',
      scope_type: null,
      scope_id: null,
      details: { root: 'assets', path: 'Characters/amber.png', size: 20_480, replaced: false },
    },
    { action: 'translations.saved', target_type: null, target_id: null, scope_type: null, scope_id: null, details: { changed: 3, keys: ['home.title', 'home.lead', 'nav.reviews'] } },
    { action: 'migrations.applied', target_type: null, target_id: null, scope_type: null, scope_id: null, details: { files: ['site/004_announcements.sql'] } },
    { action: 'errors.cleared', target_type: 'error_log', target_id: null, scope_type: null, scope_id: null, details: { files: 3, before: day(0) } },
  ];
  const kind = kinds[index % kinds.length];
  return {
    id: 500 - index,
    created_at: at,
    actor_id: actor?.id ?? null,
    actor_username: actor?.username ?? null,
    actor_session: actor ? `sess-${(index * 7919).toString(16).slice(-6)}` : null,
    ip: actor && IAM_CASE ? '203.0.113.5' : null,
    ...kind,
  };
});

function auditPage(request: HttpRequest<unknown>): object {
  const get = (name: string) => (request.params.get(name) ?? '').trim();
  const from = get('from');
  const to = get('to');
  const items = auditEntries.filter(
    (each) =>
      (!get('actor') || String(each.actor_id) === get('actor')) &&
      (!get('action') || each.action.startsWith(get('action'))) &&
      (!get('target_type') || each.target_type === get('target_type')) &&
      (!get('target_id') || each.target_id === get('target_id')) &&
      (!get('scope_type') || each.scope_type === get('scope_type')) &&
      (!get('scope_id') || each.scope_id === get('scope_id')) &&
      (!from || each.created_at.slice(0, 10) >= from) &&
      (!to || each.created_at.slice(0, 10) <= to),
  );
  const page = Math.max(1, Number(request.params.get('page')) || 1);
  return { total: items.length, page, pageSize: 50, items: items.slice((page - 1) * 50, page * 50) };
}

// ── Feedback ─────────────────────────────────────────────────────────────────

const feedback: FeedbackMessage[] = Array.from({ length: 34 }, (_, index) => {
  const kinds = ['bug', 'idea', 'other'];
  const statuses: FeedbackStatus[] = ['new', 'new', 'read', 'resolved', 'read', 'spam'];
  const texts = [
    { subject: 'The talent list is empty', message: 'Opening Amber shows no talents at all.\nIt worked yesterday; today the list is empty on my phone and on my laptop.' },
    { subject: null, message: 'A dark version of the map would be lovely at night - the white hurts my eyes after ten.' },
    { subject: 'Thank you', message: 'Just wanted to say the new character pages are great. Keep it up!' },
    { subject: 'The quiz counts a right answer as wrong', message: 'Question 4 of the music quiz: I picked "Mondstadt" and it said wrong, though the answer shown was Mondstadt too.' },
  ];
  const text = texts[index % texts.length];
  const signedIn = index % 3 === 0;
  return {
    id: 100 - index,
    created_at: ago(index * 9 * HOUR + 40 * 60_000),
    updated_at: ago(index * 9 * HOUR),
    kind: kinds[index % 3],
    status: statuses[index % statuses.length],
    section: index % 2 === 0 ? 'Characters' : null,
    subject: text.subject,
    message: text.message,
    details: (index % 3 === 0 ? { steps: 'Open Amber, then Talents.', expected: 'Her three talents.' } : {}) as Record<string, string>,
    contact_email: index % 4 === 1 ? 'reader@example.test' : null,
    user_id: signedIn ? 42 : null,
    user_name: signedIn ? 'reader42' : null,
    page: index % 2 === 0 ? '/characters/amber' : '/map',
    language: index % 2 === 0 ? 'sk' : 'en',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
    handled_by: null,
    handled_by_name: null,
    handled_at: null,
  };
});

function feedbackFacets(): object {
  const byStatus: Record<string, number> = { new: 0, read: 0, resolved: 0, spam: 0 };
  const byKind: Record<string, number> = { bug: 0, idea: 0, other: 0 };
  for (const message of feedback) {
    byStatus[message.status]++;
    byKind[message.kind]++;
  }
  return { kinds: ['bug', 'idea', 'other'], statuses: ['new', 'read', 'resolved', 'spam'], sections: ['Characters', 'Weapons', 'The map'], fields: { steps: 5000, expected: 2000 }, byStatus, byKind };
}

function feedbackList(request: HttpRequest<unknown>): object {
  const get = (name: string) => (request.params.get(name) ?? '').trim();
  const search = get('search').toLowerCase();
  const items = feedback.filter(
    (message) =>
      (!get('status') || message.status === get('status')) &&
      (!get('kind') || message.kind === get('kind')) &&
      (!get('section') || message.section === get('section')) &&
      (!search || [message.subject, message.message, message.contact_email].join('\n').toLowerCase().includes(search)),
  );
  const page = Math.max(1, Number(request.params.get('page')) || 1);
  return { total: items.length, page, pageSize: 25, items: items.slice((page - 1) * 25, page * 25) };
}

// ── Backups ──────────────────────────────────────────────────────────────────

const hex = (seed: number) => Array.from({ length: 32 }, (_, index) => ((seed * 31 + index * 7) % 16).toString(16)).join('');
const backupId = (msAgo: number, kind: BackupInfo['kind'], seed: number) => {
  const at = new Date(started - msAgo).toISOString();
  return `${at.slice(0, 10).replace(/-/g, '')}-${at.slice(11, 19).replace(/:/g, '')}Z-${kind}-${hex(seed)}`;
};

function backup(msAgo: number, kind: BackupInfo['kind'], seed: number, overrides: Partial<BackupInfo> = {}): BackupInfo {
  return {
    id: backupId(msAgo, kind, seed),
    kind,
    created_at: ago(msAgo),
    encrypted: IAM_CASE,
    status: 'complete',
    size: 1_400_000 + seed * 37_000,
    created_by: kind === 'manual' ? 7 : null,
    created_by_name: kind === 'manual' ? 'mira' : null,
    sealed: true,
    description: null,
    table_count: 18,
    rows: 52_000 + seed * 120,
    duration_ms: 2300 + seed * 40,
    stale: false,
    restorable: !IAM_CASE,
    ...overrides,
  };
}

let backups: BackupInfo[] = [
  backup(3 * HOUR, 'daily', 1),
  backup(1 * DAY + 3 * HOUR, 'daily', 2),
  backup(2 * DAY + 5 * HOUR, 'manual', 3, { description: 'Before the price changes' }),
  backup(3 * DAY + 3 * HOUR, 'before-migration', 4, { restorable: false }),
  backup(5 * DAY + 3 * HOUR, 'before-restore', 5, { description: 'Before restoring 20261005-030000Z-daily-…' }),
  backup(100 * DAY, 'manual', 6, { description: 'The old site, before the move', stale: true, sealed: false, restorable: false }),
];

function backupsStatus(): BackupsStatus {
  return {
    directory_writable: true,
    free_bytes: 8.4 * 1024 ** 3,
    last_daily: backups.find((each) => each.kind === 'daily')?.created_at ?? null,
    copy_available: true,
    encrypted: IAM_CASE,
    cipher_available: true,
    restore_enabled: !IAM_CASE,
    restorable: !IAM_CASE,
    problems: [],
    count: backups.length,
    total_bytes: backups.reduce((sum, each) => sum + each.size, 0),
    database_bytes: 14.2 * 1024 ** 2,
  };
}

// ── Files ────────────────────────────────────────────────────────────────────

const ROOTS: FileRootInfo[] = [
  { name: 'assets', label: 'Assets', write: true, extensions: ['png', 'jpg', 'webp', 'wav', 'ogg', 'txt'], max_bytes: 50 * 1024 ** 2, snapshot: true },
  { name: 'exports', label: 'Exports', write: false, extensions: [], max_bytes: 52_428_800, snapshot: false },
];

const disk: Record<string, Map<string, { size: number; modified: number }>> = {
  assets: new Map([
    ['Characters/amber.png', { size: 20_480, modified: 2 }],
    ['Characters/lisa.png', { size: 19_201, modified: 3 }],
    ['Characters/kaeya.png', { size: 21_840, modified: 3 }],
    ['Characters/notes.txt', { size: 199, modified: 1 }],
    ['Music/theme.wav', { size: 8044, modified: 4 }],
    ['Music/battle.ogg', { size: 812_544, modified: 9 }],
    ['Weapons/favonius.webp', { size: 14_336, modified: 6 }],
    ['banner.png', { size: 102_400, modified: 1 }],
    ['readme.txt', { size: 199, modified: 12 }],
  ]),
  exports: new Map([
    ['2026-10-01.csv', { size: 48_213, modified: 10 }],
    ['2026-10-08.csv', { size: 51_002, modified: 3 }],
  ]),
};
const folders: Record<string, Set<string>> = { assets: new Set(['Characters', 'Music', 'Weapons', 'Banners']), exports: new Set() };
const NEW_FILES = new Set(['Characters/kaeya.png', 'Weapons/favonius.webp']);
const trash: Record<string, TrashItem[]> = {
  assets: [{ trashed: 'Characters/20261010-091500__old-amber.png', folder: 'Characters', name: 'old-amber.png', deleted_at: ago(DAY), size: 18_002 }],
  exports: [],
};

const PREVIEWS: Record<string, FileEntry['preview']> = { png: 'image', jpg: 'image', webp: 'image', wav: 'audio', ogg: 'audio', txt: 'text' };
const LINKS: Record<string, string> = { image: '/anotoki.png', audio: '/showcase/tone.wav', text: '/showcase/notes.txt', download: '/showcase/notes.txt' };

function fileEntry(path: string, facts: { size: number; modified: number }): FileEntry {
  const name = path.split('/').pop() ?? path;
  const extension = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
  const preview = PREVIEWS[extension] ?? 'download';
  return { name, path, folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', extension, size: facts.size, modified: ago(facts.modified * DAY), preview, url: LINKS[preview] };
}

function listing(root: string, request: HttpRequest<unknown>): object {
  const path = (request.params.get('path') ?? '').replace(/^\/+|\/+$/g, '');
  const search = (request.params.get('search') ?? '').trim().toLowerCase();
  const mode = request.params.get('mode') === 'new' ? 'new' : search ? 'search' : 'folder';
  const files = disk[root];
  const prefix = path ? `${path}/` : '';
  let entries: FileEntry[] = [];
  const subfolders = new Map<string, number>();
  if (mode === 'new') {
    entries = [...files].filter(([file]) => NEW_FILES.has(file)).map(([file, facts]) => fileEntry(file, facts));
  } else {
    for (const [file, facts] of files) {
      if (!file.startsWith(prefix)) {
        continue;
      }
      const rest = file.slice(prefix.length);
      if (search) {
        if ((rest.split('/').pop() ?? '').toLowerCase().includes(search)) {
          entries.push(fileEntry(file, facts));
        }
      } else if (!rest.includes('/')) {
        entries.push(fileEntry(file, facts));
      } else {
        const sub = rest.split('/')[0];
        subfolders.set(sub, (subfolders.get(sub) ?? 0) + 1);
      }
    }
    for (const folder of folders[root]) {
      if (folder.startsWith(prefix) && folder !== path && !search) {
        const sub = folder.slice(prefix.length).split('/')[0];
        subfolders.set(sub, subfolders.get(sub) ?? 0);
      }
    }
  }
  return {
    root,
    path,
    search,
    mode,
    folders: mode === 'folder' ? [...subfolders].sort().map(([name, count]) => ({ name, path: prefix + name, files: count })) : [],
    files: entries.sort((a, b) => a.name.localeCompare(b.name)),
    total: entries.length,
    page: 1,
    pageSize: 120,
    status:
      root === 'assets'
        ? { scanned_at: ago(6 * HOUR), previous_scanned_at: ago(3 * DAY), total: files.size, new_count: NEW_FILES.size }
        : { scanned_at: null, previous_scanned_at: null, total: 0, new_count: 0 },
  };
}

const RUNS_ON_SERVER = /\.(php\d?|phtml|phar|cgi|pl|py|sh|asp|aspx|jsp|html?|svg|js|exe)(\.|$)/i;

// ── The routes ───────────────────────────────────────────────────────────────

const ok = (body: unknown, wait = 250, status = 200): Observable<HttpEvent<unknown>> => of(new HttpResponse({ status, body })).pipe(delay(wait));
const refuse = (status: number, code: string, message: string, extra: Record<string, unknown> = {}, wait = 250): Observable<never> =>
  throwError(() => new HttpErrorResponse({ status, statusText: 'Refused', error: { code, message, ...extra } })).pipe(delay(wait));

/** The proof the IAM asks for: "secret" is the password here. */
function proofRefusal(body: Record<string, unknown> | null): Observable<never> | null {
  if (PASSWORD_PROOF && body?.['password'] !== 'secret') {
    return refuse(422, 'wrong_password', 'The current password is not right');
  }
  return null;
}

export const adminServer: HttpInterceptorFn = (request, next) => {
  const url = request.url;
  const body = (request.body ?? null) as Record<string, unknown> | null;

  // Feedback's public form.
  if (url === '/api/feedback' && request.method === 'POST') {
    const message = String(body?.['message'] ?? '');
    if (/too many/i.test(message)) {
      return refuse(429, 'too_many', 'That is a lot of messages in one hour. Try again later.', { retry_after: 1200 }, 600);
    }
    if (/offline/i.test(message)) {
      return refuse(503, 'feature_unavailable', 'Feedback is not open yet: a database update waits.', {}, 600);
    }
    return ok({ ok: true }, 700, 201);
  }

  if (!url.startsWith('/api/admin/')) {
    return next(request);
  }

  // The error log.
  if (url === '/api/admin/errors') {
    if (request.method === 'DELETE') {
      const before = request.params.get('before');
      const deleted = causes.length ? (before ? 2 : 3) : 0;
      causes = before ? causes.map((each) => ({ ...each, perDay: [...each.perDay.slice(0, 6).map(() => 0), each.perDay[6]] })) : [];
      return ok({ deleted }, 400);
    }
    return ok(errorReport(request), 350);
  }
  const fingerprint = /^\/api\/admin\/errors\/([0-9a-f]{12})$/.exec(url);
  if (fingerprint) {
    return ok(occurrences(fingerprint[1]), 300);
  }

  if (UNAVAILABLE && (url.startsWith('/api/admin/audit') || url.startsWith('/api/admin/feedback'))) {
    return refuse(503, 'feature_unavailable', 'A database update waits: apply it on the Migrations page.', {}, 300);
  }

  // The audit log.
  if (url === '/api/admin/audit') {
    return ok(auditPage(request), 300);
  }
  if (url === '/api/admin/audit/facets') {
    return ok({
      actions: [...new Set(auditEntries.map((each) => each.action))].sort(),
      target_types: ['backup', 'error_log', 'feedback', 'file', 'talents', 'user'],
      scope_types: ['characters'],
      actors: ACTORS,
    });
  }

  // Feedback.
  if (url === '/api/admin/feedback') {
    return ok(feedbackList(request), 300);
  }
  if (url === '/api/admin/feedback/facets') {
    return ok(feedbackFacets(), 200);
  }
  if (url === '/api/admin/feedback/unread') {
    return ok({ unread: feedback.filter((message) => message.status === 'new').length }, 150);
  }
  const message = /^\/api\/admin\/feedback\/(\d+)(\/status)?$/.exec(url);
  if (message) {
    const index = feedback.findIndex((each) => each.id === Number(message[1]));
    if (index < 0) {
      return refuse(404, 'not_found', 'There is no such message.');
    }
    if (request.method === 'DELETE') {
      feedback.splice(index, 1);
      return ok({ deleted: true });
    }
    if (message[2]) {
      const status = String(body?.['status'] ?? '');
      feedback[index] = { ...feedback[index], status: status as FeedbackStatus, handled_by: 7, handled_by_name: 'mira', handled_at: new Date().toISOString() };
    } else if (feedback[index].status === 'new') {
      feedback[index] = { ...feedback[index], status: 'read' };
    }
    return ok({ message: feedback[index] }, 200);
  }

  // Backups.
  if (url === '/api/admin/backups') {
    if (request.method === 'POST') {
      return (
        proofRefusal(body) ??
        (() => {
          const made = backup(0, 'manual', backups.length + 7, { created_at: new Date().toISOString(), description: (body?.['description'] as string) || null });
          backups = [made, ...backups];
          return ok({ backup: made }, 2400, 201);
        })()
      );
    }
    return ok({ backups: backups.map((each) => ({ ...each })), status: backupsStatus() }, 300);
  }
  if (url === '/api/admin/backups/proof') {
    return ok({ kind: PASSWORD_PROOF ? 'password' : 'recent_sign_in' }, 100);
  }
  const backupRoute = /^\/api\/admin\/backups\/([A-Za-z0-9-]+)(\/(ticket|preview|restore))?$/.exec(url);
  if (backupRoute) {
    const found = backups.find((each) => each.id === backupRoute[1]);
    if (!found) {
      return refuse(404, 'not_found', 'There is no such backup.');
    }
    switch (backupRoute[3]) {
      case 'ticket':
        return proofRefusal(body) ?? ok({ url: '/showcase/backup.txt', expires_in: 60 }, 300);
      case 'preview':
        return ok(
          {
            id: found.id,
            kind: found.kind,
            created_at: found.created_at,
            restorable: found.restorable === true,
            reasons: found.restorable ? [] : ["The database's schema has changed since this backup: it is restored offline (README)."],
            kept: ['migrations', 'anotoki_audit_log'],
            live: { rows: 52_400, tables: 18 },
            backup: { rows: found.rows ?? 0, tables: 18 },
            lost: 95,
            differences: [
              { name: 'anotoki_feedback', live: 120, backup: 30, delta: 90 },
              { name: 'people', live: 41, backup: 36, delta: 5 },
              { name: 'settings', live: 3, backup: 8, delta: -5 },
            ],
          },
          500,
        );
      case 'restore': {
        if (String(body?.['confirm'] ?? '') !== found.id.slice(-6)) {
          return refuse(422, 'confirm_mismatch', "Type the last six characters of the backup's name to restore it.");
        }
        const before = backup(0, 'before-restore', backups.length + 11, { created_at: new Date().toISOString(), description: `Before restoring ${found.id}` });
        backups = [before, ...backups];
        return proofRefusal(body) ?? ok({ restored: found.id, before_restore: before.id, tables: 18, rows: found.rows ?? 0, duration_ms: 4200, after_restore_error: null }, 2500);
      }
      default:
        if (request.method === 'DELETE') {
          return (
            proofRefusal(body) ??
            (() => {
              backups = backups.filter((each) => each.id !== found.id);
              return ok({ deleted: true });
            })()
          );
        }
        return ok({
          backup: {
            ...found,
            tables: [
              { name: 'people', rows: 41, bytes: 6144 },
              { name: 'anotoki_feedback', rows: 120, bytes: 98_304 },
              { name: 'translations', rows: 1904, bytes: 212_992 },
            ],
          },
        });
    }
  }

  // Files.
  if (url === '/api/admin/files/roots') {
    return ok({ roots: ROOTS }, 150);
  }
  const files = /^\/api\/admin\/files\/([a-z][a-z0-9_-]*)(\/(rescan|upload|folder|move|trash(\/restore)?))?$/.exec(url);
  if (files && disk[files[1]]) {
    const root = files[1];
    const what = files[3] ?? '';
    if (what === 'rescan') {
      return ok({ scanned_at: new Date().toISOString(), previous_scanned_at: ago(6 * HOUR), total: disk[root].size, new_count: NEW_FILES.size }, 900);
    }
    if (what === 'upload') {
      const form = request.body as FormData;
      const folder = String(form.get('path') ?? '');
      const results = (form.getAll('files[]') as File[]).map((file) => {
        if (RUNS_ON_SERVER.test(file.name.slice(file.name.indexOf('.')))) {
          return {
            name: file.name,
            stored_as: null,
            path: null,
            status: 'refused',
            code: 'name_runs_on_server',
            message: 'A part of that name could run as a script on the web server, so it is not taken.',
          };
        }
        const stored = file.name.replace(/\.(?=.*\.)/g, '-');
        const path = folder ? `${folder}/${stored}` : stored;
        const replaced = disk[root].has(path);
        disk[root].set(path, { size: file.size, modified: 0 });
        return { name: file.name, stored_as: stored, path, status: replaced ? 'replaced' : 'uploaded', size: file.size };
      });
      const answer = { uploaded: results.filter((each) => each.status !== 'refused').length, refused: results.filter((each) => each.status === 'refused').length, files: results };
      return concat(
        of({ type: HttpEventType.UploadProgress, loaded: 30, total: 100 } as HttpEvent<unknown>).pipe(delay(300)),
        of({ type: HttpEventType.UploadProgress, loaded: 80, total: 100 } as HttpEvent<unknown>).pipe(delay(400)),
        ok(answer, 400),
      );
    }
    if (what === 'folder') {
      const path = String(body?.['path'] ?? '');
      if (folders[root].has(path)) {
        return refuse(409, 'exists', 'Something of that name is there already.');
      }
      folders[root].add(path);
      return ok({ path }, 300, 201);
    }
    if (what === 'move') {
      const from = String(body?.['from'] ?? '');
      const to = String(body?.['to'] ?? '');
      if (disk[root].has(to) || folders[root].has(to)) {
        return refuse(409, 'exists', 'Something of that name is there already.');
      }
      if (RUNS_ON_SERVER.test(to.slice(to.lastIndexOf('/') + 1).slice(to.slice(to.lastIndexOf('/') + 1).indexOf('.')))) {
        return refuse(422, 'name_runs_on_server', 'A part of that name could run as a script on the web server, so it is not taken.');
      }
      const facts = disk[root].get(from);
      if (facts) {
        disk[root].delete(from);
        disk[root].set(to, facts);
      }
      const op = from.split('/').slice(0, -1).join('/') === to.split('/').slice(0, -1).join('/') ? 'rename' : 'move';
      return ok({ from, to, op }, 300);
    }
    if (what === 'trash') {
      if (request.method === 'DELETE') {
        const one = request.params.get('trashed');
        const gone = one ? trash[root].filter((item) => item.trashed === one) : trash[root];
        trash[root] = one ? trash[root].filter((item) => item.trashed !== one) : [];
        return ok({ deleted: gone.length, bytes: gone.reduce((sum, item) => sum + item.size, 0), failed: 0 }, 300);
      }
      return ok({ items: trash[root] }, 250);
    }
    if (what === 'trash/restore') {
      const item = trash[root].find((each) => each.trashed === body?.['trashed']);
      if (!item) {
        return refuse(404, 'not_found', 'There is no such file or folder.');
      }
      trash[root] = trash[root].filter((each) => each !== item);
      const path = item.folder ? `${item.folder}/${item.name}` : item.name;
      disk[root].set(path, { size: item.size, modified: 1 });
      return ok({ path }, 300);
    }
    if (request.method === 'DELETE') {
      const path = request.params.get('path') ?? '';
      if (folders[root].has(path)) {
        if ([...disk[root].keys()].some((file) => file.startsWith(`${path}/`))) {
          return refuse(409, 'folder_not_empty', 'Only an empty folder is deleted: move or delete what it holds first.');
        }
        folders[root].delete(path);
        return ok({ path, trashed: null });
      }
      const facts = disk[root].get(path);
      if (!facts) {
        return refuse(404, 'not_found', 'There is no such file or folder.');
      }
      disk[root].delete(path);
      const name = path.split('/').pop() ?? path;
      const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const trashed = `${folder ? folder + '/' : ''}20261011-101500__${name}`;
      trash[root] = [{ trashed, folder, name, deleted_at: new Date().toISOString(), size: facts.size }, ...trash[root]];
      return ok({ path, trashed }, 300);
    }
    return ok(listing(root, request), 300);
  }

  return next(request);
};
