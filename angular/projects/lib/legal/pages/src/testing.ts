/*
 * What the legal pages' specs share (never in the package: tsconfig.lib.json leaves testing.ts out) - a sample
 * site's facts, the pages drawn with them, and the page's text as a person reads it.
 */

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type, WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnotokiLegalConfig, LegalFacts, provideAnotokiLegal } from '@anotoki/lib/legal';

/** A sample site's facts: a site people sign in to, with visitors and feedback. */
export function sampleFacts(overrides: Partial<LegalFacts> = {}): LegalFacts {
  return {
    site: 'Piano Academy',
    about: 'Piano Academy teaches reading music and playing the piano, a little every day.',
    updated: '2026-10-20',
    account: { deleteUrl: 'https://iam.example.test/account/security', privacyUrl: 'https://iam.example.test/privacy' },
    data: [
      {
        name: 'Your record here',
        what: "Your anotoki account's id, your name, and when you were first and last here.",
        why: 'To know whose progress is whose.',
        kept: 'Until your anotoki account is deleted; then your name goes.',
      },
      { name: 'Your progress', what: 'The lessons you did, your scores and when.', why: 'To show your progress and plan what comes next.', kept: 'Until you delete it, or your account is deleted.' },
    ],
    visitors: { what: 'Your progress, under a random key kept in this browser.', kept: '30 days after your last visit.' },
    feedback: true,
    storage: [
      { preset: 'signInHint', name: 'anotoki_signed_in' },
      { preset: 'signIn', name: 'anotoki-auth:piano' },
      { preset: 'theme', name: 'piano-academy:theme' },
      { preset: 'language', name: 'piano-academy:language' },
      { preset: 'visitorKey', name: 'piano-academy:visitor', kept: 'Until you sign in, or 30 days after your last visit.' },
    ],
    processors: [{ preset: 'hosting' }, { preset: 'cloudflare' }],
    ...overrides,
  };
}

export interface DrawnPage<T> {
  fixture: ComponentFixture<T>;
  host: HTMLElement;
  language: WritableSignal<string>;
  facts: WritableSignal<LegalFacts>;
}

/** A page drawn with the sample facts (or others), in the page's language, the router and HttpClient at hand. */
export async function drawPage<T>(page: Type<T>, options: { facts?: Partial<LegalFacts>; config?: Partial<Omit<AnotokiLegalConfig, 'facts'>>; language?: string } = {}): Promise<DrawnPage<T>> {
  const language = signal(options.language ?? 'en');
  const facts = signal(sampleFacts(options.facts));
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideAnotokiLegal(() => ({ language: () => language(), ...options.config, facts: () => facts() })),
    ],
  });
  const fixture = TestBed.createComponent(page);
  const host = fixture.nativeElement as HTMLElement;
  document.body.appendChild(host);
  await settle(fixture);
  return { fixture, host, language, facts };
}

/** Lets pending promises, timers of 0 and change detection run out. */
export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }
}

/** An element's words as a person reads them, each piece of text apart. */
export function words(element: Element | null | undefined): string | null {
  if (!element) {
    return null;
  }
  const parts: string[] = [];
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    parts.push(node.textContent ?? '');
  }
  // Each piece apart (a heading's words never run into the next), no space before a full stop a link was followed by.
  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,:;])/g, '$1')
    .trim();
}

/** The headings, in the page's order: their levels never skip one going down (h1, h2, h3), and there is one h1. */
export function headingLevels(host: HTMLElement): number[] {
  return Array.from(host.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((heading) => Number(heading.tagName[1]));
}

export function inOrder(levels: number[]): boolean {
  return levels[0] === 1 && levels.filter((level) => level === 1).length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1);
}
