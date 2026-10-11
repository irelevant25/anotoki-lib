import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnotokiPeopleConfig, PeopleList, PeoplePerson, provideAnotokiPeople } from '@anotoki/lib/people';
import { PeoplePageComponent } from './people-page.component';

const API = '/api/admin/people';

/** A person as the server lists them: Piano Academy's shape, with its columns. */
function person(sub: string, name: string | null, more: Partial<PeoplePerson> = {}): PeoplePerson {
  return {
    sub,
    name,
    first_seen_at: '2026-09-01T08:00:00Z',
    last_seen_at: '2026-10-10T18:30:00Z',
    anonymized_at: null,
    iam_url: `https://iam.test/admin/users/${sub}`,
    notes: 12,
    time_zone: 'Europe/Bratislava',
    last_import: '2026-10-09T07:15:00Z',
    ...more,
  };
}

function answer(more: Partial<PeopleList> = {}): PeopleList {
  return {
    people: [person('8', 'Bob'), person('7', 'mira', { notes: null, time_zone: null, last_import: null }), person('9', 'deleted-9', { anonymized_at: '2026-11-06T10:00:00Z' }), person('12', null)],
    columns: [
      { key: 'notes', label: 'Notes', kind: 'count' },
      { key: 'time_zone', label: 'Time zone', kind: 'text' },
      { key: 'last_import', label: 'Last import', kind: 'time' },
    ],
    total: 4,
    page: 1,
    page_size: 50,
    visitors: { count: 14 },
    sync: { since: '2026-11-06T10:00:00Z', checked_at: '2026-11-07T09:00:00Z', ok_at: '2026-11-07T09:00:00Z', error: null, scrubbed: 1 },
    ready: true,
    problems: [],
    ...more,
  };
}

