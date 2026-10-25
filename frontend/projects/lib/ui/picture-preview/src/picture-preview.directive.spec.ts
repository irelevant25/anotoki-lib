import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle } from '../../src/testing';
import { PicturePreviewDirective } from './picture-preview.directive';

@Component({
  selector: 'anotoki-test-picture-preview',
  imports: [PicturePreviewDirective],
  template: `
    <img id="slot" [src]="src()" alt="Hu Tao's icon" [anotokiPicturePreview]="src()" />
    <button type="button" id="named" [anotokiPicturePreview]="src()" anotokiPicturePreviewAlt="Hu Tao's portrait, larger" [anotokiPicturePreviewDelay]="200">Icon</button>
  `,
})
class PicturePreviewPageComponent {
  readonly src = signal<string | null>('hu-tao.png');
}

/** A box as getBoundingClientRect() answers it. */
const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

describe('[anotokiPicturePreview]: a picture larger beside an element, on hover and focus (WCAG 1.4.13)', () => {
  let host: HTMLElement;
  let page: PicturePreviewPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<PicturePreviewPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(PicturePreviewPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
    host.remove();
    document.querySelectorAll('anotoki-picture-bubble').forEach((bubble) => bubble.remove());
  });

  const slot = () => host.querySelector<HTMLElement>('#slot')!;
  const named = () => host.querySelector<HTMLElement>('#named')!;
  const bubble = () => document.querySelector<HTMLElement>('anotoki-picture-bubble');

  it('a picture is given a place in the tab order; a control keeps its own', () => {
    expect(slot().getAttribute('tabindex')).toBe('0');
    expect(named().hasAttribute('tabindex')).toBe(false);
  });

  it('on hover after the delay, on focus at once; the picture named by its alt; hoverable, it stays', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    named().dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(199);
    expect(bubble()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(bubble()?.getAttribute('role')).toBe('tooltip');
    const picture = bubble()!.querySelector('img')!;
    expect(picture.getAttribute('src')).toBe('hu-tao.png');
    expect(picture.getAttribute('alt')).toBe("Hu Tao's portrait, larger");
    // Unseen until its picture has come: an empty frame never shows.
    expect(bubble()!.classList.contains('anotoki-picture-preview--loading')).toBe(true);
    picture.dispatchEvent(new Event('load'));
    expect(bubble()!.classList.contains('anotoki-picture-preview--loading')).toBe(false);
    // Its name is not the button's own: it describes the button.
    expect(named().getAttribute('aria-describedby')).toBe(bubble()!.id);

    // The pointer moves onto the picture: it stays; off both, it goes.
    named().dispatchEvent(new MouseEvent('mouseleave'));
    bubble()!.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(500);
    expect(bubble()).not.toBeNull();
    bubble()!.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(120);
    expect(bubble()).toBeNull();
    expect(named().hasAttribute('aria-describedby')).toBe(false);

    // On focus at once; the alt the element's own: no description to repeat it.
    slot().dispatchEvent(new FocusEvent('focusin'));
    expect(bubble()?.querySelector('img')?.getAttribute('alt')).toBe("Hu Tao's icon");
    expect(slot().hasAttribute('aria-describedby')).toBe(false);
    // The pointer leaving does not take it while the focus stays.
    slot().dispatchEvent(new MouseEvent('mouseenter'));
    slot().dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(500);
    expect(bubble()).not.toBeNull();
    slot().dispatchEvent(new FocusEvent('focusout'));
    vi.advanceTimersByTime(120);
    expect(bubble()).toBeNull();
  });

  it('Escape puts it away - and only it: the Escape goes no further', () => {
    const outer = vi.fn();
    host.addEventListener('keydown', outer);
    slot().dispatchEvent(new FocusEvent('focusin'));
    expect(bubble()).not.toBeNull();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    slot().dispatchEvent(escape);
    expect(bubble()).toBeNull();
    expect(escape.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
  });

  it('beside the element, never over it: the right first, then the side with room - smaller where no side holds it', async () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);
    vi.spyOn(slot(), 'getBoundingClientRect').mockReturnValue(rect(100, 300, 80, 80));
    const size = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 300, 300));
    slot().dispatchEvent(new FocusEvent('focusin'));
    expect(bubble()?.getAttribute('data-side')).toBe('right');
    expect([bubble()!.style.left, bubble()!.style.top]).toEqual(['188px', '190px']);
    slot().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Near the window's right edge: on its left.
    vi.mocked(slot().getBoundingClientRect).mockReturnValue(rect(800, 300, 80, 80));
    slot().dispatchEvent(new FocusEvent('focusin'));
    expect(bubble()?.getAttribute('data-side')).toBe('left');
    expect(bubble()!.style.left).toBe('492px');
    slot().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // A narrow window with the element across it: below, where there is room.
    vi.mocked(slot().getBoundingClientRect).mockReturnValue(rect(10, 40, 980, 80));
    slot().dispatchEvent(new FocusEvent('focusin'));
    expect(bubble()?.getAttribute('data-side')).toBe('below');
    expect(bubble()!.style.top).toBe('128px');
    slot().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // No side holds 300 px: the side with the most room, the picture made smaller to fit it.
    vi.mocked(slot().getBoundingClientRect).mockReturnValue(rect(10, 250, 980, 300));
    size.mockReturnValue(rect(0, 0, 300, 300));
    slot().dispatchEvent(new FocusEvent('focusin'));
    const side = bubble()?.getAttribute('data-side');
    expect(side === 'above' || side === 'below').toBe(true);
    expect(bubble()!.style.getPropertyValue('--_picture-preview-height')).toBe('220px');
    await settle(fixture);
  });

  it('a picture that cannot be loaded shows nothing; no picture, no preview', async () => {
    slot().dispatchEvent(new FocusEvent('focusin'));
    bubble()!.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(bubble()).toBeNull();
    page.src.set(null);
    await settle(fixture);
    slot().dispatchEvent(new FocusEvent('focusin'));
    expect(bubble()).toBeNull();
  });
});
