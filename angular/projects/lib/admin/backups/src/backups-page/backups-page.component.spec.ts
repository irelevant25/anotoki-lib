import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnotokiAdminConfig } from '@anotoki/lib/admin';
import { AdminSite, adminProviders, adminSite, click, draw, press, refuse, settle, type, words } from '../../../parts/src/testing';
import { BackupInfo, BackupsAnswer, BackupsStatus, RestorePreview } from '../models';
import { BackupsPageComponent } from './backups-page.component';

const BASE = '/api/admin/backups';
const DAILY = '20261011-030000Z-daily-0123456789abcdef0123456789abcdef';
const MANUAL = '20261010-120000Z-manual-fedcba9876543210fedcba9876a1b2c3';

function backup(overrides: Partial<BackupInfo> = {}): BackupInfo {
  return {
    id: DAILY,
    kind: 'daily',
    created_at: '2026-10-11T03:00:00.000Z',
    encrypted: false,
    status: 'complete',
    size: 1_572_864,
    created_by: null,
    description: null,
    table_count: 18,
    rows: 52_310,
    stale: false,
    restorable: true,
    ...overrides,
  };
}

function status(overrides: Partial<BackupsStatus> = {}): BackupsStatus {
  return {
    directory_writable: true,
    free_bytes: 8 * 1024 ** 3,
    last_daily: '2026-10-11T03:00:00.000Z',
    copy_available: true,
    encrypted: false,
    cipher_available: true,
    restore_enabled: true,
    restorable: true,
    problems: [],
    count: 2,
    total_bytes: 3_145_728,
    database_bytes: 14 * 1024 ** 2,
    ...overrides,
  };
}

function answer(
  backups: BackupInfo[] = [backup(), backup({ id: MANUAL, kind: 'manual', created_at: '2026-10-10T12:00:00.000Z', created_by: 7, description: 'Before the price changes' })],
  info: Partial<BackupsStatus> = {},
): BackupsAnswer {
  return { backups, status: status(info) };
}

function preview(overrides: Partial<RestorePreview> = {}): RestorePreview {
  return {
    id: MANUAL,
    kind: 'manual',
    created_at: '2026-10-10T12:00:00.000Z',
    restorable: true,
    reasons: [],
    kept: ['migrations', 'anotoki_audit_log'],
    live: { rows: 52_400, tables: 18 },
    backup: { rows: 52_310, tables: 18 },
    lost: 95,
    differences: [
      { name: 'feedback', live: 120, backup: 30, delta: 90 },
      { name: 'people', live: 41, backup: 36, delta: 5 },
      { name: 'settings', live: 3, backup: 8, delta: -5 },
    ],
    ...overrides,
  };
}

