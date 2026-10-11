import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AdminSite, adminProviders, adminSite, choose, click, draw, refuse, settle, type, words } from '../../../parts/src/testing';
import { readDetails, summary } from '../details';
import { AuditEntry, AuditFacets, AuditPage } from '../models';
import { AuditLogPageComponent } from './audit-log-page.component';

const BASE = '/api/admin/audit';

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 101,
    created_at: '2026-10-10T09:30:00.000Z',
    actor_id: 7,
    actor_username: 'mira',
    actor_session: 'sess-9f2',
    action: 'user.roles_set',
    target_type: 'user',
    target_id: '42',
    scope_type: null,
    scope_id: null,
    details: { before: { roles: ['MEMBER'] }, after: { roles: ['ADMIN', 'MEMBER'] } },
    ip: '203.0.113.5',
    ...overrides,
  };
}

function page(
  items: AuditEntry[] = [
    entry(),
    entry({
      id: 100,
      actor_id: null,
      actor_username: null,
      action: 'backup.created',
      target_type: 'backup',
      target_id: '20261010-000000Z-daily-abc',
      details: { kind: 'daily', size: 52_430 },
      ip: null,
      actor_session: null,
    }),
  ],
  overrides: Partial<AuditPage> = {},
): AuditPage {
  return { total: items.length, page: 1, pageSize: 50, items, ...overrides };
}

const FACETS: AuditFacets = {
  actions: ['account.created', 'account.password_changed', 'backup.created', 'user.roles_set'],
  target_types: ['backup', 'user'],
  scope_types: ['characters'],
  actors: [
    { id: 7, username: 'mira' },
    { id: 9, username: null },
  ],
};

