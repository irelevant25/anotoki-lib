import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle } from '../../src/testing';
import { TooltipDirective } from './tooltip.directive';

@Component({
  selector: 'anotoki-test-tooltip',
  imports: [TooltipDirective],
  template: `
    <button type="button" id="copy" aria-label="Copy" anotokiTooltip="Copy">c</button>
    <button type="button" id="info" [anotokiTooltip]="text()" [anotokiTooltipDelay]="300">i</button>
  `,
})
class TooltipPageComponent {
  readonly text = signal<string | null>('Saved on this device only');
}

describe('[anotokiTooltip] (WCAG 1.4.13)', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('anotoki-tooltip-bubble').forEach((bubble) => bubble.remove());
  });

  const bubble = () => document.querySelector<HTMLElement>('anotoki-tooltip-bubble');

  it('on hover after the delay; on focus at once; it describes the element - unless it only repeats its name', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = TestBed.createComponent(TooltipPageComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const info = fixture.nativeElement.querySelector('#info') as HTMLElement;
    const copy = fixture.nativeElement.querySelector('#copy') as HTMLElement;

    info.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(299);
    expect(bubble()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(bubble()?.getAttribute('role')).toBe('tooltip');
    expect(bubble()?.textContent?.trim()).toBe('Saved on this device only');
    expect(info.getAttribute('aria-describedby')).toBe(bubble()!.id);

    // The pointer moves onto the tooltip: it stays.
    info.dispatchEvent(new MouseEvent('mouseleave'));
    bubble()!.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(500);
    expect(bubble()).not.toBeNull();
    bubble()!.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(200);
    expect(bubble()).toBeNull();
    expect(info.getAttribute('aria-describedby')).toBeNull();

    copy.dispatchEvent(new FocusEvent('focusin'));
    expect(bubble()?.textContent?.trim()).toBe('Copy');
    expect(copy.getAttribute('aria-describedby')).toBeNull();
    copy.dispatchEvent(new FocusEvent('focusout'));
    expect(bubble()).toBeNull();
    fixture.nativeElement.remove();
  });

  it('Escape puts it away - and only it: the Escape goes no further', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(TooltipPageComponent);
    const info = fixture.nativeElement.querySelector('#info') as HTMLElement;
    const outer = vi.fn();
    fixture.nativeElement.addEventListener('keydown', outer);
    info.dispatchEvent(new FocusEvent('focusin'));
    expect(bubble()).not.toBeNull();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    info.dispatchEvent(escape);
    expect(bubble()).toBeNull();
    expect(escape.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();

    // No words: no tooltip.
    fixture.componentInstance.text.set(null);
    await settle(fixture);
    info.dispatchEvent(new FocusEvent('focusin'));
    expect(bubble()).toBeNull();
    fixture.nativeElement.remove();
  });
});
