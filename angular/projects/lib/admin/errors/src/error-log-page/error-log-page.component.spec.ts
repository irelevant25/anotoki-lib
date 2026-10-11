import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminSite, adminProviders, adminSite, choose, click, draw, press, refuse, settle, type, words } from '../../../parts/src/testing';
import { ErrorLogEntry, ErrorLogGroup, ErrorLogReport } from '../models';
import { ErrorLogPageComponent } from './error-log-page.component';

const BASE = '/api/admin/errors';
const TODAY = new Date().toISOString().slice(0, 10);
const DAY = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);

function entry(overrides: Partial<ErrorLogEntry> = {}): ErrorLogEntry {
  return {
    v: 1,
    at: `${TODAY}T09:15:02.123Z`,
    source: 'server',
    level: 'error',
    status: 500,
    type: 'PDOException',
    code: 'server_error',
    message: 'SQLSTATE[23505]: Unique violation: [redacted]',
    file: 'api/routes/admin.php',
    line: 412,
    method: 'POST',
    route: '/api/admin/users/{id}',
    path: '/api/admin/users/42',
    user_id: 7,
    client: '3fa2c1b09e7d',
    trace: ['api/routes/admin.php:412 saveUser()', 'vendor/slim/slim/Slim/Handlers/Strategies/RequestResponse.php:38 {closure}()'],
    fingerprint: 'a1b2c3d4e5f6',
    ...overrides,
  };
}

function group(overrides: Partial<ErrorLogGroup> = {}, latest: Partial<ErrorLogEntry> = {}): ErrorLogGroup {
  const newest = entry(latest);
  return {
    fingerprint: newest.fingerprint,
    level: newest.level,
    status: newest.status,
    type: newest.type,
    code: newest.code,
    message: newest.message,
    file: newest.file,
    line: newest.line,
    route: newest.route,
    source: newest.source,
    count: 3,
    first_at: `${DAY(2)}T08:00:00.000Z`,
    last_at: newest.at,
    paths: ['/api/admin/users/42', '/api/admin/users/9'],
    latest: newest,
    ...overrides,
  };
}

function report(overrides: Partial<ErrorLogReport> = {}): ErrorLogReport {
  const groups = overrides.groups ?? [
    group(),
    group(
      { fingerprint: '0f0f0f0f0f0f', level: 'warning', status: 404, type: 'HttpNotFoundException', code: 'not_found', message: 'Not found.', count: 1, paths: ['/api/nowhere'], route: null },
      { fingerprint: '0f0f0f0f0f0f', level: 'warning', status: 404, route: null, path: '/api/nowhere', trace: null, user_id: null },
    ),
  ];
  return {
    total: 4,
    errors: 3,
    warnings: 1,
    notices: 0,
    distinct: groups.length,
    truncated: false,
    days: [TODAY],
    daily: Array.from({ length: 7 }, (_, index) => ({ key: DAY(6 - index), errors: index === 6 ? 3 : 0, warnings: index === 6 ? 1 : 0, notices: 0 })),
    statuses: [
      { key: '404', errors: 0, warnings: 1, notices: 0 },
      { key: '500', errors: 3, warnings: 0, notices: 0 },
    ],
    groups,
    dropped: {},
    ...overrides,
  };
}

