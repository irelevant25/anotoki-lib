import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle } from '../../../src/testing';
import { ButtonComponent } from './button.component';

@Component({
  selector: 'anotoki-test-buttons',
  imports: [ButtonComponent],
  template: `
    <button anotokiButton id="plain">Save</button>
    <button anotokiButton id="primary" variant="primary" size="lg" [loading]="loading()" [disabled]="disabled()">Save</button>
    <a anotokiButton id="link" href="/somewhere" variant="link" size="sm" [disabled]="disabled()">Somewhere</a>
    <button anotokiButton id="submit" type="submit" block>Send</button>
    <button anotokiButton id="icon" iconOnly aria-label="Close">x</button>
    <button anotokiButton id="delete" variant="danger-ghost" size="sm" iconOnly aria-label="Delete">x</button>
  `,
})
class ButtonsComponent {
  readonly loading = signal(false);
  readonly disabled = signal(false);
}

describe('[anotokiButton]: the look of a button on a real <button> or <a>', () => {
  let host: HTMLElement;
  let page: ButtonsComponent;
  let fixture: Awaited<ReturnType<typeof draw<ButtonsComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(ButtonsComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const button = (id: string) => host.querySelector<HTMLElement>('#' + id)!;

  it('is a button that never submits by accident: type="button" unless it says otherwise', () => {
    expect(button('plain').getAttribute('type')).toBe('button');
    expect(button('submit').getAttribute('type')).toBe('submit');
    expect(button('link').getAttribute('type')).toBeNull();
  });

  it('takes its look from classes of its own, not from a site’s', () => {
    expect([...button('plain').classList]).toEqual(['anotoki-button', 'anotoki-button--secondary']);
    expect(button('primary').classList).toContain('anotoki-button--primary');
    expect(button('primary').classList).toContain('anotoki-button--lg');
    expect(button('link').classList).toContain('anotoki-button--link');
    expect(button('link').classList).toContain('anotoki-button--sm');
    expect(button('submit').classList).toContain('anotoki-button--block');
    expect(button('icon').classList).toContain('anotoki-button--icon');
    // The quiet red (0.6.0): its own class, and none of the loud red's.
    expect([...button('delete').classList]).toEqual(['anotoki-button', 'anotoki-button--danger-ghost', 'anotoki-button--sm', 'anotoki-button--icon']);
  });

  it('loading: a spinner beside the words, aria-busy, and it cannot be pressed meanwhile', async () => {
    page.loading.set(true);
    await settle(fixture);
    const primary = button('primary') as HTMLButtonElement;
    expect(primary.querySelector('anotoki-spinner')).not.toBeNull();
    expect(primary.getAttribute('aria-busy')).toBe('true');
    expect(primary.disabled).toBe(true);
    expect(primary.textContent?.trim()).toBe('Save');

    page.loading.set(false);
    await settle(fixture);
    expect(primary.querySelector('anotoki-spinner')).toBeNull();
    expect(primary.getAttribute('aria-busy')).toBeNull();
    expect(primary.disabled).toBe(false);
  });

  it('disabled: the attribute on a button; on a link aria-disabled, and out of the tab order', async () => {
    page.disabled.set(true);
    await settle(fixture);
    expect((button('primary') as HTMLButtonElement).disabled).toBe(true);
    const link = button('link');
    expect(link.hasAttribute('disabled')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('tabindex')).toBe('-1');
    expect(link.classList).toContain('anotoki-button--disabled');

    page.disabled.set(false);
    await settle(fixture);
    expect(link.getAttribute('aria-disabled')).toBeNull();
    expect(link.getAttribute('tabindex')).toBeNull();
  });

  it('warns in development about an icon-only button with no name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    @Component({ selector: 'anotoki-test-nameless', imports: [ButtonComponent], template: '<button anotokiButton iconOnly>x</button>' })
    class NamelessComponent {}
    const nameless = await draw(NamelessComponent);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('aria-label');
    nameless.nativeElement.remove();
    warn.mockRestore();
  });
});
