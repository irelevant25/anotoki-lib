/*
 * What the kit's specs share. Only the specs import this; it is not part of the package.
 */

import { EnvironmentProviders, Provider, Type, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnotokiUiConfig, provideAnotokiUi } from './config';

/** A zoneless app, with the kit configured when the test says how. */
export function kitProviders(config?: () => AnotokiUiConfig, ...extra: (Provider | EnvironmentProviders)[]): (Provider | EnvironmentProviders)[] {
  return [provideZonelessChangeDetection(), ...(config ? [provideAnotokiUi(config)] : []), ...extra];
}

/** Lets pending promises, timers of 0, renders and change detection run out. */
export async function settle(fixture?: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done));
    await fixture?.whenStable();
  }
}

/** Draws a component (in the document, so the focus can move), and lets it settle. */
export async function draw<T>(component: Type<T>, inputs: Record<string, unknown> = {}): Promise<ComponentFixture<T>> {
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  document.body.appendChild(fixture.nativeElement);
  await settle(fixture);
  return fixture;
}

/** An element's words, its white space folded. */
export function words(element: Element | null | undefined): string | null {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
}

/** Presses a key on an element (the event bubbles, and can be cancelled); the event, to see whether it was. */
export function press(target: Element | Document, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/**
 * A window `width` wide, as media queries see it: matchMedia answers each
 * (max-width: N px) and (min-width: N px) query, and `resize(width)` tells the
 * listeners of every query whose answer changes, as a browser does. Undone by
 * vi.unstubAllGlobals().
 */
export function windowOf(width: number): { resize(width: number): void } {
  const fits = (query: string, size: number): boolean => {
    const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(query);
    const min = /min-width:\s*(\d+(?:\.\d+)?)px/.exec(query);
    return (!max || size <= Number(max[1])) && (!min || size >= Number(min[1]));
  };
  const lists: { query: string; list: { matches: boolean }; listeners: Set<() => void> }[] = [];
  vi.stubGlobal('matchMedia', (query: string) => {
    const listeners = new Set<() => void>();
    const list = {
      matches: fits(query, width),
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    lists.push({ query, list, listeners });
    return list;
  });
  return {
    resize(next: number): void {
      width = next;
      for (const { query, list, listeners } of lists) {
        if (list.matches !== fits(query, next)) {
          list.matches = fits(query, next);
          listeners.forEach((listener) => listener());
        }
      }
    },
  };
}