describe('<anotoki-error-log-page>: what went wrong, grouped, and clearing it', () => {
  let site: AdminSite;
  let http: HttpTestingController;
  let fixture: ComponentFixture<ErrorLogPageComponent>;
  let host: HTMLElement;

  async function setUp(): Promise<void> {
    site = adminSite();
    TestBed.configureTestingModule({ providers: adminProviders(site, { personLink: (id) => ['/admin/people', id] }) });
    http = TestBed.inject(HttpTestingController);
  }

  /** The open request of the log's report, with its query. */
  function reportRequest(): TestRequest {
    return http.expectOne((request) => request.method === 'GET' && request.url === BASE, 'GET the report');
  }

  async function open(answer: ErrorLogReport = report()): Promise<void> {
    fixture = await draw(ErrorLogPageComponent);
    host = fixture.nativeElement;
    const request = reportRequest();
    expect(request.request.params.get('days')).toBe('7');
    request.flush(answer);
    await settle(fixture);
  }

  const rows = () => Array.from(host.querySelectorAll<HTMLTableRowElement>('[data-groups] tbody tr[data-fingerprint]'));
  /** A row's cells, each one's words. */
  const cells = (row: HTMLTableRowElement) => Array.from(row.cells).map((cell) => words(cell));
  /** The facts of an open row: each name with what it says. */
  const facts = (root: Element) => Object.fromEntries(Array.from(root.querySelectorAll('dl > div')).map((fact) => [words(fact.querySelector('dt')), words(fact.querySelector('dd'))]));
  const dialog = () => host.querySelector<HTMLDialogElement>('anotoki-dialog[data-clear-dialog] dialog');

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it('is for the ADMIN alone: anybody else is told whose it is, and nothing is asked', async () => {
    await setUp();
    site.admin.set(false);
    fixture = await draw(ErrorLogPageComponent);
    host = fixture.nativeElement;

    expect(words(host)).toBe('The error log is for the administrators of the site.');
    http.expectNone(() => true);

    site.admin.set(true);
    await settle(fixture);
    reportRequest().flush(report());
    await settle(fixture);
    expect(rows()).toHaveLength(2);
  });

  it('shows the counts, a column a day and a row a cause, the loudest first', async () => {
    await setUp();
    await open();

    expect(words(host.querySelector('[data-counts]'))).toBe('3 errors 1 warning 2 causes');
    const days = host.querySelectorAll('[data-chart] li');
    expect(days).toHaveLength(7);
    expect(words(days[6].querySelector('.anotoki-visually-hidden'))).toMatch(/: 3 errors, 1 warning, 0 notices$/);
    expect(rows().map((row) => cells(row).slice(0, 4))).toEqual([
      ['3', '500', 'PDOException server_errorSQLSTATE[23505]: Unique violation: [redacted]', 'POST /api/admin/users/{id}and 1 more path'],
      ['1', '404', 'HttpNotFoundException not_foundNot found.', 'POST /api/nowhere'],
    ]);
    expect(rows()[0].querySelector('anotoki-badge')?.getAttribute('data-level')).toBe('error');
    expect(host.querySelector('anotoki-pagination')).toBeNull();
  });

  it('narrows by range, level, status and a search - each a request, the last answer the one shown', async () => {
    await setUp();
    await open();

    click(host.querySelector('[data-range] [data-value="30"]'));
    await settle(fixture);
    let request = reportRequest();
    expect(request.request.params.get('days')).toBe('30');
    request.flush(report());
    await settle(fixture);

    choose(host.querySelector('[data-level] select'), 'warning');
    await settle(fixture);
    request = reportRequest();
    expect([request.request.params.get('days'), request.request.params.get('level')]).toEqual(['30', 'warning']);
    request.flush(report({ groups: [report().groups[1]], total: 1 }));
    await settle(fixture);
    expect(rows()).toHaveLength(1);

    choose(host.querySelector('[data-status] select'), '404');
    await settle(fixture);
    const slow = reportRequest();
    expect(slow.request.params.get('status')).toBe('404');

    // A search sent before the status' answer came: that later answer is the one shown.
    type(host.querySelector('[data-search] input'), '  /api/nowhere ');
    host.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
    const latest = reportRequest();
    expect(latest.request.params.get('search')).toBe('/api/nowhere');
    latest.flush(report({ groups: [], total: 0, errors: 0, warnings: 0 }));
    await settle(fixture);
    slow.flush(report());
    await settle(fixture);

    expect(rows()).toHaveLength(0);
    expect(words(host.querySelector('[data-nothing]'))).toContain('Nothing matches');

    click(host.querySelector('[data-reset]'));
    await settle(fixture);
    request = reportRequest();
    expect(request.request.params.keys().sort()).toEqual(['days']);
    request.flush(report());
    await settle(fixture);
    expect((host.querySelector('[data-search] input') as HTMLInputElement).value).toBe('');
  });

  it('opens a row to its newest occurrence - request, route, who, the trace - and, asked, every occurrence', async () => {
    await setUp();
    await open();

    const toggle = rows()[0].querySelector<HTMLButtonElement>('[data-toggle]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await settle(fixture);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const detail = host.querySelector<HTMLElement>('[data-detail]')!;
    expect(detail.id).toBe(toggle.getAttribute('aria-controls'));
    expect(facts(detail)).toMatchObject({
      Request: 'POST /api/admin/users/42',
      Route: '/api/admin/users/{id}',
      'Thrown at': 'api/routes/admin.php:412',
      From: 'An answer of the server',
      'Signed in as': 'person 7',
      Connection: '3fa2c1b09e7d',
      Fingerprint: 'a1b2c3d4e5f6',
    });
    expect(detail.querySelector('a')?.getAttribute('href')).toBe('/admin/people/7');
    expect(detail.querySelector('[data-trace]')?.textContent).toBe('api/routes/admin.php:412 saveUser()\nvendor/slim/slim/Slim/Handlers/Strategies/RequestResponse.php:38 {closure}()');
    expect(detail.querySelector('[data-trace]')?.getAttribute('tabindex')).toBe('0');

    click(detail.querySelector('[data-occurrences-button]'));
    await settle(fixture);
    const request = http.expectOne((r) => r.url === `${BASE}/a1b2c3d4e5f6`);
    expect(request.request.params.get('days')).toBe('7');
    request.flush([entry(), entry({ at: `${DAY(1)}T10:00:00.000Z`, path: '/api/admin/users/9', user_id: null })]);
    await settle(fixture);
    const occurrences = host.querySelectorAll('[data-occurrences] tbody tr');
    expect(occurrences).toHaveLength(2);
    expect(cells(occurrences[1] as HTMLTableRowElement).slice(1)).toEqual(['POST /api/admin/users/9', 'nobody', '3fa2c1b09e7d']);

    // A path it came through, as the search.
    click(detail.querySelectorAll<HTMLElement>('[data-path]')[1]);
    await settle(fixture);
    const search = reportRequest();
    expect(search.request.params.get('search')).toBe('/api/admin/users/9');
    search.flush(report());
    await settle(fixture);

    toggle.click();
    await settle(fixture);
    expect(host.querySelector('[data-detail]')).toBeNull();
  });

  it('says plainly when nothing went wrong, when the log was full and when only the newest lines were read', async () => {
    await setUp();
    await open(report({ total: 0, errors: 0, warnings: 0, distinct: 0, groups: [], statuses: [], days: [] }));
    expect(words(host.querySelector('[data-quiet] .anotoki-empty-state__heading'))).toBe('Nothing has gone wrong');
    expect(words(host.querySelector('[data-quiet]'))).toContain('Not one failure in the last 7 days.');
    expect(host.querySelector<HTMLButtonElement>('[data-clear]')!.disabled).toBe(true);

    click(host.querySelector('[data-reload]'));
    await settle(fixture);
    reportRequest().flush(report({ truncated: true, dropped: { [TODAY]: 12 } }));
    await settle(fixture);
    expect(words(host.querySelector('[data-dropped]'))).toContain('12 lines');
    expect(host.querySelector('[data-truncated]')).not.toBeNull();
  });

  it('pages through many causes, twenty at a time', async () => {
    await setUp();
    const many = Array.from({ length: 25 }, (_, index) => group({ fingerprint: index.toString(16).padStart(12, '0'), count: 30 - index }));
    await open(report({ groups: many, distinct: 25 }));

    expect(rows()).toHaveLength(20);
    click(host.querySelector('anotoki-pagination [data-next]'));
    await settle(fixture);
    expect(rows()).toHaveLength(5);
    expect(rows()[0].getAttribute('data-fingerprint')).toBe((20).toString(16).padStart(12, '0'));
  });

  it('clears the days before today after asking - the focus on Cancel, Escape giving up', async () => {
    await setUp();
    await open();

    click(host.querySelector('[data-clear]'));
    await settle(fixture);
    expect(dialog()?.open).toBe(true);
    expect(document.activeElement?.hasAttribute('data-clear-cancel')).toBe(true);
    press(dialog()!, 'Escape');
    await settle(fixture);
    expect(dialog()).toBeNull();

    click(host.querySelector('[data-clear]'));
    await settle(fixture);
    expect(host.querySelector<HTMLInputElement>('anotoki-radio-group input[value="today"]')!.checked).toBe(true);
    click(host.querySelector('[data-clear-confirm]'));
    await settle(fixture);
    const request = http.expectOne((r) => r.method === 'DELETE' && r.url === BASE);
    expect(request.request.params.get('before')).toBe(TODAY);
    request.flush({ deleted: 3 });
    await settle(fixture);
    expect(dialog()).toBeNull();
    reportRequest().flush(report());
    await settle(fixture);
    expect(words(host.querySelector('[data-happened]'))).toBe('Cleared 3 files of the log.');
  });

  it('clears everything when asked to, and keeps the question open when the server refuses', async () => {
    await setUp();
    await open();

    click(host.querySelector('[data-clear]'));
    await settle(fixture);
    click(host.querySelector('anotoki-radio-group input[value="all"]'));
    await settle(fixture);
    click(host.querySelector('[data-clear-confirm]'));
    await settle(fixture);
    let request = http.expectOne((r) => r.method === 'DELETE' && r.url === BASE);
    expect(request.request.params.has('before')).toBe(false);
    refuse(request, 403, 'forbidden', 'This is for the site’s administrators.');
    await settle(fixture);
    expect(dialog()?.open).toBe(true);
    expect(words(dialog()!.querySelector('[role="alert"]'))).toBe('This is for the site’s administrators.');

    click(host.querySelector('[data-clear-confirm]'));
    await settle(fixture);
    request = http.expectOne((r) => r.method === 'DELETE' && r.url === BASE);
    request.flush({ deleted: 0 });
    await settle(fixture);
    reportRequest().flush(report());
    await settle(fixture);
    expect(words(host.querySelector('[data-happened]'))).toBe('There was nothing to clear.');
  });

  it('says why the log could not be read, and reads it again on Try again', async () => {
    await setUp();
    fixture = await draw(ErrorLogPageComponent);
    host = fixture.nativeElement;
    refuse(reportRequest(), 500, 'server_error', '');
    await settle(fixture);
    expect(words(host.querySelector('anotoki-error-state'))).toContain('Something went wrong on the server.');

    click(host.querySelector('anotoki-error-state button'));
    await settle(fixture);
    reportRequest().flush(report());
    await settle(fixture);
    expect(rows()).toHaveLength(2);
  });
});
