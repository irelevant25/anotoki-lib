/*
 * What the admin pages' specs share: a site's grid and languages as its
 * server answers them, the person and what they may do, and a zoneless app
 * with HttpClient's testing backend. Only the specs import this.
 */

import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider, WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminLanguage, TranslationGrid, TranslationsAdminConfig, provideAnotokiTranslations } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';

export const API = '/api/admin';

export const ENGLISH: AdminLanguage = { code: 'en', name: 'English', native_name: 'English', enabled: true, sort_order: 1, seeded: true, strings: 7, accounts: 12 };
export const SLOVAK: AdminLanguage = { code: 'sk', name: 'Slovak', native_name: 'Slovenčina', enabled: true, sort_order: 2, seeded: true, strings: 4, accounts: 3 };
export const CZECH: AdminLanguage = { code: 'cs', name: 'Czech', native_name: 'Čeština', enabled: false, sort_order: 3, seeded: false, strings: 2, accounts: 0 };

/** A site's grid: a key of its own, a plural family, a lone `.other` (a key, not a family), and a mail in two parts. */
export function grid(): TranslationGrid {
  return {
    languages: [ENGLISH, SLOVAK],
    keys: [
      { name: 'greeting.named', description: 'The home page. Placeholders: {name}.', values: { en: 'Hello, {name}!', sk: 'Ahoj, {name}!' } },
      { name: 'mail.reset.greeting', description: 'The password reset mail: the first line.', values: { en: 'Hello {username},' } },
      { name: 'mail.reset.subject', description: 'The password reset mail: its subject.', values: { en: 'Reset your password', sk: 'Obnov si heslo' } },
      { name: 'reviews.due.few', description: 'The home page: reviews due (2-4).', values: { en: '{count} reviews due', sk: '{count} opakovania' } },
      { name: 'reviews.due.one', description: 'The home page: one review due.', values: { en: '{count} review due' } },
      { name: 'reviews.due.other', description: 'The home page: reviews due.', values: { en: '{count} reviews due', sk: '{count} opakovaní' } },
      { name: 'sessions.ended.other', description: 'A session ended some other way.', values: { en: 'Ended', sk: 'Ukončená' } },
      { name: 'theme.label', description: 'The theme switch. No placeholders.', values: { en: 'Theme', sk: 'Vzhľad' } },
    ],
  };
}

/** The server refusing, in the default error body ({code, message, ...extra}). */
export function refusal(status: number, code: string, message: string, extra: Record<string, unknown> = {}): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'Refused', error: { code, message, ...extra } });
}

/** The person and what the site lets them do - signals the test sets. */
export interface AdminSite {
  strings: WritableSignal<boolean>;
  languages: WritableSignal<boolean>;
  person: WritableSignal<string | null>;
}

export function adminSite(): AdminSite {
  return { strings: signal(true), languages: signal(true), person: signal('7') };
}

/** A zoneless app with the module's admin pages configured for `site` - a Slovak page outside them. */
export function adminProviders(site: AdminSite, admin: Partial<TranslationsAdminConfig> = {}): (Provider | EnvironmentProviders)[] {
  return [
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
    ...provideTestTranslations({ 'theme.label': 'Vzhľad' }, { language: 'sk', english: { 'theme.label': 'Theme' } }),
    provideAnotokiTranslations(() => ({
      storagePrefix: 'test-site',
      account: { language: () => 'sk', userKey: () => site.person() },
      admin: {
        allows: { strings: () => site.strings(), languages: () => site.languages() },
        routes: { translations: '/admin/translations', languages: '/admin/languages', migrations: '/admin/migrations' },
        ...admin,
      },
    })),
  ];
}

/** Lets pending promises, timers of 0 and change detection run out. */
export async function settle(fixture?: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((done) => setTimeout(done));
    await fixture?.whenStable();
  }
}

/** An element's words, its white space folded. */
export function words(element: Element | null | undefined): string | null {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
}

/** Types into a text field or a box, as a person does: the value, then the input event. */
export function type(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