describe("<anotoki-backups-page>: made, downloaded, deleted and restored - each behind the site's proof", () => {
  let site: AdminSite;
  let http: HttpTestingController;
  let fixture: ComponentFixture<BackupsPageComponent>;
  let host: HTMLElement;
  let downloads: string[];

  function setUp(config: Partial<AnotokiAdminConfig> = {}): void {
    site = adminSite();
    TestBed.configureTestingModule({ providers: adminProviders(site, { personLink: (id) => ['/admin/people', id], ...config }) });
    http = TestBed.inject(HttpTestingController);
    downloads = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.getAttribute('href') ?? '');
    });
  }

  function listRequest(): TestRequest {
    return http.expectOne((request) => request.method === 'GET' && request.url === BASE, 'GET the backups');
  }

  async function open(list: BackupsAnswer = answer(), proof: 'password' | 'recent_sign_in' = 'recent_sign_in'): Promise<void> {
    fixture = await draw(BackupsPageComponent);
    host = fixture.nativeElement;
    listRequest().flush(list);
    http.expectOne(`${BASE}/proof`).flush({ kind: proof });
    await settle(fixture);
  }

  const rows = () => Array.from(host.querySelectorAll<HTMLTableRowElement>('[data-backups] tbody tr[data-backup]'));
  const row = (id: string) => host.querySelector<HTMLTableRowElement>(`tr[data-backup="${id}"]`)!;
  const guarded = () => host.querySelector<HTMLDialogElement>('anotoki-dialog[data-guarded] dialog');
  const restore = () => host.querySelector<HTMLDialogElement>('anotoki-dialog[data-restore] dialog');
  const confirmButton = () => host.querySelector<HTMLButtonElement>('[data-guarded-confirm]')!;
  const restoreButton = () => host.querySelector<HTMLButtonElement>('[data-restore-confirm]')!;
  const stats = () => Object.fromEntries(Array.from(host.querySelectorAll('[data-status] > div')).map((stat) => [words(stat.querySelector('dt')), words(stat.querySelector('dd'))]));

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('is for the ADMIN alone: anybody else is told whose it is, and nothing is asked', async () => {
    setUp();
    site.admin.set(false);
    fixture = await draw(BackupsPageComponent);
    host = fixture.nativeElement;
    expect(words(host)).toBe('Backups are for the administrators of the site.');
    http.expectNone(() => true);
  });

  it('says what this server can do, and lists the backups - kind, size, tables, who made them', async () => {
    setUp();
    await open();

    expect(words(host.querySelector('[data-counts]'))).toBe('2 backups 3 MB on disk');
    expect(stats()).toMatchObject({ 'Free on the disk': '8 GB', 'The database': '14 MB', Encryption: 'Not encrypted', 'Restoring here': 'Possible' });
    expect(
      rows().map((each) =>
        Array.from(each.cells)
          .slice(1, 6)
          .map((cell) => words(cell)),
      ),
    ).toEqual([
      ['Daily', '-', '1.5 MB', '18 52,310 rows', 'By itself'],
      ['Made by hand', 'Before the price changes', '1.5 MB', '18 52,310 rows', 'Person 7'],
    ]);
    expect(row(MANUAL).querySelector('a')?.getAttribute('href')).toBe('/admin/people/7');
    expect(row(DAILY).querySelector('[data-restore]')).not.toBeNull();
    expect(host.querySelector('[data-restore-off]')).toBeNull();

    click(row(DAILY).querySelector('[data-tables]'));
    await settle(fixture);
    http.expectOne(`${BASE}/${DAILY}`).flush({ backup: backup({ tables: [{ name: 'people', rows: 41, bytes: 2048 }] }) });
    await settle(fixture);
    expect(words(host.querySelector('[data-table-list]'))).toBe('people 41 rows, 2 KB');
    expect(row(DAILY).querySelector('[data-tables]')?.getAttribute('aria-expanded')).toBe('true');
  });

  it("the IAM's case: encrypted, restoring switched off - the page says so and offers no Restore", async () => {
    setUp({ siteName: 'the IAM', restoreOffText: 'A restore would bring back sign-ins ended since, and people deleted since.' });
    await open(answer([backup({ encrypted: true })], { encrypted: true, restore_enabled: false, restorable: false }), 'password');

    expect(words(host.querySelector('[data-restore-off]'))).toContain('Restoring is switched off on the IAM');
    expect(words(host.querySelector('[data-restore-off]'))).toContain('A restore would bring back sign-ins ended since, and people deleted since.');
    expect(stats()).toMatchObject({ Encryption: 'Encrypted, AES-256-GCM', 'Restoring here': 'Switched off' });
    expect(host.querySelector('[data-restore]')).toBeNull();
    expect(row(DAILY).querySelector('anotoki-icon[label="Encrypted"]')).not.toBeNull();
  });

  it('backs up with a description and the password the site asks for - a wrong one said beside it', async () => {
    setUp();
    await open(answer(), 'password');

    click(host.querySelector('[data-create]'));
    await settle(fixture);
    expect(guarded()?.open).toBe(true);
    expect(document.activeElement?.hasAttribute('data-guarded-cancel')).toBe(true);
    expect(confirmButton().disabled).toBe(true);

    type(host.querySelector('[data-description] input'), 'x'.repeat(201));
    type(host.querySelector('[data-password] input'), 'not it');
    await settle(fixture);
    expect(words(host.querySelector('[data-description] .anotoki-field__error'))).toBe('At most 200 characters - it has 201.');
    expect(confirmButton().disabled).toBe(true);
    type(host.querySelector('[data-description] input'), '  Before the price changes ');
    await settle(fixture);
    click(confirmButton());
    await settle(fixture);
    let request = http.expectOne((r) => r.method === 'POST' && r.url === BASE);
    expect(request.request.body).toEqual({ description: 'Before the price changes', password: 'not it' });
    refuse(request, 422, 'wrong_password', 'The current password is not right');
    await settle(fixture);
    expect(words(host.querySelector('[data-password] .anotoki-field__error'))).toBe('The current password is not right');

    type(host.querySelector('[data-password] input'), 'the right one');
    await settle(fixture);
    expect(host.querySelector('[data-password] .anotoki-field__error')).toBeNull();
    click(confirmButton());
    await settle(fixture);
    request = http.expectOne((r) => r.method === 'POST' && r.url === BASE);
    expect(request.request.body).toEqual({ description: 'Before the price changes', password: 'the right one' });
    request.flush({ backup: backup({ id: MANUAL, kind: 'manual', size: 2_097_152, table_count: 18, rows: 52_400 }) }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(guarded()).toBeNull();
    listRequest().flush(answer());
    await settle(fixture);
    expect(words(host.querySelector('[data-outcome]'))).toContain(`Backed up ${MANUAL}: 2 MB, 18 tables, 52,400 rows.`);
  });

  it('asks a site whose proof is a recent sign-in to sign in again when the server says it is older', async () => {
    setUp();
    await open();

    click(host.querySelector('[data-create]'));
    await settle(fixture);
    expect(host.querySelector('[data-recent-sign-in]')).not.toBeNull();
    expect(host.querySelector('[data-password]')).toBeNull();
    click(confirmButton());
    await settle(fixture);
    const request = http.expectOne((r) => r.method === 'POST' && r.url === BASE);
    expect(request.request.body).toEqual({});
    refuse(request, 403, 'reauth_required', 'This needs a sign-in of the last 10 minutes.');
    await settle(fixture);

    expect(words(host.querySelector('[data-sign-in-needed]'))).toContain('Sign in again first');
    expect(confirmButton().disabled).toBe(true);
    click(host.querySelector('[data-sign-in]'));
    expect(site.signedInAgain).toBe(1);

    press(guarded()!, 'Escape');
    await settle(fixture);
    expect(guarded()).toBeNull();
  });

  it('downloads by a single-use link - straight away with a recent sign-in, the password first where the site asks it', async () => {
    setUp();
    await open();

    click(row(DAILY).querySelector('[data-download]'));
    await settle(fixture);
    let request = http.expectOne(`${BASE}/${DAILY}/ticket`);
    expect([request.request.method, request.request.body]).toEqual(['POST', {}]);
    request.flush({ url: `${BASE}/${DAILY}/file?ticket=abc123`, expires_in: 60 });
    await settle(fixture);
    expect(downloads).toEqual([`${BASE}/${DAILY}/file?ticket=abc123`]);
    expect(words(host.querySelector('[data-outcome]'))).toContain('Its link worked once, and no more.');

    // A sign-in that is too old: the dialog opens, saying so.
    click(row(DAILY).querySelector('[data-download]'));
    await settle(fixture);
    refuse(http.expectOne(`${BASE}/${DAILY}/ticket`), 403, 'reauth_required', 'Sign in again.');
    await settle(fixture);
    expect(guarded()?.open).toBe(true);
    expect(host.querySelector('[data-sign-in-needed]')).not.toBeNull();
    expect(downloads).toHaveLength(1);
  });

  it('downloads after the password, and never opens a link that is not a path of the site', async () => {
    setUp({ resolveUrl: (path) => `https://api.example.test${path}` });
    await open(answer(), 'password');

    click(row(MANUAL).querySelector('[data-download]'));
    await settle(fixture);
    expect(host.querySelector('anotoki-dialog[data-guarded]')?.getAttribute('data-action')).toBe('download');
    type(host.querySelector('[data-password] input'), 'secret');
    await settle(fixture);
    click(confirmButton());
    await settle(fixture);
    let request = http.expectOne(`${BASE}/${MANUAL}/ticket`);
    expect(request.request.body).toEqual({ password: 'secret' });
    request.flush({ url: `${BASE}/${MANUAL}/file?ticket=t1`, expires_in: 60 });
    await settle(fixture);
    expect(downloads).toEqual([`https://api.example.test${BASE}/${MANUAL}/file?ticket=t1`]);
    expect(guarded()).toBeNull();

    click(row(MANUAL).querySelector('[data-download]'));
    await settle(fixture);
    type(host.querySelector('[data-password] input'), 'secret');
    await settle(fixture);
    click(confirmButton());
    await settle(fixture);
    request = http.expectOne(`${BASE}/${MANUAL}/ticket`);
    request.flush({ url: '//evil.example/x', expires_in: 60 });
    await settle(fixture);
    expect(downloads).toHaveLength(1);
    expect(words(host.querySelector('[data-guard-error]'))).toBe('The server gave no link this page can open.');
  });

  it('deletes after a question that holds the proof, its focus on Cancel', async () => {
    setUp();
    await open(answer(), 'password');

    click(row(MANUAL).querySelector('[data-delete]'));
    await settle(fixture);
    expect(words(host.querySelector('anotoki-dialog[data-guarded] .anotoki-dialog__title'))).toBe('Delete this backup?');
    expect(document.activeElement?.hasAttribute('data-guarded-cancel')).toBe(true);
    type(host.querySelector('[data-password] input'), 'secret');
    await settle(fixture);
    click(confirmButton());
    await settle(fixture);
    const request = http.expectOne(`${BASE}/${MANUAL}`);
    expect([request.request.method, request.request.body]).toEqual(['DELETE', { password: 'secret' }]);
    request.flush({ deleted: true });
    await settle(fixture);
    listRequest().flush(answer([backup()]));
    await settle(fixture);
    expect(rows()).toHaveLength(1);
    expect(words(host.querySelector('[data-outcome]'))).toContain(`(${MANUAL}) is gone.`);
  });

  it('says what a server cannot do: an unwritable folder, no COPY, problems in the way of a restore', async () => {
    setUp();
    await open(answer([], { directory_writable: false, copy_available: false, restorable: false, problems: ['The table people has a trigger the restore cannot switch off.'] }));

    expect(host.querySelector('[data-not-writable]')).not.toBeNull();
    expect(host.querySelector('[data-no-copy]')).not.toBeNull();
    expect(words(host.querySelector('[data-problems]'))).toContain('The table people has a trigger the restore cannot switch off.');
    expect(host.querySelector<HTMLButtonElement>('[data-create]')!.disabled).toBe(true);
    expect(words(host.querySelector('[data-empty]'))).toContain('No backups yet');
  });

  describe('restoring: what is at stake, the name typed, the proof, thirty seconds', () => {
    async function openRestore(proof: 'password' | 'recent_sign_in' = 'password', answered: RestorePreview = preview()): Promise<void> {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      await open(answer(), proof);
      click(row(MANUAL).querySelector('[data-restore]'));
      await settle(fixture);
      http.expectOne(`${BASE}/${MANUAL}/preview`).flush(answered);
      await settle(fixture);
    }

    async function wait(seconds: number): Promise<void> {
      vi.advanceTimersByTime(seconds * 1000);
      await settle(fixture);
    }

    it('unlocks only after the countdown, the six characters and the password - then restores', async () => {
      setUp();
      await openRestore();

      expect(restore()?.open).toBe(true);
      expect(document.activeElement?.hasAttribute('data-restore-cancel')).toBe(true);
      expect(words(host.querySelector('[data-balance]'))).toBe('In the database now 52,400 rows in 18 tables After restoring 52,310 rows in 18 tables');
      expect(words(host.querySelector('[data-losses] h3'))).toBe('95 rows would go, from 2 tables');
      expect(words(host.querySelector('[data-gains]'))).toContain('1 table gets rows back settings 3 → 8 +5');
      expect(words(host.querySelector('[data-waiting]'))).toBe('Restore unlocks in 30 s');
      expect(restoreButton().disabled).toBe(true);

      type(host.querySelector('[data-confirm-word] input'), 'a1b2c3');
      type(host.querySelector('anotoki-backup-restore-dialog [data-password] input'), 'secret');
      await wait(12);
      expect(words(host.querySelector('[data-waiting]'))).toBe('Restore unlocks in 18 s');
      expect(restoreButton().disabled).toBe(true);
      await wait(18);
      expect(host.querySelector('[data-waiting]')).toBeNull();
      expect(restoreButton().disabled).toBe(false);

      type(host.querySelector('[data-confirm-word] input'), 'a1b2c');
      await settle(fixture);
      expect(words(host.querySelector('[data-waiting]'))).toBe('Type a1b2c3 to go on.');
      expect(restoreButton().disabled).toBe(true);
      type(host.querySelector('[data-confirm-word] input'), 'a1b2c3');
      await settle(fixture);

      click(restoreButton());
      await settle(fixture);
      const request = http.expectOne(`${BASE}/${MANUAL}/restore`);
      expect([request.request.method, request.request.body]).toEqual(['POST', { confirm: 'a1b2c3', password: 'secret' }]);
      request.flush({ restored: MANUAL, before_restore: '20261011-090000Z-before-restore-00112233445566778899aabbccddeeff', tables: 18, rows: 52_310, duration_ms: 4200, after_restore_error: null });
      await settle(fixture);
      expect(restore()).toBeNull();
      listRequest().flush(answer());
      await settle(fixture);
      expect(words(host.querySelector('[data-outcome]'))).toContain(
        `Restored ${MANUAL}: 52,310 rows in 18 tables, in 4.2 s. What was there before is kept as the backup 20261011-090000Z-before-restore-`,
      );
    });

    it('never unlocks for a backup the server says cannot be restored here, and says why', async () => {
      setUp();
      await openRestore('recent_sign_in', preview({ restorable: false, reasons: ["The database's schema has changed since this backup: it is restored offline (README)."] }));

      expect(words(host.querySelector('[data-reasons]'))).toContain("The database's schema has changed since this backup");
      expect(host.querySelector<HTMLInputElement>('[data-confirm-word] input')!.disabled).toBe(true);
      await wait(31);
      expect(words(host.querySelector('[data-waiting]'))).toBe('It cannot be restored here.');
      expect(restoreButton().disabled).toBe(true);
    });

    it('keeps the dialog open with what the server refused: the sign-in, the schema, a failure rolled back', async () => {
      setUp();
      await openRestore('recent_sign_in');
      type(host.querySelector('[data-confirm-word] input'), 'a1b2c3');
      await wait(30);

      click(restoreButton());
      await settle(fixture);
      refuse(http.expectOne(`${BASE}/${MANUAL}/restore`), 500, 'restore_failed', 'The restore failed and nothing of it stayed: a deferred key was broken.');
      await settle(fixture);
      expect(words(host.querySelector('[data-failure]'))).toContain('The restore failed - nothing of it stayed');
      expect(restore()?.open).toBe(true);

      click(restoreButton());
      await settle(fixture);
      const request = http.expectOne(`${BASE}/${MANUAL}/restore`);
      expect(request.request.body).toEqual({ confirm: 'a1b2c3' });
      refuse(request, 403, 'reauth_required', 'Sign in again.');
      await settle(fixture);
      expect(host.querySelector('anotoki-backup-restore-dialog [data-sign-in-needed]')).not.toBeNull();
      expect(words(host.querySelector('[data-waiting]'))).toBe('Sign in again to go on.');
      expect(restoreButton().disabled).toBe(true);
    });

    it('tells a restore whose answer never came from one that failed: it may still be running', async () => {
      setUp();
      await openRestore('recent_sign_in');
      type(host.querySelector('[data-confirm-word] input'), 'a1b2c3');
      await wait(30);

      click(restoreButton());
      await settle(fixture);
      http.expectOne(`${BASE}/${MANUAL}/restore`).flush('<html>A timeout occurred</html>', { status: 524, statusText: 'A Timeout Occurred' });
      await settle(fixture);
      expect(restore()).toBeNull();
      listRequest().flush(answer());
      await settle(fixture);
      expect(words(host.querySelector('[data-outcome]'))).toContain('No answer came - it may still be running');
    });
  });

  it('says why the list could not be read, and reads it again', async () => {
    setUp();
    fixture = await draw(BackupsPageComponent);
    host = fixture.nativeElement;
    refuse(listRequest(), 500, 'server_error', 'The disk is not there.');
    http.expectOne(`${BASE}/proof`).flush({ kind: 'recent_sign_in' });
    await settle(fixture);
    expect(words(host.querySelector('anotoki-error-state'))).toContain('The disk is not there.');

    click(host.querySelector('anotoki-error-state button'));
    await settle(fixture);
    listRequest().flush(answer());
    await settle(fixture);
    expect(rows()).toHaveLength(2);
  });
});
