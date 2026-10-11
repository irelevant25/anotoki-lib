import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { AdminSite, adminProviders, adminSite, choose, click, draw, press, refuse, settle, type, words } from '../../../parts/src/testing';
import { FeedbackFacets, FeedbackList, FeedbackMessage } from '../models';
import { FeedbackPageComponent } from './feedback-page.component';

const BASE = '/api/admin/feedback';

function message(overrides: Partial<FeedbackMessage> = {}): FeedbackMessage {
  return {
    id: 12,
    created_at: '2026-10-10T08:00:00.000Z',
    updated_at: '2026-10-10T08:00:00.000Z',
    kind: 'bug',
    status: 'new',
    section: 'Characters',
    subject: 'The talent list is empty',
    message: 'Opening Amber shows no talents.\nIt worked yesterday.',
    details: { steps: 'Open Amber, then Talents.' },
    contact_email: 'reader@example.test',
    user_id: 42,
    user_name: 'reader42',
    page: '/characters/amber',
    language: 'sk',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64)',
    handled_by: null,
    handled_by_name: null,
    handled_at: null,
    ...overrides,
  };
}

const IDEA = message({
  id: 11,
  kind: 'idea',
  status: 'read',
  section: null,
  subject: null,
  message: 'A dark map would be lovely at night.',
  details: {},
  contact_email: null,
  user_id: null,
  user_name: null,
  page: '/map',
  user_agent: null,
});

function list(items: FeedbackMessage[] = [message(), IDEA], overrides: Partial<FeedbackList> = {}): FeedbackList {
  return { total: items.length, page: 1, pageSize: 25, items, ...overrides };
}

function facets(overrides: Partial<FeedbackFacets> = {}): FeedbackFacets {
  return {
    kinds: ['bug', 'idea', 'other'],
    statuses: ['new', 'read', 'resolved', 'spam'],
    sections: ['Characters', 'Weapons'],
    fields: { steps: 5000 },
    byStatus: { new: 3, read: 4, resolved: 1, spam: 0 },
    byKind: { bug: 5, idea: 3, other: 0 },
    ...overrides,
  };
}

