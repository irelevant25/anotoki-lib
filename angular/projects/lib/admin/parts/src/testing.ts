/*
 * What the admin tools' specs share: the site's configuration as signals the
 * test sets, a zoneless app with HttpClient's testing backend, and the
 * server's refusals in the library's error body. Only the specs import this.
 */

import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider, Type, WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnotokiAdminConfig, provideAnotokiAdmin } from '@anotoki/lib/admin';

export const API = '/api/admin';

/** The person and what the site says of them - signals the test sets. */
export interface AdminSite {
  admin: WritableSignal<boolean>;
  signedInAgain: number;
}

export function adminSite(): AdminSite {
  return { admin: signal(true), signedInAgain: 0 };
}

/** A zoneless app with the admin tools configured for `site`. */
export function adminProviders(site: AdminSite, config: Partial<AnotokiAdminConfig> = {}, ...extra: (Provider | EnvironmentProviders)[]): (Provider | EnvironmentProviders)[] {
  return [
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
    provideAnotokiAdmin(() => ({
      isAdmin: () => site.admin(),
      signInAgain: () => {
        site.signedInAgain++;
      },
      ...config,
    })),
    ...extra,
  ];
}

/** Lets pending promises, timers of 0 and change detection run out. */
export async function settle(fixture?: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((done) => setTimeout(done));
    await fixture?.whenStable();
  }
}

/** Draws a page (in the document, so the focus can move), and lets it settle. */
export async function draw<T>(component: Type<T>): Promise<ComponentFixture<T>> {
  const fixture = TestBed.createComponent(component);
  document.body.appendChild(fixture.nativeElement);
  await settle(fixture);
  return fixture;
}

/** An element's words, its white space folded. */
export function words(element: Element | null | undefined): string | null {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
}

/** Types into a field, as a person does: the value, then the input event. */
export function type(element: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
  if (!element) {
    throw new Error('No field to type into.');
  }
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Chooses an option of a native select. */
export function choose(element: HTMLSelectElement | null, value: string): void {
  if (!element) {
    throw new Error('No select to choose in.');
  }
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Presses a key on an element (the event bubbles, and can be cancelled). */
export function press(target: Element | Document, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** The server refusing, in the library's error body ({code, message, ...extra}). */
export function refusal(status: number, code: string, message: string, extra: Record<string, unknown> = {}): { status: number; statusText: string; body: Record<string, unknown> } {
  return { status, statusText: 'Refused', body: { code, message, ...extra } };
}

/** Answers a request with a refusal. */
export function refuse(request: TestRequest, status: number, code: string, message: string, extra: Record<string, unknown> = {}): void {
  const answer = refusal(status, code, message, extra);
  request.flush(answer.body, { status: answer.status, statusText: answer.statusText });
}

/** The one open request for `url` (its path, without the query) and `method`. */
export function expectOne(http: HttpTestingController, method: string, url: string): TestRequest {
  return http.expectOne((request) => request.method === method && request.url === url, `${method} ${url}`);
}

/** An HttpErrorResponse as a site's own HTTP layer would pass it on. */
export function httpError(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'Refused', error: body });
}

/** The element under `root` matching `selector`, or a failure that says which was missing. */
export function find<T extends Element = HTMLElement>(root: Element | Document, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Nothing matches ${selector}.`);
  }
  return element;
}

/** Clicks an element as a person does. */
export function click(element: Element | null): void {
  if (!element) {
    throw new Error('Nothing to click.');
  }
  (element as HTMLElement).click();
}