describe('<anotoki-audit-log-page>: who did what, narrowed by the address', () => {
  let site: AdminSite;
  let http: HttpTestingController;
  let router: Router;
  let fixture: ComponentFixture<AuditLogPageComponent>;
  let host: HTMLElement;

  function setUp(): void {
    site = adminSite();
    TestBed.configureTestingModule({ providers: adminProviders(site, { personLink: (id) => ['/admin/people', id], migrationsRoute: '/admin/migrations' }) });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  }

  /** The open request of a page of entries. */
  function pageRequest(): TestRequest {
    return http.expectOne((request) => request.method === 'GET' && request.url === BASE, 'GET a page of the log');
  }

  async function open(answer: AuditPage = page(), at = '/'): Promise<TestRequest> {
    await router.navigateByUrl(at);
    fixture = await draw(AuditLogPageComponent);
    host = fixture.nativeElement;
    const request = pageRequest();
    http.expectOne(`${BASE}/facets`).flush(FACETS);
    request.flush(answer);
    await settle(fixture);
    return request;
  }

  /** A change of the filters: the address first, then the request it makes. */
  async function next(answer: AuditPage = page()): Promise<TestRequest> {
    await settle(fixture);
    const request = pageRequest();
    request.flush(answer);
    await settle(fixture);
    return request;
  }

  const rows = () => Array.from(host.querySelectorAll<HTMLTableRowElement>('[data-entries] tbody tr[data-entry]'));
  const cells = (row: HTMLTableRowElement) => Array.from(row.cells).map((cell) => words(cell));
  const query = () => router.parseUrl(router.url).queryParams;

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it('is for the ADMIN alone: anybody else is told whose it is, and nothing is asked', async () => {
    setUp();
    site.admin.set(false);
    fixture = await draw(AuditLogPageComponent);
    host = fixture.nativeElement;

    expect(words(host)).toBe('The audit log is for the administrators of the site.');
    http.expectNone(() => true);
  });

  it('shows the newest entries: when, who (a link to the person), the action, what about, the details in a line', async () => {
    setUp();
    const request = await open();

    expect(request.request.params.keys()).toEqual([]);
    expect(words(host.querySelector('[data-counts]'))).toBe('2 entries');
    expect(rows().map((row) => cells(row).slice(1, 4))).toEqual([
      ['mira', 'user.roles_set', 'user 42'],
      ['The system', 'backup.created', 'backup 20261010-000000Z-daily-abc'],
    ]);
    expect(rows()[0].querySelector('a')?.getAttribute('href')).toBe('/admin/people/7');
    expect(words(rows()[1].querySelector('[data-toggle]'))).toBe('{"kind":"daily","size":52430}');
    expect(host.querySelector('anotoki-pagination')).toBeNull();
  });

  it('takes its filters from the address, and writes each change of them there', async () => {
    setUp();
    const first = await open(page(), '/?target_type=user&target_id=42&from=2026-10-01');
    expect([first.request.params.get('target_type'), first.request.params.get('target_id'), first.request.params.get('from')]).toEqual(['user', '42', '2026-10-01']);
    expect((host.querySelector('[data-target-id] input') as HTMLInputElement).value).toBe('42');

    choose(host.querySelector('[data-actor] select'), '7');
    let request = await next();
    expect(query()).toEqual({ target_type: 'user', target_id: '42', from: '2026-10-01', actor: '7' });
    expect(request.request.params.get('actor')).toBe('7');

    // A family of actions: its beginning.
    const actions = Array.from(host.querySelectorAll<HTMLOptionElement>('[data-action] option')).map((option) => option.value);
    expect(actions).toEqual(['', 'account.', 'account.created', 'account.password_changed', 'backup.created', 'user.roles_set']);
    choose(host.querySelector('[data-action] select'), 'account.');
    request = await next();
    expect(request.request.params.get('action')).toBe('account.');

    type(host.querySelector('[data-target-id] input'), ' 43 ');
    host.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit', { cancelable: true }));
    request = await next();
    expect(request.request.params.get('target_id')).toBe('43');

    type(host.querySelector('[data-to] input'), '2026-10-0');
    await settle(fixture);
    http.expectNone((r) => r.url === BASE);
    type(host.querySelector('[data-to] input'), '2026-10-09');
    request = await next();
    expect(request.request.params.get('to')).toBe('2026-10-09');

    click(host.querySelector('[data-clear-filters]'));
    request = await next();
    expect(request.request.params.keys()).toEqual([]);
    expect(query()).toEqual({});
  });

  it('narrows to everything about one thing, and to everything filed under what it belongs to', async () => {
    setUp();
    const talent = page([entry({ scope_type: 'characters', scope_id: '12', target_type: 'talents', target_id: '88' })]);
    await open(talent);

    click(host.querySelector('[data-within]'));
    let request = await next(talent);
    expect([request.request.params.get('scope_type'), request.request.params.get('scope_id')]).toEqual(['characters', '12']);
    expect(words(host.querySelector('[data-scope]'))).toBe('Everything filed under characters 12 Not only these');

    click(host.querySelector('[data-about]'));
    request = await next();
    expect([request.request.params.get('target_type'), request.request.params.get('target_id'), request.request.params.get('scope_id')]).toEqual(['talents', '88', '12']);

    click(host.querySelector('[data-clear-scope]'));
    request = await next();
    expect(request.request.params.has('scope_type')).toBe(false);
    expect(host.querySelector('[data-scope]')).toBeNull();
  });

  it('opens an entry to what changed, field by field, with every other fact and the whole as recorded', async () => {
    setUp();
    await open();

    const toggle = rows()[0].querySelector<HTMLButtonElement>('[data-toggle]')!;
    toggle.click();
    await settle(fixture);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const detail = host.querySelector<HTMLElement>('[data-detail]')!;
    expect(detail.id).toBe(toggle.getAttribute('aria-controls'));
    expect(Array.from(detail.querySelectorAll('[data-changes] tbody tr')).map((row) => Array.from(row.children).map((cell) => words(cell)))).toEqual([['roles', '["MEMBER"]', '["ADMIN","MEMBER"]']]);
    const facts = Object.fromEntries(Array.from(detail.querySelectorAll('[data-facts] > div')).map((fact) => [words(fact.querySelector('dt')), words(fact.querySelector('dd'))]));
    expect(facts).toMatchObject({ Session: 'sess-9f2', Address: '203.0.113.5', Entry: '101' });
    expect(detail.querySelector('[data-json]')?.textContent).toBe(JSON.stringify(entry().details, null, 2));

    toggle.click();
    await settle(fixture);
    expect(host.querySelector('[data-detail]')).toBeNull();
  });

  it('pages fifty at a time, the page in the address', async () => {
    setUp();
    await open(page([entry()], { total: 120 }));

    click(host.querySelector('anotoki-pagination [data-next]'));
    const request = await next(page([entry({ id: 51 })], { total: 120, page: 2 }));
    expect(request.request.params.get('page')).toBe('2');
    expect(query()).toEqual({ page: '2' });
    expect(rows()[0].getAttribute('data-entry')).toBe('51');
  });

  it('says so while its table waits for an update, offering the Migrations page', async () => {
    setUp();
    await router.navigateByUrl('/');
    fixture = await draw(AuditLogPageComponent);
    host = fixture.nativeElement;
    refuse(http.expectOne(`${BASE}/facets`), 503, 'feature_unavailable', 'The audit log is not there yet.');
    refuse(pageRequest(), 503, 'feature_unavailable', 'The audit log is not there yet.');
    await settle(fixture);

    expect(words(host.querySelector('[data-unavailable]'))).toContain('Apply the pending database update first');
    expect(host.querySelector('[data-migrations-link]')?.getAttribute('href')).toBe('/admin/migrations');
    expect(host.querySelector('form[role="search"]')).toBeNull();
  });

  it('tells an empty log from a filter nothing matches, and a failure from both', async () => {
    setUp();
    await open(page([]));
    expect(words(host.querySelector('[data-empty]'))).toContain('Nothing recorded yet');

    choose(host.querySelector('[data-actor] select'), '9');
    await next(page([]));
    expect(words(host.querySelector('[data-nothing]'))).toContain('No entry matches');

    click(host.querySelector('[data-reload]'));
    await settle(fixture);
    refuse(pageRequest(), 500, 'server_error', 'The database cannot be reached.');
    await settle(fixture);
    expect(words(host.querySelector('anotoki-error-state'))).toContain('The database cannot be reached.');
  });
});

