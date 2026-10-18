import { InjectionToken, Provider } from '@angular/core';

/** A module's library words: per language (`en`, `sk`), by library key (`anotoki.<namespace>.<word>`). */
export type ModuleLibraryWords = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * The library's words of every module a site uses, beside the kit's, for the
 * translations module: each module that says words of its own registers them
 * from its provide*() function (provideAnotokiMigrations: the status page's;
 * provideAnotokiAuth: the sign-in page's; every later module its own). So a
 * module's words reach a site only where the module is used, and the
 * translations module holds the kit's alone - yet a key of a module in use is
 * never shown as a key while the database has no string for it.
 */
export const ANOTOKI_LIBRARY_WORDS = new InjectionToken<readonly ModuleLibraryWords[]>('ANOTOKI_LIBRARY_WORDS');

/** A module's registration of its words: one of the providers its provide*() function gives. */
export function provideLibraryWords(words: ModuleLibraryWords): Provider {
  return { provide: ANOTOKI_LIBRARY_WORDS, useValue: words, multi: true };
}
