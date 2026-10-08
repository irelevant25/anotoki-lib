import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ANOTOKI_TRANSLATIONS_CONFIG,
  AdminLanguage,
  LanguageChanges,
  LanguageDeleted,
  NewLanguage,
  TranslationChanges,
  TranslationGrid,
  TranslationSettings,
  TranslationsFailure,
  translationSettings,
} from '@anotoki/lib/translations';
import { firstValueFrom } from 'rxjs';
import { fileNameFrom } from './translation-grid';

/**
 * The admin routes of a site's words (Anotoki\Lib\Translations\Http\TranslationsRoutes::strings()
 * and languages()), through the site's HttpClient - its interceptors add the
 * token or the session's CSRF header - at `admin.apiBase`.
 */
@Injectable({ providedIn: 'root' })
export class TranslationsAdminApi {
  private readonly http = inject(HttpClient);
  readonly settings: TranslationSettings = translationSettings(inject(ANOTOKI_TRANSLATIONS_CONFIG, { optional: true }));
  private readonly base = (this.settings.admin.apiBase || '/api/admin').replace(/\/+$/, '');

  /** Every language, the hidden ones too. */
  async languages(): Promise<AdminLanguage[]> {
    const answer = await firstValueFrom(this.http.get<{ languages?: AdminLanguage[] }>(`${this.base}/languages`));
    return answer?.languages ?? [];
  }

  /** Every key with its own string in every language. */
  async grid(): Promise<TranslationGrid> {
    return gridFrom(await firstValueFrom(this.http.get<TranslationGrid>(`${this.base}/translations`)));
  }

  /** Only what changed; all of it or none. Answers the grid as it is now. */
  async save(values: TranslationChanges): Promise<TranslationGrid> {
    return gridFrom(await firstValueFrom(this.http.put<TranslationGrid>(`${this.base}/translations`, { values })));
  }

  /** A language's own strings as the server's file, and the name it gives it. */
  async exportFile(code: string): Promise<{ text: string; name: string; count: number }> {
    const response = await firstValueFrom(this.http.get(`${this.base}/translations/${encodeURIComponent(code)}/export`, { responseType: 'text', observe: 'response' }));
    const text = response.body ?? '';
    let count = 0;
    try {
      count = Object.keys(JSON.parse(text) as object).length;
    } catch {
      // Not counted: the file is what the server sent.
    }
    return { text, name: fileNameFrom(response.headers.get('Content-Disposition'), `translations-${code}.json`), count };
  }

  /** A flat {key: text} into a language: a save's checks, an unknown key refused, an empty string passed over. */
  async importStrings(code: string, values: Record<string, string>): Promise<TranslationGrid> {
    return gridFrom(await firstValueFrom(this.http.put<TranslationGrid>(`${this.base}/translations/${encodeURIComponent(code)}/import`, values)));
  }

  async createLanguage(language: NewLanguage): Promise<AdminLanguage> {
    return (await firstValueFrom(this.http.post<{ language: AdminLanguage }>(`${this.base}/languages`, language))).language;
  }

  async updateLanguage(code: string, changes: LanguageChanges): Promise<AdminLanguage> {
    return (await firstValueFrom(this.http.put<{ language: AdminLanguage }>(`${this.base}/languages/${encodeURIComponent(code)}`, changes))).language;
  }

  async deleteLanguage(code: string): Promise<LanguageDeleted> {
    return await firstValueFrom(this.http.delete<LanguageDeleted>(`${this.base}/languages/${encodeURIComponent(code)}`));
  }

  /** A failure as the pages say it: the site's words for it when it has some, else the pages' own. */
  failureText(failure: TranslationsFailure): string {
    return this.settings.admin.failureText?.(failure) || defaultFailureText(failure);
  }
}

function gridFrom(grid: Partial<TranslationGrid> | null): TranslationGrid {
  return { languages: grid?.languages ?? [], keys: grid?.keys ?? [] };
}

/** A JSON object from an error's body, which may also arrive as text; null otherwise. */
function jsonObject(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/**
 * A failed request, read whatever the site's HTTP layer made of it: Angular's
 * HttpErrorResponse (the body any site's error shape - `{code, message}`, the
 * IAM's `{error, code}`, build-analyzer's `{message, code}`), or a site's own
 * error object that already says `status`, `code` and `message` (the IAM's
 * interceptor turns every failure into one).
 */
export function readFailure(error: unknown): TranslationsFailure {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { status: 0, code: 'network', message: 'The server could not be reached.', details: {} };
    }
    const body = jsonObject(error.error);
    const code = typeof body?.['code'] === 'string' ? (body['code'] as string) : error.status >= 500 ? 'server_error' : 'unknown';
    const said = [body?.['message'], body?.['error']].find((value): value is string => typeof value === 'string' && value !== '');
    const details: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(body ?? {})) {
      if (name !== 'code' && name !== 'message' && name !== 'error') {
        details[name] = value;
      }
    }
    return { status: error.status, code, message: said ?? '', details };
  }
  const own = error as { status?: unknown; code?: unknown; message?: unknown; details?: unknown } | null;
  if (own && typeof own === 'object' && typeof own.status === 'number' && typeof own.code === 'string') {
    return {
      status: own.status,
      code: own.code,
      message: typeof own.message === 'string' ? own.message : '',
      details: own.details && typeof own.details === 'object' ? (own.details as Record<string, unknown>) : {},
    };
  }
  return { status: -1, code: 'unknown', message: error instanceof Error ? error.message : '', details: {} };
}

/** The pages' own words for a failure: the server's sentence (English, and specific) where it gave one. */
export function defaultFailureText(failure: TranslationsFailure): string {
  if (failure.status === 0) {
    return 'The server could not be reached. Check the connection and try again.';
  }
  if (failure.status === 401) {
    return 'The sign-in has ended. Sign in again - what you typed is kept in this tab.';
  }
  if (failure.message) {
    return failure.message;
  }
  if (failure.status === 403) {
    return 'You may not do this: the site says it is for somebody else.';
  }
  if (failure.status >= 500) {
    return 'Something went wrong on the server. Try again; the server’s error log says more.';
  }
  return 'The request failed.';
}

/** A detail of a failure that is a string (the key or the language a refusal is about), else null. */
export function failureDetail(failure: TranslationsFailure, name: string): string | null {
  const value = failure.details[name];
  return typeof value === 'string' && value !== '' ? value : null;
}
