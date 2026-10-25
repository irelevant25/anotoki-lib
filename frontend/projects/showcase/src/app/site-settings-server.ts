import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import type { AdminPage, AdminSiteSettings, SitePart } from '@anotoki/lib/admin/site-settings';
import { Observable, delay, of, throwError } from 'rxjs';

/*
 * The showcase's imagined server for the site settings (0.11.0): the routes the PHP half answers
 * (Anotoki\Lib\SiteSettings - SiteSettingsRoutes::public() and ::admin(), and the site's status while the site is
 * closed), in their wire format, answered from memory - with the PHP half's refusals for a reserved page or API path.
 * The admin page's saves show at once on the showcase's own pages: the announcement bar, the administrators' notice,
 * the closed sign. Never published.
 *
 * ?iam=1: the IAM's site settings - the announcement alone.
 * ?announcement=info|warning|danger: the announcement shown from the start, of that kind.
 */

const params = new URLSearchParams(location.search);
const IAM = params.get('iam') === '1';
const SHOWN = params.get('announcement');

const RESERVED_PAGES = ['/auth', '/staff', '/admin', '/terms', '/privacy', '/contact', '/about', '/support'];
const RESERVED_API = ['/api/site-status', '/api/translations', '/api/site-settings', '/api/admin/site-settings', '/api/me', '/api/auth/config'];
const NOBODY = { updated_at: null, updated_by: null, updated_by_name: null };
const MIRA = () => ({ updated_at: new Date().toISOString(), updated_by: 7, updated_by_name: 'Mira Nováková' });

let nextId = 7;

function page(id: number, path: string, visibility: AdminPage['visibility'], blocked = false, apiPaths: string[] = []): AdminPage {
  return { id, path, visibility, blocked, api_paths: apiPaths, sort_order: id * 10, refused: null, ...NOBODY };
}

const parts: SitePart[] = IAM ? ['announcement'] : ['getting_in', 'announcement', 'page_access'];
const state: AdminSiteSettings = {
  parts,
  settings: {
    ...(IAM
      ? {}
      : {
          maintenance_mode: { value: false, ...NOBODY },
          maintenance_message: {
            value: {
              en: 'We are moving the site to a faster server.\nIt will be back by six this evening.',
              sk: 'Sťahujeme stránku na rýchlejší server.\nSpäť bude do šiestej večer.',
            },
            updated_at: '2026-10-20T08:12:00.000Z',
            updated_by: 7,
            updated_by_name: 'Mira Nováková',
          },
        }),
    announcement_enabled: { value: SHOWN !== null, ...NOBODY },
    announcement_level: { value: SHOWN === 'warning' || SHOWN === 'danger' ? SHOWN : 'info', ...NOBODY },
    announcement_message: {
      value: {
        en: 'Version 5.2 is out: every character of the new region is in the database.',
        sk: 'Verzia 5.2 je tu: všetky postavy nového regiónu sú v databáze.',
      },
      ...NOBODY,
    },
  },
  pages: IAM
    ? []
    : [
        page(1, '/', 'PUBLIC'),
        page(2, '/daily', 'PUBLIC', false, ['/api/quiz']),
        page(3, '/quizzes', 'USER', false, ['/api/quiz', '/api/quiz-history']),
        page(4, '/database/characters/:id', 'PUBLIC', true),
        page(5, '/site-settings', 'EDITOR'),
        page(6, '/beta', 'ADMIN', false, ['/api/beta']),
      ],
  levels: ['info', 'warning', 'danger'],
  visibilities: ['PUBLIC', 'USER', 'EDITOR', 'ADMIN'],
  reserved: { pages: RESERVED_PAGES, api_paths: RESERVED_API },
  limits: { message: 2000, message_languages: 30, api_paths: 20, pages: 500 },
};

const ok = (body: unknown, wait = 250, status = 200): Observable<HttpEvent<unknown>> => of(new HttpResponse({ status, body })).pipe(delay(wait));
const refuse = (status: number, code: string, message: string, wait = 250): Observable<never> =>
  throwError(() => new HttpErrorResponse({ status, statusText: 'Refused', error: { code, message } })).pipe(delay(wait));

const segments = (path: string) =>
  path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);

/** As the PHP half's PageRules::claimsPage(): a row's path that is, or could match, a reserved page or one under it. */
function claimsReserved(path: string): string | null {
  const row = segments(path);
  for (const reserved of RESERVED_PAGES) {
    const kept = segments(reserved);
    if (row.length >= kept.length && kept.every((segment, index) => row[index].startsWith(':') || row[index] === segment)) {
      return reserved;
    }
  }
  return null;
}

/** As the PHP half's PageRules::touches(): an API path that covers a reserved one, or is inside it. */
function touchesReserved(prefix: string): string | null {
  return RESERVED_API.find((reserved) => reserved.startsWith(prefix) || prefix === reserved || prefix.startsWith(`${reserved}/`)) ?? null;
}

