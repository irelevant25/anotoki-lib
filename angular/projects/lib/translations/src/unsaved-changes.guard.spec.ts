import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { provideAnotokiTranslations } from './config';
import { HoldsUnsavedChanges, anotokiUnsavedChangesGuard } from './unsaved-changes.guard';

describe('anotokiUnsavedChangesGuard: leaving a page with changes not saved', () => {
  const who = signal<string | null>('7');

  function guard(page: HoldsUnsavedChanges | null): ReturnType<typeof anotokiUnsavedChangesGuard> {
    return TestBed.runInInjectionContext(() => anotokiUnsavedChangesGuard(page, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot));
  }

  beforeEach(() => {
    who.set('7');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAnotokiTranslations(() => ({ account: { language: () => null, userKey: () => who() } }))] });
  });

  it('asks the page, and does what it answers', async () => {
    expect(guard({ canLeave: () => true })).toBe(true);
    expect(guard({ canLeave: () => false })).toBe(false);
    await expect(guard({ canLeave: () => Promise.resolve(false) })).resolves.toBe(false);
  });

  it('asks nothing once nobody is signed in - the drafts keep what was typed for whoever signs in again', () => {
    who.set(null);
    const page = { canLeave: vi.fn(() => false) };
    expect(guard(page)).toBe(true);
    expect(page.canLeave).not.toHaveBeenCalled();
  });

  it('lets go of a page that is gone, or one that holds nothing', () => {
    expect(guard(null)).toBe(true);
    expect(guard({} as HoldsUnsavedChanges)).toBe(true);
  });

  it('asks the page whoever is signed in, where the site says nothing of who that is', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    expect(guard({ canLeave: () => false })).toBe(false);
  });
});
