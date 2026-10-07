/*
 * What the specs share: a site as they imagine it, and the providers that wire
 * the module into it. Only the specs import this; it is not part of the package.
 */

import { EnvironmentProviders, Provider, WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Routes, provideRouter } from '@angular/router';
import { type Mock } from 'vitest';
import { AnotokiMigrationsConfig, provideAnotokiMigrations } from './config';
import { RELOAD_PAGE } from './reload';
import { siteStatusInterceptor } from './site-status.interceptor';

export const STATUS_URL = '/api/site-status';
export const API_BASE = '/api/admin/migrations';
export const MIGRATIONS_ROUTE = '/admin/migrations';

/** The site around the module: who is signed in, as what, in which language - each a signal the test sets. */
export interface TestSite {
  admin: WritableSignal<boolean>;
  signedIn: WritableSignal<boolean>;
  language: WritableSignal<string>;
  signIn: Mock<() => unknown>;
  onUpToDate: Mock<() => unknown>;
  reload: Mock<() => void>;
}

export function testSite(): TestSite {
  return {
    admin: signal(false),
    signedIn: signal(false),
    language: signal('en'),
    signIn: vi.fn<() => unknown>(),
    onUpToDate: vi.fn<() => unknown>(),
    reload: vi.fn<() => void>(),
  };
}

/** The providers of a zoneless app with the module configured for `site` (and anything the test adds). */
export function provideTestSite(site: TestSite, extra: Partial<AnotokiMigrationsConfig> = {}, routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([siteStatusInterceptor])),
    provideHttpClientTesting(),
    provideRouter(routes),
    provideAnotokiMigrations(() => ({
      statusUrl: STATUS_URL,
      apiBase: API_BASE,
      migrationsRoute: MIGRATIONS_ROUTE,
      isAdmin: site.admin,
      isSignedIn: site.signedIn,
      signIn: site.signIn,
      language: site.language,
      onUpToDate: site.onUpToDate,
      ...extra,
    })),
    { provide: RELOAD_PAGE, useValue: site.reload },
  ];
}

/** Lets pending promises, timers of 0 and change detection run out. */
export async function settle(fixture?: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done));
    await fixture?.whenStable();
  }
}

/** An element's words, its white space folded. */
export function words(element: Element | null | undefined): string | null {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
}