function apiPathRefusal(prefix: string): string | null {
  if (!/^\/api(\/[A-Za-z0-9._~-]+)+$/.test(prefix)) {
    return `'${prefix}' is not an API path: they begin with /api/.`;
  }
  const reserved = touchesReserved(prefix);
  return reserved ? `'${prefix}' touches ${reserved}, which has to keep answering: who the reader is, how they sign in, the site's status, its words and these settings.` : null;
}

/** What every page is told (SiteSettings::publicBody()). */
function publicBody(): object {
  const settings = state.settings;
  const shown = settings.announcement_enabled?.value === true && Object.values(settings.announcement_message?.value ?? {}).some((text) => text.trim());
  return {
    ...(parts.includes('getting_in') ? { maintenance: settings.maintenance_mode?.value === true } : {}),
    announcement: shown ? { level: settings.announcement_level?.value, message: settings.announcement_message?.value } : null,
    ...(parts.includes('page_access') ? { pages: state.pages.map(({ path, visibility, blocked }) => ({ path, visibility, blocked })) } : {}),
  };
}

/** The status path while the showcase's closed sign is shown: the site closed, with the administrators' words. */
export function closedStatus(): object {
  return { state: 'maintenance', installed: true, maintenance_message: state.settings.maintenance_message?.value ?? {} };
}

export const siteSettingsServer: HttpInterceptorFn = (request, next) => {
  const url = request.url;
  const body = (request.body ?? null) as Record<string, unknown> | null;

  if (url === '/api/site-settings' && request.method === 'GET') {
    return ok(publicBody(), 150);
  }
  if (url === '/api/site-status' && location.pathname.startsWith('/maintenance')) {
    return ok(closedStatus(), 150);
  }
  if (!url.startsWith('/api/admin/site-settings')) {
    return next(request);
  }

  if (url === '/api/admin/site-settings') {
    if (request.method === 'PUT') {
      const values = (body?.['settings'] ?? {}) as Record<string, unknown>;
      for (const [name, value] of Object.entries(values)) {
        const row = (state.settings as Record<string, { value: unknown } | undefined>)[name];
        if (!row) {
          return refuse(422, 'unknown_setting', `There is no setting called '${name}'.`);
        }
        if (/_message$/.test(name) && Object.values(value as Record<string, string>).some((text) => text.length > 2000)) {
          return refuse(422, 'invalid_setting', `${name} is longer than 2000 characters.`);
        }
        Object.assign(row, { value }, MIRA());
      }
      return ok(state, 400);
    }
    return ok(state);
  }

  if (url === '/api/admin/site-settings/pages' && request.method === 'POST') {
    const path = String(body?.['path'] ?? '')
      .trim()
      .replace(/(.)\/+$/, '$1');
    if (!/^(\/:?[A-Za-z0-9][A-Za-z0-9._-]*)+$|^\/$/.test(path)) {
      return refuse(422, 'invalid_page', `'${path}' is not a path the site's router could declare: segments of letters, digits, dots, dashes and underscores, no empty one.`);
    }
    const reserved = claimsReserved(path);
    if (reserved) {
      return refuse(
        422,
        'invalid_page',
        `'${path}' would govern ${reserved}, which stays everybody's: the way in, the way back from the sign-in, the admin panel and the legal pages are never switched off or hidden.`,
      );
    }
    if (state.pages.some((row) => row.path === path)) {
      return refuse(409, 'page_exists', `'${path}' is governed already.`);
    }
    state.pages = [...state.pages, { ...page(nextId++, path, (body?.['visibility'] as AdminPage['visibility']) ?? 'ADMIN'), ...MIRA() }];
    return ok(state, 400, 201);
  }

  if (url === '/api/admin/site-settings/pages' && request.method === 'PUT') {
    const changes = (body?.['pages'] ?? []) as { id: number; visibility?: AdminPage['visibility']; blocked?: boolean; api_paths?: string[] }[];
    for (const change of changes) {
      for (const prefix of change.api_paths ?? []) {
        const refusal = apiPathRefusal(prefix);
        if (refusal) {
          return refuse(422, 'invalid_api_path', refusal);
        }
      }
    }
    state.pages = state.pages.map((row) => {
      const change = changes.find((each) => each.id === row.id);
      return change ? { ...row, visibility: change.visibility ?? row.visibility, blocked: change.blocked ?? row.blocked, api_paths: change.api_paths ?? row.api_paths, ...MIRA() } : row;
    });
    return ok(state, 400);
  }

  const removed = /^\/api\/admin\/site-settings\/pages\/(\d+)$/.exec(url);
  if (removed && request.method === 'DELETE') {
    const id = Number(removed[1]);
    if (!state.pages.some((row) => row.id === id)) {
      return refuse(404, 'not_found', 'There is no such page in the table.');
    }
    state.pages = state.pages.filter((row) => row.id !== id);
    return ok(state, 300);
  }

  return next(request);
};
