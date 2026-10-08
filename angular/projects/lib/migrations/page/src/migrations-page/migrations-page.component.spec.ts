import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { AnotokiMigrationsConfig } from '../../../src/config';
import { SiteStatus } from '../../../src/site-status.service';
import { API_BASE, TestSite, provideTestSite, settle, testSite, words } from '../../../src/testing';
import { MigrationsPageComponent } from './migrations-page.component';

const BEHIND = {
  sets: ['site'],
  applied: [
    { set: 'site', name: '001_initial.sql', applied_at: '2026-09-28T10:00:00Z' },
    { set: 'site', name: '002_strings.sql', applied_at: '2026-09-30T18:12:00Z' },
  ],
  pending: [
    { set: 'site', name: '003_more.sql', ready: true, blocked: false },
    { set: 'site', name: '004_most.sql', ready: true, blocked: false },
  ],
  missing: [],
};

const CURRENT = {
  ...BEHIND,
  applied: [...BEHIND.applied, { set: 'site', name: '003_more.sql', applied_at: '2026-10-07T09:30:00Z' }, { set: 'site', name: '004_most.sql', applied_at: '2026-10-07T09:30:00Z' }],
  pending: [],
};

/** Half way: 003 ran, 004 did not. */
const HALF = {
  ...BEHIND,
  applied: [...BEHIND.applied, { set: 'site', name: '003_more.sql', applied_at: '2026-10-07T09:30:00Z' }],
  pending: [BEHIND.pending[1]],
};

const ERROR =
  'statement 2 of 3: SQLSTATE[42701]: Duplicate column: 7 ERROR:  column "language" of relation "responses" already exists\n\n  ALTER TABLE responses\n      ADD COLUMN language VARCHAR(10)';

const BUSY = 'Another database update is running. Nothing was applied. Wait a moment, then look again.';