describe('<anotoki-people-page>: the people who signed in to the site', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PeoplePageComponent>;
  let host: HTMLElement;

  function setUp(config: AnotokiPeopleConfig | null = { me: () => '7', formatDate: (iso) => iso.slice(0, 10) }): void {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideRouter([]), ...(config === null ? [] : [provideAnotokiPeople(() => config)])],
    });
    http = TestBed.inject(HttpTestingController);
  }

  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(PeoplePageComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }

  /** The request for a page (and a search), answered. */
  async function list(body: PeopleList | null, page = '1', search: string | null = null): Promise<TestRequest> {
    const request = http.expectOne((sent) => sent.method === 'GET' && sent.url === API && sent.params.get('page') === page && sent.params.get('q') === search);
    if (body !== null) {
      request.flush(body);
      await settle();
    }
    return request;
  }

  async function open(config?: AnotokiPeopleConfig | null, body: PeopleList = answer()): Promise<void> {
    setUp(config);
    await draw();
    await list(body);
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((done) => setTimeout(done));
      await fixture?.whenStable();
    }
  }

  const words = (element: Element | null | undefined): string | null => element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const row = (sub: string) => host.querySelector<HTMLElement>(`[data-person="${sub}"]`)!;
  const cells = (sub: string) => Array.from(row(sub).children).map(words);
  const headings = () => Array.from(host.querySelectorAll('[data-people] thead th')).map(words);
  const outcome = () => words(host.querySelector('[data-outcome]'));

  afterEach(() => {
    host?.remove();
    fixture?.destroy();
    http.verify();
  });

  it('is the administrators’ alone: anybody else is told, and nothing is asked of the server', async () => {
    const admin = signal(false);
    setUp({ isAdmin: admin });
    await draw();
    expect(words(host)).toBe('People are for administrators.');
    http.expectNone(API);

    admin.set(true);
    await settle();
    await list(answer());
    expect(words(host.querySelector('h1'))).toBe('People');
  });

  it('lists them newest seen first: the name, "you", the IAM id, first and last seen, the site’s columns, and a link to the IAM', async () => {
    await open();
    expect(host.getAttribute('lang')).toBe('en');
    expect(words(host.querySelector('[data-total]'))).toBe('4 people');
    expect(headings()).toEqual(['Name', 'IAM id', 'First seen', 'Last seen', 'Notes', 'Time zone', 'Last import', 'Actions']);
    expect(Array.from(host.querySelectorAll('[data-person]')).map((element) => (element as HTMLElement).dataset['person'])).toEqual(['8', '7', '9', '12']);

    expect(cells('8')).toEqual(['Bob', '8', '2026-09-01', '2026-10-10', '12', 'Europe/Bratislava', '2026-10-09', 'Open at the IAM']);
    // The reader's own row; a count the site has no row for is none; text and times it has none of: a dash to see,
    // "none" to hear.
    expect(cells('7')).toEqual(['mira you', '7', '2026-09-01', '2026-10-10', '0', '–none', '–none', 'Open at the IAM']);
    expect(row('7').querySelector('[data-column="time_zone"] [aria-hidden="true"]')?.textContent).toBe('–');
    expect(row('7').querySelector('[data-column="time_zone"] .anotoki-visually-hidden')?.textContent).toBe('none');
    expect(row('7').querySelector('[data-you]')).not.toBeNull();
    expect(row('8').querySelector('[data-you]')).toBeNull();
    // Somebody the site never learned a name of.
    expect(words(row('12').querySelector('th'))).toBe('No name');

    const link = row('8').querySelector<HTMLAnchorElement>('[data-iam]')!;
    expect(link.getAttribute('href')).toBe('https://iam.test/admin/users/8');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.getAttribute('aria-label')).toBe("Open at the IAM: Bob (the IAM's admin panel, in a new tab)");
    expect(words(host.querySelector('.anotoki-people-page__iam-note'))).toBe("“Open at the IAM” opens the account in the IAM's admin panel - for the IAM's administrators.");
    expect(host.querySelector('[data-people] th[scope=row]')).not.toBeNull();
    // No delete where the site gives none - its PeopleRoutes has no delete hook then.
    expect(host.querySelector('[data-delete]')).toBeNull();
    // Fewer than a page: no paging.
    expect(host.querySelector('anotoki-pagination')).toBeNull();
    expect(words(host.querySelector('[data-visitors]'))).toBe('14 visitors - people using the site without signing in.');
  });

  it('an account the IAM deleted: there, muted, said to be deleted - its data stays, nobody’s now', async () => {
    await open();
    expect(row('9').classList).toContain('anotoki-people-page__row--anonymized');
    expect(words(row('9').querySelector('th'))).toBe('deleted-9 Deleted at the IAM on 6 Nov 2026');
    expect(row('9').querySelector('time')?.getAttribute('datetime')).toBe('2026-11-06T10:00:00Z');
    expect(row('8').classList).not.toContain('anotoki-people-page__row--anonymized');
  });

  it('a time nobody on the page has is not drawn: a site without a last-seen column (the build analyzer)', async () => {
    const people = answer().people.map((one) => ({ ...one, last_seen_at: null }));
    await open(undefined, answer({ people, columns: [] }));
    expect(headings()).toEqual(['Name', 'IAM id', 'First seen', 'Actions']);
  });

  it('where the scrub of the IAM’s deleted accounts stands - checked, how many scrubbed, or why it stopped - and Check now', async () => {
    await open();
    const sync = () => words(host.querySelector('[data-sync]'));
    expect(sync()).toBe("Accounts deleted at the IAM Last checked 2026-11-07; 1 person scrubbed here so far - their names the IAM's placeholders, the rest of their data kept. Check now");

    host.querySelector<HTMLButtonElement>('[data-sync-now]')!.click();
    await settle();
    const run = http.expectOne({ method: 'POST', url: `${API}/sync` });
    run.flush({
      run: { state: 'done', handled: 2, scrubbed: 1, error: null, problems: [] },
      sync: { since: '2026-11-08T10:00:00Z', checked_at: '2026-11-08T12:00:00Z', ok_at: '2026-11-08T12:00:00Z', error: null, scrubbed: 2 },
    });
    await settle();
    expect(outcome()).toBe("Checked: 1 person scrubbed here - their names are the IAM's placeholders now.");
    // The names it scrubbed, and where it stands now: the list read again, on the page it was.
    await list(answer({ sync: { since: null, checked_at: '2026-11-08T12:00:00Z', ok_at: '2026-11-07T09:00:00Z', error: 'The IAM answered 502.', scrubbed: 2 } }));
    expect(host.querySelector('[data-sync]')?.classList).toContain('anotoki-people-page__sync--stopped');
    expect(words(host.querySelector('[data-sync-error]'))).toBe('The last check, 2026-11-08, stopped: The IAM answered 502.');
  });

  it('a check the IAM did not answer, or another one running: said as it is', async () => {
    await open();
    host.querySelector<HTMLButtonElement>('[data-sync-now]')!.click();
    await settle();
    http.expectOne({ method: 'POST', url: `${API}/sync` }).flush({ run: { state: 'unreachable', handled: 0, scrubbed: 0, error: 'no answer in 3 s', problems: [] }, sync: null });
    await settle();
    expect(outcome()).toBe('The IAM could not be asked: no answer in 3 s. The next check tries again.');
    expect(host.querySelector('[data-outcome]')?.getAttribute('role')).toBe('alert');
    await list(answer());
  });

  describe('finding a person', () => {
    it('by name or IAM id, at Enter - from the first page, saying how many were found - and Clear goes back', async () => {
      await open();
      const box = host.querySelector<HTMLInputElement>('input[type=search]')!;
      expect(box.placeholder).toBe('Name or IAM id');
      expect(words(host.querySelector('label'))).toBe('Find a person');
      box.value = '  mira ';
      box.dispatchEvent(new Event('input'));
      host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      await list(answer({ people: [person('7', 'mira')], total: 1 }), '1', 'mira');
      expect(words(host.querySelector('[data-found]'))).toBe('1 person found for “mira”');
      expect(host.querySelector('[data-total]')).toBeNull();

      host.querySelector<HTMLButtonElement>('[data-clear]')!.click();
      await settle();
      await list(answer());
      expect(host.querySelector('[data-found]')).toBeNull();
      expect(box.value).toBe('');
    });

    it('as the typing rests, and only the latest answer counts', async () => {
      await open();
      const box = host.querySelector<HTMLInputElement>('input[type=search]')!;
      box.value = 'bo';
      box.dispatchEvent(new Event('input'));
      await new Promise((done) => setTimeout(done, 450));
      await settle();
      const early = await list(null, '1', 'bo');
      box.value = 'bob';
      box.dispatchEvent(new Event('input'));
      await new Promise((done) => setTimeout(done, 450));
      await settle();
      await list(answer({ people: [person('8', 'Bob')], total: 1 }), '1', 'bob');
      early.flush(answer({ people: [], total: 0 }));
      await settle();
      expect(words(host.querySelector('[data-found]'))).toBe('1 person found for “bob”');
      expect(host.querySelectorAll('[data-person]')).toHaveLength(1);
    });

    it('nobody found: said so, with no table', async () => {
      await open();
      const box = host.querySelector<HTMLInputElement>('input[type=search]')!;
      box.value = 'zoe';
      box.dispatchEvent(new Event('input'));
      host.querySelector<HTMLButtonElement>('[data-search]')!.click();
      await settle();
      await list(answer({ people: [], total: 0 }), '1', 'zoe');
      expect(words(host.querySelector('[data-found]'))).toBe('Nobody found for “zoe”');
      expect(host.querySelector('[data-people]')).toBeNull();
      expect(host.querySelector('[data-empty]')).toBeNull();
    });
  });

  it('pages of 50: the kit’s paging, and the next page asked for', async () => {
    const many = Array.from({ length: 50 }, (_, index) => person(String(index + 100), `person ${index}`));
    await open(undefined, answer({ people: many, total: 120 }));
    expect(words(host.querySelector('anotoki-pagination .anotoki-pagination__range'))).toBe('1-50 of 120');
    host.querySelector<HTMLButtonElement>('anotoki-pagination [data-next]')!.click();
    await settle();
    await list(answer({ people: many.map((one) => ({ ...one, sub: one.sub + '0' })), total: 120, page: 2 }), '2');
    expect(words(host.querySelector('anotoki-pagination .anotoki-pagination__range'))).toBe('51-100 of 120');
    expect(row('1000')).not.toBeNull();
  });

  describe('deleting what the site keeps of a person', () => {
    const DELETE = { delete: {}, me: () => '7', formatDate: (iso: string) => iso.slice(0, 10) } satisfies AnotokiPeopleConfig;

    it('asks first - the family’s question naming the counts, the focus on Cancel - and deletes nothing on Cancel', async () => {
      await open(DELETE);
      const button = row('8').querySelector<HTMLButtonElement>('[data-delete]')!;
      expect(words(button)).toBe('Delete their data');
      expect(button.getAttribute('aria-label')).toBe('Delete their data: Bob');
      button.click();
      await settle();
      const dialog = host.querySelector('[data-confirm]')!;
      expect(words(dialog.querySelector('.anotoki-dialog__title'))).toBe('Delete what the site keeps of Bob?');
      expect(words(dialog.querySelector('.anotoki-dialog__description'))).toBe(
        'It all goes (Notes: 12), and cannot be brought back. Their anotoki account stays: signing in again, they start afresh here.',
      );
      expect(document.activeElement).toBe(dialog.querySelector('[data-confirm-cancel]'));
      dialog.querySelector<HTMLButtonElement>('[data-confirm-cancel]')!.click();
      await settle();
      expect(host.querySelector('[data-confirm]')).toBeNull();
    });

    it('deletes, says what went in the site’s labels with its note, reads the list again - and tells the site', async () => {
      const done: [string, unknown][] = [];
      await open({ ...DELETE, delete: { label: 'Delete their progress', done: (one, deleted) => done.push([one.sub, deleted]) } });
      row('7').querySelector<HTMLButtonElement>('[data-delete]')!.click();
      await settle();
      expect(words(host.querySelector('[data-confirm] .anotoki-dialog__description'))).toContain('This is you.');
      host.querySelector<HTMLButtonElement>('[data-confirm-delete]')!.click();
      await settle();
      expect(row('7').querySelector('[data-delete]')?.getAttribute('aria-busy')).toBe('true');
      http.expectOne({ method: 'DELETE', url: `${API}/7` }).flush({ deleted: { Progress: 40, Sessions: 3 }, note: 'Their row stays: the IAM keeps the person.' });
      await settle();
      expect(words(host.querySelector('[data-outcome] .anotoki-people-page__alert-text'))).toBe('Deleted what the site kept of mira - Progress: 40, Sessions: 3.');
      expect(words(host.querySelector('[data-outcome] .anotoki-people-page__alert-note'))).toBe('Their row stays: the IAM keeps the person.');
      expect(host.querySelector('[data-outcome]')?.getAttribute('role')).toBe('status');
      expect(done).toEqual([['7', { deleted: { Progress: 40, Sessions: 3 }, note: 'Their row stays: the IAM keeps the person.' }]]);
      await list(answer());
    });

    it('somebody gone meanwhile, or a refusal: said, nothing deleted', async () => {
      await open(DELETE);
      row('8').querySelector<HTMLButtonElement>('[data-delete]')!.click();
      await settle();
      host.querySelector<HTMLButtonElement>('[data-confirm-delete]')!.click();
      await settle();
      http.expectOne({ method: 'DELETE', url: `${API}/8` }).flush({ code: 'not_found', message: 'There is nobody with that id here.' }, { status: 404, statusText: 'Not Found' });
      await settle();
      expect(outcome()).toBe('Bob is not here any more: nothing was deleted.');
      await list(answer());

      row('8').querySelector<HTMLButtonElement>('[data-delete]')!.click();
      await settle();
      host.querySelector<HTMLButtonElement>('[data-confirm-delete]')!.click();
      await settle();
      http.expectOne({ method: 'DELETE', url: `${API}/8` }).flush({ code: 'busy', message: 'A backup is being made: try again in a minute.' }, { status: 409, statusText: 'Conflict' });
      await settle();
      expect(outcome()).toBe('Nothing was deleted. A backup is being made: try again in a minute.');
      expect(host.querySelector('[data-outcome]')?.getAttribute('role')).toBe('alert');
      await list(answer());
    });

    it('the site’s own question and its rule of who has anything to delete', async () => {
      await open({
        ...DELETE,
        delete: {
          question: (one, columns) => ({ title: `Delete ${one.name}'s game accounts?`, message: `${columns.length} columns`, confirm: 'Delete them' }),
          allowed: (one) => one['notes'] !== null,
        },
      });
      expect(row('7').querySelector<HTMLButtonElement>('[data-delete]')!.disabled).toBe(true);
      row('8').querySelector<HTMLButtonElement>('[data-delete]')!.click();
      await settle();
      expect(words(host.querySelector('[data-confirm] .anotoki-dialog__title'))).toBe("Delete Bob's game accounts?");
      expect(words(host.querySelector('[data-confirm] .anotoki-dialog__description'))).toBe('3 columns');
      expect(words(host.querySelector('[data-confirm-delete]'))).toBe('Delete them');
    });
  });

  it('what the database still lacks, with the way to the Migrations page', async () => {
    await open({ migrationsRoute: '/admin/migrations' }, answer({ ready: false, problems: ["users has no column anonymized_at yet: the site's own migration adds it."], sync: null }));
    expect(words(host.querySelector('[data-problems] .anotoki-alert__heading'))).toBe('Not everything the page needs is in the database yet');
    expect(Array.from(host.querySelectorAll('[data-problems] li')).map(words)).toEqual(["users has no column anonymized_at yet: the site's own migration adds it."]);
    expect(words(host.querySelector('[data-problems] [data-migrations-link]'))).toBe('Open Migrations');
    expect(host.querySelector('[data-problems] [data-migrations-link]')?.getAttribute('href')).toBe('/admin/migrations');
    expect(host.querySelector('[data-sync]')).toBeNull();
  });

  it('no table yet (503): said, with Migrations and Look again; any other failure, with Try again', async () => {
    setUp({ migrationsRoute: '/admin/migrations' });
    await draw();
    (await list(null)).flush({ code: 'people_unavailable', message: 'There is no table users yet.' }, { status: 503, statusText: 'Service Unavailable' });
    await settle();
    expect(words(host.querySelector('[data-unavailable] .anotoki-alert__heading'))).toBe('The people are not in the database yet');
    expect(words(host.querySelector('[data-unavailable] .anotoki-people-page__alert-text'))).toBe('There is no table users yet.');
    expect(Array.from(host.querySelectorAll('[data-unavailable] [anotokiButton], [data-unavailable] .anotoki-button')).map(words)).toEqual(['Open Migrations', 'Look again']);
    expect(host.querySelector('[data-people]')).toBeNull();

    Array.from(host.querySelectorAll<HTMLButtonElement>('[data-unavailable] button')).at(-1)!.click();
    await settle();
    (await list(null)).flush('', { status: 500, statusText: 'Server Error' });
    await settle();
    expect(words(host.querySelector('[data-load-error]'))).toContain('The people could not be loaded');
    expect(words(host.querySelector('[data-load-error]'))).toContain('The server answered 500 Server Error.');
    host.querySelector<HTMLButtonElement>('[data-load-error] button')!.click();
    await settle();
    await list(answer());
    expect(host.querySelectorAll('[data-person]')).toHaveLength(4);
  });

  it('nobody yet: said calmly; the site’s own lead and visitors line; the defaults without any configuration', async () => {
    await open(
      { lead: 'Everybody who practises here.', visitorsLine: (visitors) => `${visitors.count} visitors with ${visitors['sessions']} rounds.` },
      answer({ people: [], total: 0, visitors: { count: 2, sessions: 5 } }),
    );
    expect(words(host.querySelector('.anotoki-page-header__lead'))).toBe('Everybody who practises here.');
    expect(words(host.querySelector('[data-empty] .anotoki-empty-state__heading'))).toBe('Nobody has signed in yet');
    expect(words(host.querySelector('[data-empty] .anotoki-empty-state__text'))).toBe('A person is listed here from the first time they use the site signed in.');
    expect(words(host.querySelector('[data-visitors]'))).toBe('2 visitors with 5 rounds.');

    TestBed.resetTestingModule();
    host.remove();
    await open(null, answer({ visitors: { count: 1 } }));
    expect(words(host.querySelector('.anotoki-page-header__lead'))).toBe('Everybody who has signed in here, the most recently seen first - and what the site keeps of them.');
    expect(words(host.querySelector('[data-visitors]'))).toBe('1 visitor - people using the site without signing in.');
    expect(host.querySelector('[data-you]')).toBeNull();
  });

  it('a site’s function may inject its own services', async () => {
    class Reader {
      readonly sub = '8';
    }
    TestBed.configureTestingModule({ providers: [Reader] });
    await open({ me: () => inject(Reader).sub });
    expect(row('8').querySelector('[data-you]')).not.toBeNull();
  });
});
