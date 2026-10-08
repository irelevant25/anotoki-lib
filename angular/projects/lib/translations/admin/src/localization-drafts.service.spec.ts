import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAnotokiTranslations } from '@anotoki/lib/translations';
import { LocalizationDrafts } from './localization-drafts.service';

const KEY = 'test-site:localization-drafts';

describe('LocalizationDrafts: what the admin pages hold until it is saved', () => {
  const person = signal<string | null>('7');

  function drafts(userKey: (() => string | null) | null = () => person()): LocalizationDrafts {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideAnotokiTranslations(() => ({ storagePrefix: 'test-site', account: userKey ? { language: () => null, userKey } : undefined }))],
    });
    return TestBed.inject(LocalizationDrafts);
  }

  const stored = () => JSON.parse(sessionStorage.getItem(KEY) ?? 'null');

  beforeEach(() => {
    sessionStorage.clear();
    person.set('7');
  });

  it('keeps them for this tab, with whose they are - and nothing at all when there are none', () => {
    const kept = drafts();
    kept.strings.set({ 'theme.label': { sk: 'Farba' } });
    kept.languages.set({ cs: { name: 'Czech', native_name: 'Čeština', sort_order: '5' } });
    TestBed.tick();
    expect(stored()).toEqual({ owner: '7', strings: { 'theme.label': { sk: 'Farba' } }, languages: { cs: { name: 'Czech', native_name: 'Čeština', sort_order: '5' } } });
    expect(kept.count()).toBe(2);

    kept.clear();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('gives them back to the same person after a reload, and through signing out and in again', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ owner: '7', strings: { 'theme.label': { sk: 'Farba' } }, languages: {} }));
    const kept = drafts();
    expect(kept.strings()).toEqual({ 'theme.label': { sk: 'Farba' } });

    person.set(null);
    TestBed.tick();
    expect(kept.strings()).toEqual({ 'theme.label': { sk: 'Farba' } });
    person.set('7');
    TestBed.tick();
    expect(kept.strings()).toEqual({ 'theme.label': { sk: 'Farba' } });
    expect(stored()?.owner).toBe('7');
  });

  it('lets go of them when somebody else signs in - also when nobody was signed in as the page loaded', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ owner: '7', strings: { 'theme.label': { sk: 'Farba' } }, languages: {} }));
    person.set(null);
    const kept = drafts();
    expect(kept.strings()).toEqual({ 'theme.label': { sk: 'Farba' } });
    person.set('8');
    TestBed.tick();
    expect(kept.strings()).toEqual({});
    expect(sessionStorage.getItem(KEY)).toBeNull();

    sessionStorage.setItem(KEY, JSON.stringify({ owner: '7', strings: { a: { sk: 'b' } }, languages: {} }));
    person.set('9');
    expect(drafts().strings()).toEqual({});
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('reads nothing that is not exactly its own shape - a site’s drafts from before, with other field names, are none', () => {
    for (const broken of [
      '{',
      '[]',
      JSON.stringify({ owner: '', strings: {}, languages: {} }),
      JSON.stringify({ owner: '7', strings: { a: { sk: 1 } }, languages: {} }),
      JSON.stringify({ owner: '7', strings: {}, languages: { cs: { name: 'Czech', nativeName: 'Čeština', sortOrder: '5' } } }),
    ]) {
      sessionStorage.setItem(KEY, broken);
      expect(drafts().count(), broken).toBe(0);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    }
  });

  it('keeps them for the tab where the site cannot say who is signed in', () => {
    const kept = drafts(null);
    kept.strings.set({ 'theme.label': { sk: 'Farba' } });
    TestBed.tick();
    expect(stored()?.owner).toBe('*');
    expect(drafts(null).strings()).toEqual({ 'theme.label': { sk: 'Farba' } });
  });

  it('asks the browser once before the tab closes while some are not saved - and not when there are none', () => {
    const kept = drafts();
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);

    kept.strings.set({ 'theme.label': { sk: 'Farba' } });
    const asking = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(asking);
    expect(asking.defaultPrevented).toBe(true);
    // Mirrored as the page goes, before it draws again.
    expect(stored()?.strings).toEqual({ 'theme.label': { sk: 'Farba' } });
  });
});