describe('<anotoki-migrations-page>: what the database has and lacks, and applying it', () => {
  let site: TestSite;
  let status: SiteStatus;
  let http: HttpTestingController;
  let fixture: ComponentFixture<MigrationsPageComponent>;
  let host: HTMLElement;

  function setUp(extra: Partial<AnotokiMigrationsConfig> = {}): void {
    site = testSite();
    site.admin.set(true);
    site.signedIn.set(true);
    TestBed.configureTestingModule({
      providers: provideTestSite(site, { formatDate: (iso) => `on ${iso.slice(0, 10)}`, ...extra }),
    });
    status = TestBed.inject(SiteStatus);
    http = TestBed.inject(HttpTestingController);
    status.report('update_pending');
  }

  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(MigrationsPageComponent);
    host = fixture.nativeElement;
    await settle(fixture);
  }

  /** The page, with the lists the server gave. */
  async function load(lists: object = BEHIND): Promise<void> {
    await draw();
    http.expectOne(API_BASE).flush(lists);
    await settle(fixture);
  }

  /** Apply pending, yes; the server answers (`answer`), then gives the lists again. */
  async function apply(answer: (request: TestRequest) => void, after: object): Promise<void> {
    applyButton().click();
    await settle(fixture);
    expect(confirm()?.open).toBe(true);
    click('[data-confirm-apply]');
    await settle(fixture);
    expect(confirm()).toBeNull();

    const request = http.expectOne(`${API_BASE}/apply`);
    expect(request.request.method).toBe('POST');
    answer(request);
    await settle(fixture);
    http.expectOne(API_BASE).flush(after);
    await settle(fixture);
  }

  const text = (selector: string) => words(host.querySelector(selector));
  /** Each row of a card: the words of each of its parts. */
  const rows = (selector: string) => Array.from(host.querySelectorAll(`${selector} li`)).map((row) => Array.from(row.children).map(words).join(' '));
  const applyButton = () => host.querySelector<HTMLButtonElement>('[data-apply]')!;
  /** The question before an Apply: its <dialog>, while it is there. */
  const confirm = () => host.querySelector<HTMLDialogElement>('anotoki-dialog[data-confirm] dialog');
  const sqlDialog = () => host.querySelector<HTMLDialogElement>('anotoki-dialog[data-sql] dialog');
  const result = () => host.querySelector<HTMLElement>('[data-result]');
  const click = (selector: string) => host.querySelector<HTMLElement>(selector)!.click();

  afterEach(() => http.verify());

  it('is for the ADMIN alone: anybody else is told so, and nothing is asked of the server', async () => {
    setUp();
    site.admin.set(false);
    await draw();

    expect(words(host)).toBe('Migrations are for administrators.');
    http.expectNone(API_BASE);
  });

  it('reads the lists once the person turns out to be the ADMIN', async () => {
    setUp();
    site.admin.set(false);
    await draw();
    http.expectNone(API_BASE);

    site.admin.set(true);
    await settle(fixture);
    http.expectOne(API_BASE).flush(BEHIND);
    await settle(fixture);
    expect(rows('[data-pending]')).toHaveLength(2);
  });

  it('shows Pending in the order they will run and Applied with when - in English, with the kit’s page header, cards and badges', async () => {
    setUp();
    site.language.set('sk');
    await draw();
    expect(text('[role=status]')).toBe('Reading the migrations...');
    http.expectOne(API_BASE).flush(BEHIND);
    await settle(fixture);

    expect(host.getAttribute('lang')).toBe('en');
    expect(text('h1')).toBe('Migrations');
    expect(host.querySelector('anotoki-page-header h1')).not.toBeNull();
    expect(text('.lead')).toBe('The database schema is what these files build. Back the database up before applying anything.');
    expect(text('[data-pending] h2')).toBe('Pending');
    expect(host.querySelector('anotoki-card[data-pending]')).not.toBeNull();
    expect(rows('[data-pending]')).toEqual(['003_more.sql pending', '004_most.sql pending']);
    expect(host.querySelector('[data-pending] anotoki-badge')?.getAttribute('data-tone')).toBe('warning');
    expect(host.querySelector('[data-pending] h3')).toBeNull();
    expect(text('[data-applied] h2')).toBe('Applied');
    expect(text('[data-applied] .card-text')).toBe('2 files');
    expect(rows('[data-applied]')).toEqual(['001_initial.sql on 2026-09-28 View', '002_strings.sql on 2026-09-30 View']);
    expect(host.querySelector('[data-applied] button')?.getAttribute('aria-label')).toBe('View 001_initial.sql');
    expect(host.querySelector('[data-applied] time')?.getAttribute('datetime')).toBe('2026-09-28T10:00:00Z');
    expect(host.querySelector('[data-missing]')).toBeNull();
    expect(text('[data-apply]')).toBe('Apply pending');
    expect(applyButton().classList).toContain('is-primary');
    expect(applyButton().disabled).toBe(false);
  });

  it('formats the dates en-GB when the site gives no formatter', async () => {
    setUp({ formatDate: undefined });
    await load();
    const expected = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date('2026-09-28T10:00:00Z'));
    expect(text('[data-applied] time')).toBe(expected);
    expect(expected).toMatch(/^\d{1,2} \S+ 2026, \d\d:\d\d$/);
  });

  it('asks first, in the kit’s dialog - Cancel, which has the focus, applies nothing', async () => {
    setUp();
    await load();

    // A click focuses the button it lands on; .click() alone does not.
    applyButton().focus();
    applyButton().click();
    await settle(fixture);
    expect(confirm()?.open).toBe(true);
    expect(text('[data-confirm] h2')).toBe('Apply 2 pending migrations?');
    expect(text('[data-confirm] .description')).toBe('They run now, against the live database, in order - stopping at the first one that fails. Make sure there is a fresh backup.');
    expect(document.getElementById(confirm()!.getAttribute('aria-describedby')!)?.textContent).toContain('They run now');
    expect(document.activeElement).toBe(host.querySelector('[data-confirm-cancel]'));
    expect(host.querySelector('[data-confirm-apply]')?.classList).toContain('is-danger');

    click('[data-confirm-cancel]');
    await settle(fixture);
    expect(confirm()).toBeNull();
    expect(document.activeElement).toBe(applyButton());
    http.expectNone(`${API_BASE}/apply`);
    expect(result()).toBeNull();
  });

  it('Escape takes the question back too', async () => {
    setUp();
    await load();
    applyButton().click();
    await settle(fixture);
    confirm()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle(fixture);
    expect(confirm()).toBeNull();
    http.expectNone(`${API_BASE}/apply`);
  });

  it('applied: "Up to date", said politely, the lists read again - and the site runs again', async () => {
    setUp();
    await load();

    await apply(
      (request) =>
        request.flush({
          applied: [
            { set: 'site', name: '003_more.sql' },
            { set: 'site', name: '004_most.sql' },
          ],
          failed: null,
          error: null,
          note: 'A copy of every table was saved first.',
        }),
      CURRENT,
    );

    expect(result()?.getAttribute('role')).toBe('status');
    expect(result()?.getAttribute('data-tone')).toBe('success');
    expect(text('[data-result] .heading')).toBe('Up to date');
    expect(text('[data-result] .result-text')).toBe('Applied: 003_more.sql, 004_most.sql.');
    expect(text('[data-result] .result-note')).toBe('A copy of every table was saved first.');
    expect(text('[data-pending] .card-text')).toBe('Nothing pending - the database is up to date with the files.');
    expect(text('[data-applied] .card-text')).toBe('4 files');
    expect(applyButton().disabled).toBe(true);
    expect(site.onUpToDate).toHaveBeenCalledTimes(1);
    expect(status.state()).toBe('ready');
  });

  it('says "Applying..." with a spinner and cannot be pressed while it runs', async () => {
    setUp();
    await load();
    applyButton().click();
    await settle(fixture);
    click('[data-confirm-apply]');
    await settle(fixture);

    expect(text('[data-apply]')).toBe('Applying...');
    expect(applyButton().disabled).toBe(true);
    expect(applyButton().getAttribute('aria-busy')).toBe('true');
    expect(applyButton().querySelector('anotoki-spinner')).not.toBeNull();

    http.expectOne(`${API_BASE}/apply`).flush({ applied: [], failed: null, error: null, note: null });
    await settle(fixture);
    http.expectOne(API_BASE).flush(BEHIND);
    await settle(fixture);
    expect(text('[data-apply]')).toBe('Apply pending');
  });

  it("a file that failed: where it stopped, what ran first, that it was rolled back whole, and the database's own words", async () => {
    setUp();
    await load();

    await apply((request) => request.flush({ applied: [{ set: 'site', name: '003_more.sql' }], failed: { set: 'site', name: '004_most.sql' }, error: ERROR, note: null }), HALF);

    expect(result()?.getAttribute('role')).toBe('alert');
    expect(result()?.getAttribute('data-tone')).toBe('danger');
    expect(text('[data-result] .heading')).toBe('Stopped at 004_most.sql');
    expect(text('[data-result] .result-text')).toBe('Applied first: 003_more.sql. The failed file was rolled back as a whole.');
    // Its own lines, as PostgreSQL wrote them: text, never markup.
    expect(host.querySelector('[data-result] pre')?.textContent).toBe(ERROR);
    expect(rows('[data-pending]')).toEqual(['004_most.sql pending']);
    expect(site.onUpToDate).not.toHaveBeenCalled();
    expect(status.state()).toBe('update-pending');
  });

  it('the first file failed: "Nothing was applied."', async () => {
    setUp();
    await load();
    await apply((request) => request.flush({ applied: [], failed: { set: 'site', name: '003_more.sql' }, error: 'statement 1 of 9: SQLSTATE[23505]: Unique violation', note: null }), BEHIND);

    expect(text('[data-result] .result-text')).toBe('Nothing was applied. The failed file was rolled back as a whole.');
  });

  it('another update running (409): its message, and nothing else', async () => {
    setUp();
    await load();
    await apply((request) => request.flush({ code: 'busy', message: BUSY }, { status: 409, statusText: 'Conflict' }), BEHIND);

    expect(result()?.getAttribute('role')).toBe('alert');
    expect(result()?.getAttribute('data-tone')).toBe('warning');
    expect(host.querySelector('[data-result] .heading')).toBeNull();
    expect(text('[data-result]')).toBe(BUSY);
    expect(site.onUpToDate).not.toHaveBeenCalled();
  });

  it('any other failure: "Nothing was applied." and what the server said', async () => {
    setUp();
    await load();
    await apply((request) => request.flush({ code: 'forbidden', message: 'Only an ADMIN can apply migrations.' }, { status: 403, statusText: 'Forbidden' }), BEHIND);
    expect(text('[data-result] .heading')).toBe('Nothing was applied.');
    expect(text('[data-result] .result-text')).toBe('Only an ADMIN can apply migrations.');

    await apply((request) => request.error(new ProgressEvent('error')), BEHIND);
    expect(text('[data-result] .result-text')).toBe('The server could not be reached.');

    await apply((request) => request.flush('<html>oops</html>', { status: 500, statusText: 'Internal Server Error' }), BEHIND);
    expect(text('[data-result] .result-text')).toBe('The server answered 500 Internal Server Error.');
  });

  it('a site hook refused before anything ran: "Nothing was applied." and its words', async () => {
    setUp();
    await load();
    await apply((request) => request.flush({ applied: [], failed: null, error: 'The backup folder is not writable.', note: null }), BEHIND);

    expect(text('[data-result] .heading')).toBe('Nothing was applied.');
    expect(text('[data-result] .result-text')).toBe('The backup folder is not writable.');
  });

  it('nothing left to apply when it ran (another way applied it): said so - and the site runs again', async () => {
    setUp();
    await load();
    await apply((request) => request.flush({ applied: [], failed: null, error: null, note: null }), CURRENT);

    expect(result()?.getAttribute('role')).toBe('status');
    expect(text('[data-result]')).toBe('There was nothing to apply.');
    expect(site.onUpToDate).toHaveBeenCalledTimes(1);
    expect(status.state()).toBe('ready');
  });

  it('drafts: a draft, and what waits behind it, say so and are not applied', async () => {
    setUp();
    await load({
      ...BEHIND,
      pending: [
        { set: 'site', name: '003_more.sql', ready: true, blocked: false },
        { set: 'site', name: '004_draft.sql', ready: false, blocked: false },
        { set: 'site', name: '005_after.sql', ready: true, blocked: true },
      ],
    });

    expect(rows('[data-pending]')).toEqual(['003_more.sql pending', '004_draft.sql draft a draft - it does not run until it is finished', '005_after.sql waits']);
    expect(Array.from(host.querySelectorAll('[data-pending] anotoki-badge')).map((badge) => badge.getAttribute('data-tone'))).toEqual(['warning', 'neutral', 'neutral']);
    applyButton().click();
    await settle(fixture);
    expect(text('[data-confirm] h2')).toBe('Apply 1 pending migration?');
    click('[data-confirm-cancel]');
    await settle(fixture);
  });

  it('only drafts waiting: Apply cannot be pressed', async () => {
    setUp();
    await load({ ...BEHIND, pending: [{ set: 'site', name: '003_draft.sql', ready: false, blocked: false }] });
    expect(applyButton().disabled).toBe(true);
  });

  it('two sets: a heading for each, and every file named with its set', async () => {
    setUp();
    await load({
      sets: ['users', 'genshin_impact'],
      applied: [
        { set: 'users', name: '001_initial_schema.sql', applied_at: '2026-01-01T00:00:00Z' },
        { set: 'genshin_impact', name: '001_initial_schema.sql', applied_at: '2026-01-02T00:00:00Z' },
      ],
      pending: [
        { set: 'users', name: '041_news.sql', ready: true, blocked: false },
        { set: 'genshin_impact', name: '052_weapons.sql', ready: true, blocked: false },
      ],
      missing: [],
    });

    expect(Array.from(host.querySelectorAll('[data-pending] h3')).map(words)).toEqual(['migrations/users/', 'migrations/genshin_impact/']);
    expect(rows('[data-pending]')).toEqual(['041_news.sql pending', '052_weapons.sql pending']);
    expect(rows('[data-applied]')).toEqual(['users/001_initial_schema.sql on 2026-01-01 View', 'genshin_impact/001_initial_schema.sql on 2026-01-02 View']);

    await apply(
      (request) => request.flush({ applied: [{ set: 'users', name: '041_news.sql' }], failed: { set: 'genshin_impact', name: '052_weapons.sql' }, error: 'statement 1 of 1: boom', note: null }),
      { sets: ['users', 'genshin_impact'], applied: [], pending: [{ set: 'genshin_impact', name: '052_weapons.sql', ready: true, blocked: false }], missing: [] },
    );
    expect(text('[data-result] .heading')).toBe('Stopped at genshin_impact/052_weapons.sql');
    expect(text('[data-result] .result-text')).toBe('Applied first: users/041_news.sql. The failed file was rolled back as a whole.');
  });

  it('Missing: listed only when a recorded file is not here', async () => {
    setUp();
    await load({ ...BEHIND, missing: [{ set: 'site', name: '000_gone.sql', applied_at: '2026-09-01T00:00:00Z' }] });

    expect(text('[data-missing] h2')).toBe('Missing');
    expect(text('[data-missing] .card-text')).toBe('Recorded as applied, but the file is not here:');
    expect(rows('[data-missing]')).toEqual(['000_gone.sql']);
  });

  describe('View', () => {
    const SQL = '-- 001\nCREATE TABLE people (\n    id SERIAL PRIMARY KEY\n);\n';

    function fileRequest(): TestRequest {
      return http.expectOne((request) => request.url === `${API_BASE}/file` && request.params.get('set') === 'site' && request.params.get('name') === '001_initial.sql');
    }

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'clipboard');
    });

    it('shows the SQL in a dialog, with Copy and Close - the focus back on View after', async () => {
      setUp();
      await load();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

      const view = host.querySelector<HTMLButtonElement>('[data-applied] button')!;
      view.focus();
      view.click();
      await settle(fixture);
      expect(sqlDialog()?.open).toBe(true);
      expect(text('[data-sql] h2')).toBe('001_initial.sql');
      expect(text('[data-sql] [role=status]')).toBe('Reading the file...');
      expect(host.querySelector<HTMLButtonElement>('[data-copy]')!.disabled).toBe(true);
      expect(document.activeElement).toBe(host.querySelector('[data-close]'));

      fileRequest().flush({ set: 'site', name: '001_initial.sql', sql: SQL });
      await settle(fixture);
      expect(host.querySelector('[data-sql] pre')?.textContent).toBe(SQL);

      click('[data-copy]');
      await settle(fixture);
      expect(writeText).toHaveBeenCalledWith(SQL);
      expect(text('[data-sql] .copied')).toBe('Copied.');

      click('[data-close]');
      await settle(fixture);
      expect(sqlDialog()).toBeNull();
      expect(host.querySelector('[data-sql] pre')).toBeNull();
      expect(document.activeElement).toBe(view);
    });

    it('without a clipboard, Copy selects the text instead', async () => {
      setUp();
      await load();
      click('[data-applied] button');
      fileRequest().flush({ set: 'site', name: '001_initial.sql', sql: SQL });
      await settle(fixture);

      click('[data-copy]');
      await settle(fixture);
      expect(document.getSelection()?.toString()).toBe(SQL);
      expect(text('[data-sql] .copied')).toBe('The text is selected: copy it with Ctrl+C.');
    });

    it('a file that cannot be read says so', async () => {
      setUp();
      await load();
      click('[data-applied] button');
      fileRequest().flush({ code: 'not_found', message: 'No such migration file.' }, { status: 404, statusText: 'Not Found' });
      await settle(fixture);

      expect(text('[data-sql] [role=alert]')).toBe('The file could not be read. No such migration file.');
      expect(host.querySelector<HTMLButtonElement>('[data-copy]')!.disabled).toBe(true);
    });
  });

  it('the lists could not be read: said, with Try again', async () => {
    setUp();
    await draw();
    http.expectOne(API_BASE).flush({ code: 'error', message: 'The database could not be reached.' }, { status: 500, statusText: 'Internal Server Error' });
    await settle(fixture);

    expect(text('[data-load-error] .heading')).toBe('The migrations could not be read.');
    expect(text('[data-load-error] .result-text')).toBe('The database could not be reached.');
    expect(host.querySelector('[data-load-error]')?.getAttribute('role')).toBe('alert');
    expect(applyButton().disabled).toBe(true);

    click('[data-load-error] button');
    http.expectOne(API_BASE).flush(BEHIND);
    await settle(fixture);
    expect(host.querySelector('[data-load-error]')).toBeNull();
    expect(rows('[data-pending]')).toHaveLength(2);
  });
});