describe('<anotoki-feedback-page>: what visitors sent, opened, marked and deleted', () => {
  let site: AdminSite;
  let http: HttpTestingController;
  let unread: FeedbackUnread;
  let fixture: ComponentFixture<FeedbackPageComponent>;
  let host: HTMLElement;

  function setUp(): void {
    site = adminSite();
    TestBed.configureTestingModule({
      providers: adminProviders(site, { personLink: (id) => ['/admin/people', id], migrationsRoute: '/admin/migrations', feedbackFields: { steps: 'Steps to reproduce' } }),
    });
    http = TestBed.inject(HttpTestingController);
    unread = TestBed.inject(FeedbackUnread);
  }

  function listRequest(): TestRequest {
    return http.expectOne((request) => request.method === 'GET' && request.url === BASE, 'GET the list');
  }

  /** The list and the counts, answered. */
  async function answer(items: FeedbackList = list(), counts: FeedbackFacets = facets()): Promise<TestRequest> {
    await settle(fixture);
    const request = listRequest();
    http.expectOne(`${BASE}/facets`).flush(counts);
    request.flush(items);
    await settle(fixture);
    return request;
  }

  async function open(items: FeedbackList = list(), counts: FeedbackFacets = facets()): Promise<TestRequest> {
    fixture = await draw(FeedbackPageComponent);
    host = fixture.nativeElement;
    return answer(items, counts);
  }

  /** Opens a message of the list; the server answers it (read now, when it was new). */
  async function view(index: number, answered: FeedbackMessage): Promise<void> {
    click(host.querySelectorAll('[data-message]')[index]);
    await settle(fixture);
    http.expectOne(`${BASE}/${answered.id}`).flush({ message: answered });
    await settle(fixture);
  }

  const items = () => Array.from(host.querySelectorAll<HTMLElement>('[data-message]'));
  const viewer = () => host.querySelector<HTMLDialogElement>('anotoki-dialog[data-viewer] dialog');
  const facts = () => Object.fromEntries(Array.from(host.querySelectorAll('[data-facts] > div')).map((fact) => [words(fact.querySelector('dt')), words(fact.querySelector('dd'))]));

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it('is for the ADMIN alone: anybody else is told whose it is, and nothing is asked', async () => {
    setUp();
    site.admin.set(false);
    fixture = await draw(FeedbackPageComponent);
    host = fixture.nativeElement;
    expect(words(host)).toBe('Feedback is for the administrators of the site.');
    http.expectNone(() => true);
  });

  it('lists the messages, newest first, with their status, kind, words and sender - and the unread count for the badge', async () => {
    setUp();
    const request = await open();

    expect(request.request.params.keys()).toEqual([]);
    expect(words(host.querySelector('[data-counts]'))).toBe('3 new');
    expect(unread.count()).toBe(3);
    expect(items().map((item) => words(item))).toEqual([
      expect.stringMatching(/^New Bug Characters .+ The talent list is empty Opening Amber shows no talents\. It worked yesterday\. From reader42 · on \/characters\/amber$/),
      expect.stringMatching(/^Read Idea .+ A dark map would be lovely at night\. From Anonymous · on \/map$/),
    ]);
    expect(items()[0].classList).toContain('anotoki-feedback-page__item--new');
    expect(words(host.querySelector('[data-status]'))).toBe('All 8 New 3 Read 4 Resolved 1 Spam 0');
  });

  it('narrows by status, kind, section and a search - the first page of each', async () => {
    setUp();
    await open(list([message()], { total: 60 }));

    click(host.querySelector('anotoki-pagination [data-next]'));
    let request = await answer(list([message({ id: 3 })], { total: 60, page: 2 }));
    expect(request.request.params.get('page')).toBe('2');

    click(host.querySelector('[data-status] [data-value="new"]'));
    request = await answer();
    expect([request.request.params.get('status'), request.request.params.has('page')]).toEqual(['new', false]);

    choose(host.querySelector('[data-kind] select'), 'bug');
    request = await answer();
    expect(request.request.params.get('kind')).toBe('bug');

    choose(host.querySelector('[data-section] select'), 'Weapons');
    request = await answer(list([]));
    expect(request.request.params.get('section')).toBe('Weapons');
    expect(words(host.querySelector('[data-nothing]'))).toContain('No message matches');

    type(host.querySelector('[data-search] input'), ' amber ');
    host.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit', { cancelable: true }));
    request = await answer();
    expect(request.request.params.get('search')).toBe('amber');

    click(host.querySelector('[data-reset]'));
    request = await answer();
    expect(request.request.params.keys()).toEqual([]);
  });

  it('opens a message whole - marking a new one read, the counts and the badge following', async () => {
    setUp();
    await open();

    await view(0, message({ status: 'read' }));
    expect(viewer()?.open).toBe(true);
    expect(words(viewer()!.querySelector('.anotoki-dialog__title'))).toBe('The talent list is empty');
    expect(viewer()!.querySelector('[data-words]')?.textContent).toBe('Opening Amber shows no talents.\nIt worked yesterday.');
    expect(words(viewer()!.querySelector('[data-field="steps"]'))).toBe('Steps to reproduce Open Amber, then Talents.');
    expect(facts()).toMatchObject({ From: 'reader42', 'Answer at': 'reader@example.test', Page: '/characters/amber', Language: 'sk', Browser: 'Mozilla/5.0 (X11; Linux x86_64)' });
    expect(viewer()!.querySelector('[data-facts] a[href="/admin/people/42"]')).not.toBeNull();
    expect(viewer()!.querySelector('a[href="mailto:reader@example.test"]')).not.toBeNull();
    expect(viewer()!.querySelector('[data-mark] [aria-checked="true"]')?.getAttribute('data-value')).toBe('read');

    expect(words(items()[0].querySelector('[data-status]'))).toBe('Read');
    expect(words(host.querySelector('[data-counts]'))).toBe('2 new');
    expect(unread.count()).toBe(2);

    press(viewer()!, 'Escape');
    await settle(fixture);
    expect(viewer()).toBeNull();
  });

  it('marks a message resolved at once, and shows what is true again when the server refuses', async () => {
    setUp();
    await open();
    await view(1, IDEA);

    click(viewer()!.querySelector('[data-mark] [data-value="resolved"]'));
    await settle(fixture);
    let request = http.expectOne(`${BASE}/11/status`);
    expect([request.request.method, request.request.body]).toEqual(['PUT', { status: 'resolved' }]);
    request.flush({ message: { ...IDEA, status: 'resolved', handled_at: '2026-10-11T09:00:00.000Z', handled_by: 7, handled_by_name: 'mira' } });
    await settle(fixture);
    expect(words(items()[1].querySelector('[data-status]'))).toBe('Resolved');
    expect(words(host.querySelector('[data-happened]'))).toBe('"A dark map would be lovely at night." is resolved now.');
    expect(facts()['Last marked']).toMatch(/ by mira$/);
    expect(words(host.querySelector('[data-status]'))).toContain('Read 3 Resolved 2');

    click(viewer()!.querySelector('[data-mark] [data-value="spam"]'));
    await settle(fixture);
    request = http.expectOne(`${BASE}/11/status`);
    refuse(request, 422, 'status_unknown', 'A message is new, read, resolved or spam.');
    await settle(fixture);
    expect(words(viewer()!.querySelector('[data-view-error]'))).toBe('A message is new, read, resolved or spam.');
    expect(viewer()!.querySelector('[data-mark] [aria-checked="true"]')?.getAttribute('data-value')).toBe('resolved');
  });

  it('deletes a message after a question whose focus starts on No', async () => {
    setUp();
    await open();
    await view(1, IDEA);

    click(viewer()!.querySelector('[data-delete]'));
    await settle(fixture);
    const question = () => host.querySelector<HTMLDialogElement>('anotoki-dialog[data-question] dialog');
    expect(question()?.open).toBe(true);
    expect(document.activeElement?.hasAttribute('data-question-no')).toBe(true);
    click(question()!.querySelector('[data-question-no]'));
    await settle(fixture);
    http.expectNone(`${BASE}/11`);
    expect(viewer()?.open).toBe(true);

    click(viewer()!.querySelector('[data-delete]'));
    await settle(fixture);
    click(question()!.querySelector('[data-question-yes]'));
    await settle(fixture);
    const request = http.expectOne(`${BASE}/11`);
    expect(request.request.method).toBe('DELETE');
    request.flush({ deleted: true });
    await answer(list([message()]));
    expect(viewer()).toBeNull();
    expect(items()).toHaveLength(1);
    expect(words(host.querySelector('[data-happened]'))).toBe('"A dark map would be lovely at night." is deleted.');
  });

  it('says so while its table waits for an update, and that nothing came yet when nothing did', async () => {
    setUp();
    fixture = await draw(FeedbackPageComponent);
    host = fixture.nativeElement;
    refuse(listRequest(), 503, 'feature_unavailable', 'Feedback is not open yet.');
    refuse(http.expectOne(`${BASE}/facets`), 503, 'feature_unavailable', 'Feedback is not open yet.');
    await settle(fixture);
    expect(words(host.querySelector('[data-unavailable]'))).toContain('Apply the pending database update first');
    expect(host.querySelector('[data-migrations-link]')?.getAttribute('href')).toBe('/admin/migrations');

    click(host.querySelector('[data-reload]'));
    await answer(list([]), facets({ byStatus: { new: 0, read: 0, resolved: 0, spam: 0 } }));
    expect(words(host.querySelector('[data-empty]'))).toContain('No feedback yet');
    expect(words(host.querySelector('[data-counts]'))).toBe('Nothing new');
    expect(unread.count()).toBe(0);
  });
});

describe("FeedbackUnread: the admin navigation's badge", () => {
  it("asks the server for the site's ADMIN alone, and keeps the latest answer", async () => {
    const site = adminSite();
    TestBed.configureTestingModule({ providers: adminProviders(site) });
    const http = TestBed.inject(HttpTestingController);
    const unread = TestBed.inject(FeedbackUnread);

    site.admin.set(false);
    await unread.refresh();
    http.expectNone(() => true);
    expect(unread.count()).toBeNull();

    site.admin.set(true);
    const first = unread.refresh();
    const second = unread.refresh();
    const [early, late] = http.match(`${BASE}/unread`);
    late.flush({ unread: 4 });
    early.flush({ unread: 9 });
    await Promise.all([first, second]);
    expect(unread.count()).toBe(4);

    const failing = unread.refresh();
    refuse(http.expectOne(`${BASE}/unread`), 503, 'feature_unavailable', 'Not yet.');
    await failing;
    expect(unread.count()).toBe(4);
    http.verify();
  });
});
