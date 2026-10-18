import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { PeopleColumn, PeopleList, PeoplePerson, PeopleSync } from '@anotoki/lib/people';
import { Observable, delay, of, throwError } from 'rxjs';

/*
 * The showcase's imagined server for the People page: a site's people in memory, behind the routes the PHP half's
 * PeopleRoutes::admin() answers - GET /api/admin/people?q=&page=, DELETE /api/admin/people/{sub}, POST
 * /api/admin/people/sync - in their wire format. ?people=unready: the database lacks the site's anonymized_at and
 * the last check of the IAM's deleted accounts stopped; ?people=down: no table yet (503). Never published.
 */

const API = '/api/admin/people';
const PAGE_SIZE = 50;
const mode = new URLSearchParams(location.search).get('people');

const FIRST = ['Mira', 'Jo', 'Ľudmila', 'Peter', 'Zuzana', 'Tomáš', 'Eva', 'Martin', 'Katarína', 'Juraj', 'Lucia', 'Ondrej', 'Hana', 'Marek', 'Alžbeta', 'Samuel'];
const LAST = ['Nováková', 'Kováč', 'Horváthová', 'Varga', 'Tóthová', 'Baláž', 'Szabó', 'Molnár'];
const ZONES = ['Europe/Bratislava', 'Europe/Prague', 'Europe/Vienna', 'Asia/Tokyo', null];
const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-11T09:00:00Z');

const iso = (time: number): string => new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Sixty-three people, the newest seen first; one without a name, three the IAM deleted (their names its placeholders). */
const people: PeoplePerson[] = Array.from({ length: 63 }, (_, index) => {
  const sub = String(index + 1);
  const anonymized = ['19', '33', '58'].includes(sub);
  const name = sub === '7' ? 'Mira Nováková' : sub === '12' ? null : `${FIRST[index % FIRST.length]} ${LAST[(index * 3) % LAST.length]}`;
  return {
    sub,
    name: anonymized ? `deleted-${sub}` : name,
    first_seen_at: iso(NOW - (400 - index * 5) * 24 * HOUR),
    last_seen_at: iso(NOW - (index * 7 + 1) * HOUR),
    anonymized_at: anonymized ? iso(NOW - (index + 2) * 24 * HOUR) : null,
    iam_url: `https://iam.example.test/admin/users/${sub}`,
    notes: index % 6 === 5 ? null : (index * 37) % 140,
    time_zone: ZONES[index % ZONES.length],
    last_import: index % 4 === 0 ? null : iso(NOW - (index * 11 + 3) * HOUR),
  };
});

const columns: PeopleColumn[] = [
  { key: 'notes', label: 'Notes', kind: 'count' },
  { key: 'time_zone', label: 'Time zone', kind: 'text' },
  { key: 'last_import', label: 'Last import', kind: 'time' },
];

let sync: PeopleSync =
  mode === 'unready'
    ? { since: iso(NOW - 30 * 24 * HOUR), checked_at: iso(NOW - 2 * HOUR), ok_at: iso(NOW - 26 * HOUR), error: 'The IAM answered 502: it could not be asked.', scrubbed: 3 }
    : { since: iso(NOW - 9 * 24 * HOUR), checked_at: iso(NOW - 2 * HOUR), ok_at: iso(NOW - 2 * HOUR), error: null, scrubbed: 3 };

function list(search: string, page: number): PeopleList {
  const query = search.trim().toLowerCase();
  const found = people.filter((person) => query === '' || (person.name ?? '').toLowerCase().includes(query) || person.sub === query);
  return {
    people: found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    columns,
    total: found.length,
    page,
    page_size: PAGE_SIZE,
    visitors: { count: 14, sessions: 31 },
    sync,
    ready: mode !== 'unready',
    problems: mode === 'unready' ? ["users has no column anonymized_at yet: the site's own migration adds it."] : [],
  };
}

function answer(body: unknown, wait = 400): Observable<HttpEvent<unknown>> {
  return of(new HttpResponse({ status: 200, body })).pipe(delay(wait));
}

function refuse(status: number, code: string, message: string): Observable<never> {
  return throwError(() => new HttpErrorResponse({ status, statusText: 'Refused', url: API, error: { code, message } })).pipe(delay(300));
}

export const peopleServer: HttpInterceptorFn = (request, next) => {
  if (request.url !== API && !request.url.startsWith(`${API}/`)) {
    return next(request);
  }
  if (mode === 'down') {
    return refuse(503, 'people_unavailable', 'There is no table users yet.');
  }
  if (request.method === 'GET' && request.url === API) {
    const page = Number(request.params.get('page') ?? '1');
    return answer(list(request.params.get('q') ?? '', Number.isInteger(page) && page > 0 ? page : 1));
  }
  if (request.method === 'POST' && request.url === `${API}/sync`) {
    // The IAM deleted one more account meanwhile: its name becomes the placeholder.
    const next = people.find((person) => person.anonymized_at === null && person.sub === '41');
    if (next) {
      next.name = `deleted-${next.sub}`;
      next.anonymized_at = iso(Date.now());
    }
    sync = { since: iso(Date.now()), checked_at: iso(Date.now()), ok_at: iso(Date.now()), error: null, scrubbed: sync.scrubbed + (next ? 1 : 0) };
    return answer({ run: { state: 'done', handled: next ? 1 : 0, scrubbed: next ? 1 : 0, error: null, problems: [] }, sync }, 800);
  }
  if (request.method === 'DELETE') {
    const person = people.find((one) => one.sub === decodeURIComponent(request.url.slice(API.length + 1)));
    if (!person) {
      return refuse(404, 'not_found', 'There is nobody with that id here.');
    }
    const deleted = { Notes: Number(person['notes'] ?? 0), Imports: person['last_import'] ? 2 : 0 };
    person['notes'] = null;
    person['last_import'] = null;
    return answer({ deleted, note: 'Their row stays: the IAM keeps the person.' }, 600);
  }
  return refuse(405, 'method_not_allowed', 'Not here.');
};
