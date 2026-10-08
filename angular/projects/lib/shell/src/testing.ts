/*
 * What the shell's specs share: a site as they imagine it - its account's theme,
 * its languages - wired into the shell. Only the specs import this.
 */

import { EnvironmentProviders, Provider, WritableSignal, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { type Mock } from 'vitest';
import { AnotokiUiConfig } from '../../ui/src/config';
import { kitProviders } from '../../ui/src/testing';
import { AnotokiLanguage, AnotokiShellConfig, AnotokiThemeMode, provideAnotokiShell } from './config';

export const LANGUAGES: AnotokiLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'sk', name: 'Slovenčina' },
];

/** The site around the shell, each part a signal or a mock the test drives. */
export interface ShellSite {
  /** The account's theme; null: nobody signed in (or an IAM before the preferences). */
  account: WritableSignal<AnotokiThemeMode | null>;
  save: Mock<(mode: AnotokiThemeMode) => Promise<unknown>>;
  language: WritableSignal<string>;
  offered: WritableSignal<readonly AnotokiLanguage[]>;
  /** Switches the page; true when it reads in the language. */
  choose: Mock<(code: string) => Promise<boolean>>;
  notSaved: WritableSignal<boolean>;
}

export function shellSite(): ShellSite {
  const language = signal('en');
  return {
    account: signal<AnotokiThemeMode | null>(null),
    save: vi.fn<(mode: AnotokiThemeMode) => Promise<unknown>>().mockResolvedValue(undefined),
    language,
    offered: signal<readonly AnotokiLanguage[]>(LANGUAGES),
    choose: vi.fn<(code: string) => Promise<boolean>>(async (code: string) => {
      language.set(code);
      return true;
    }),
    notSaved: signal(false),
  };
}

/** A zoneless app with the kit and the shell configured for `site`. */
export function shellProviders(site: ShellSite, config: Partial<AnotokiShellConfig> = {}, ui?: () => AnotokiUiConfig): (Provider | EnvironmentProviders)[] {
  return [
    ...kitProviders(ui ?? (() => ({ language: site.language }))),
    provideRouter([]),
    provideAnotokiShell(() => ({
      theme: { storageKey: 'test:theme', account: site.account, save: site.save },
      languages: {
        current: site.language,
        offered: site.offered,
        choose: site.choose,
        notSaved: site.notSaved,
        clearNotSaved: () => site.notSaved.set(false),
      },
      ...config,
    })),
  ];
}

/**
 * The system's colour scheme, as matchMedia answers it: `dark(true)` turns the
 * device dark and tells the listeners. Every other query matches nothing.
 */
export function deviceScheme(dark: boolean): { dark(value: boolean): void } {
  const listeners = new Set<() => void>();
  const lists: { matches: boolean; media: string }[] = [];
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = {
      matches: query.includes('prefers-color-scheme: dark') ? dark : false,
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    lists.push(list);
    return list;
  });
  return {
    dark(value: boolean): void {
      dark = value;
      for (const list of lists) {
        if (list.media.includes('prefers-color-scheme: dark')) {
          list.matches = value;
        }
      }
      listeners.forEach((listener) => listener());
    },
  };
}