describe('readDetails(): what an entry says changed', () => {
  it("reads genshin's row diff, {before, after} and {from, to} as a change - the rest as facts", () => {
    expect(readDetails({ name: { old: 'Amber', new: 'Amber (old)' }, rarity: { old: 4, new: 4 } }, 'content.update')).toEqual({
      changes: [
        { field: 'name', before: 'Amber', after: 'Amber (old)', changed: true },
        { field: 'rarity', before: '4', after: '4', changed: false },
      ],
      facts: [],
    });
    expect(readDetails({ before: { a: 1 }, after: { a: 1, b: null }, via: 'command line' }, 'settings.changed')).toEqual({
      changes: [
        { field: 'a', before: '1', after: '1', changed: false },
        { field: 'b', before: '-', after: '-', changed: false },
      ],
      facts: [{ name: 'via', value: 'command line' }],
    });
    expect(readDetails({ from: 'new', to: 'resolved' }, 'feedback.status_changed')).toEqual({ changes: [{ field: 'status', before: 'new', after: 'resolved', changed: true }], facts: [] });
    expect(readDetails({ before: false, after: true }, 'user.enabled')).toEqual({ changes: [{ field: 'enabled', before: 'false', after: 'true', changed: true }], facts: [] });
    expect(readDetails({ kind: 'daily', size: 10 }, 'backup.created')).toEqual({
      changes: [],
      facts: [
        { name: 'kind', value: 'daily' },
        { name: 'size', value: '10' },
      ],
    });
    expect(readDetails(null, 'x.y')).toEqual({ changes: [], facts: [] });
    expect(readDetails(['a'], 'x.y')).toEqual({ changes: [], facts: [{ name: 'details', value: '["a"]' }] });
  });

  it('summarises the details on one line, cut short', () => {
    expect(summary({})).toBe('');
    expect(summary(null)).toBe('');
    expect(summary({ a: 'x'.repeat(200) })).toHaveLength(90);
    expect(summary({ a: 'x'.repeat(200) }).endsWith('…')).toBe(true);
  });
});
