import { TestBed } from '@angular/core/testing';
import { ToastService } from '../../../toast/src/toast.service';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { CopyButtonComponent } from './copy-button.component';

describe('<anotoki-copy-button>', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
    vi.useRealTimers();
  });

  it('copies, then says so for two seconds - on the button and to a screen reader', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => 'sk' })) });
    const fixture = await draw(CopyButtonComponent, { text: 'ABCD-1234' });
    const host: HTMLElement = fixture.nativeElement;
    const button = host.querySelector<HTMLButtonElement>('button')!;
    expect(words(button)).toBe('Kopírovať');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith('ABCD-1234');
    expect(words(button)).toBe('Skopírované');
    expect(words(host.querySelector('[aria-live=polite]'))).toBe('Skopírované do schránky.');
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(words(button)).toBe('Kopírovať');
    host.remove();
  });

  it('icon-only: named "Copy to clipboard" (and its tooltip); a label of its own instead', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(CopyButtonComponent, { text: 'x', iconOnly: true });
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Copy to clipboard');
    expect(button.getAttribute('title')).toBe('Copy to clipboard');
    fixture.componentRef.setInput('label', 'Copy the secret');
    await settle(fixture);
    expect(button.getAttribute('aria-label')).toBe('Copy the secret');
    fixture.nativeElement.remove();
  });

  it('when copying does not work, a toast says to copy by hand - never a false "Copied"', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    TestBed.configureTestingModule({ providers: kitProviders() });
    const toasts = TestBed.inject(ToastService);
    const fixture = await draw(CopyButtonComponent, { text: 'x' });
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    await settle(fixture);
    expect(toasts.toasts().map((toast) => [toast.tone, toast.message])).toEqual([['danger', 'Copying did not work. Select the text and copy it yourself.']]);
    expect(words(button)).toBe('Copy');
    fixture.nativeElement.remove();
  });
});
