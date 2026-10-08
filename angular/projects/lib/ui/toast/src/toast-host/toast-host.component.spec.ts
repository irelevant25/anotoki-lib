import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { ToastService } from '../toast.service';
import { ToastHostComponent } from './toast-host.component';

describe('ToastService and <anotoki-toast-host>', () => {
  afterEach(() => vi.useRealTimers());

  it('the region is always there, polite, and named in the page language - English with no words, never a key', async () => {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => 'de' })) });
    const fixture = await draw(ToastHostComponent);
    const region = fixture.nativeElement.querySelector('section');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-label')).toBe('Notifications');
    expect(region.children.length).toBe(0);
    fixture.nativeElement.remove();
  });

  it('shows a message with its tone and a named dismiss button; at most four', async () => {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => 'sk' })) });
    const toasts = TestBed.inject(ToastService);
    const fixture = await draw(ToastHostComponent);
    const host: HTMLElement = fixture.nativeElement;
    toasts.success('Uložené.');
    await settle(fixture);
    expect(host.querySelector('section')?.getAttribute('aria-label')).toBe('Oznámenia');
    const toast = host.querySelector('.toast')!;
    expect(toast.getAttribute('data-tone')).toBe('success');
    expect(words(toast.querySelector('.message'))).toBe('Uložené.');
    expect(toast.querySelector('button')?.getAttribute('aria-label')).toBe('Zavrieť');

    for (const n of [2, 3, 4, 5]) {
      toasts.info(`Message ${n}`);
    }
    await settle(fixture);
    expect(Array.from(host.querySelectorAll('.message')).map(words)).toEqual(['Message 2', 'Message 3', 'Message 4', 'Message 5']);

    host.querySelector<HTMLButtonElement>('.toast button')!.click();
    await settle(fixture);
    expect(host.querySelectorAll('.toast').length).toBe(3);
    host.remove();
  });

  it('goes by itself: 5 seconds, a warning 8, an error 9; 0 keeps it', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: kitProviders() });
    const toasts = TestBed.inject(ToastService);
    toasts.info('info');
    toasts.warning('warning');
    toasts.error('error');
    toasts.show('kept', 'info', 0);
    vi.advanceTimersByTime(5000);
    expect(toasts.toasts().map((toast) => toast.message)).toEqual(['warning', 'error', 'kept']);
    vi.advanceTimersByTime(3000);
    expect(toasts.toasts().map((toast) => toast.message)).toEqual(['error', 'kept']);
    vi.advanceTimersByTime(1000);
    expect(toasts.toasts().map((toast) => toast.tone)).toEqual(['info']);
    vi.advanceTimersByTime(60_000);
    expect(toasts.toasts().length).toBe(1);
  });
});
