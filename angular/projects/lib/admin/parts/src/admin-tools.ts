import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { ANOTOKI_ADMIN_CONFIG, AdminFailure, AdminTool, adminBase } from '@anotoki/lib/admin';
import { firstValueFrom } from 'rxjs';
import { defaultFailureText, readFailure } from './failure';
import { defaultFormatDate } from './format';

/** A query's parameters: an empty or missing one is left out. */
export type QueryParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

/**
 * What the admin tools' pages share of the site: its configuration
 * (provideAnotokiAdmin), its HttpClient - its interceptors add the token or
 * the session's CSRF header - and how a date, a failure and a link the server
 * gives are said and opened.
 */
@Injectable({ providedIn: 'root' })
export class AdminTools {
  private readonly http = inject(HttpClient);
  readonly config = inject(ANOTOKI_ADMIN_CONFIG, { optional: true });

  /** The site's ADMIN: the pages are theirs alone. Followed. */
  readonly isAdmin = computed(() => this.config?.isAdmin() ?? false);
  readonly siteName = this.config?.siteName || 'the site';
  readonly migrationsRoute = this.config?.migrationsRoute || null;

  /** A tool's routes, '/api/admin/errors'. */
  base(tool: AdminTool): string {
    return adminBase(this.config, tool);
  }

  /** A date and time as the site writes them (default '6 Oct 2026, 10:01'); with seconds, to the second. */
  date(iso: string | null | undefined, seconds = false): string {
    if (!iso) {
      return '';
    }
    return (seconds ? null : this.config?.formatDate?.(iso)) || defaultFormatDate(iso, seconds);
  }

  /** A path the server gave (a download, a preview) as the browser opens it - only a path of this site's own, never another address. */
  url(path: string): string | null {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\s]/.test(path)) {
      return null;
    }
    return this.config?.resolveUrl ? this.config.resolveUrl(path) : path;
  }

  /** A person's page in the site's admin panel, or null. */
  personLink(id: number | string | null | undefined): string | readonly unknown[] | null {
    return id === null || id === undefined || id === '' ? null : (this.config?.personLink?.(id) ?? null);
  }

  failure(error: unknown): AdminFailure {
    return readFailure(error);
  }

  /** A failure as the page says it: the site's words when it has some, else the pages' own. */
  say(failure: AdminFailure): string {
    return this.config?.failureText?.(failure) || defaultFailureText(failure);
  }

  get<T>(url: string, params: QueryParams = {}): Promise<T> {
    return firstValueFrom(this.http.get<T>(url, { params: query(params) }));
  }

  post<T>(url: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(url, body));
  }

  put<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(url, body));
  }

  /** A DELETE, with a body where the server asks for one (a password). */
  delete<T>(url: string, params: QueryParams = {}, body?: unknown): Promise<T> {
    return firstValueFrom(this.http.delete<T>(url, { params: query(params), body }));
  }
}

/** The parameters that say something: an empty string, null and undefined are left out. */
export function query(params: QueryParams): HttpParams {
  let out = new HttpParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      out = out.set(name, String(value));
    }
  }
  return out;
}
