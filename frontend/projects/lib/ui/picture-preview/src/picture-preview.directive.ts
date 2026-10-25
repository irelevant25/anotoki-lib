import { ApplicationRef, ComponentRef, DOCUMENT, DestroyRef, Directive, ElementRef, EnvironmentInjector, createComponent, effect, inject, input } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui/dom';
import { PictureBubbleComponent } from './picture-bubble/picture-bubble.component';

/** How far from the element, and from the window's edges, in px. */
const GAP = 8;
const EDGE = 8;
/** What the picture's frame takes round it: its padding and its edge, both sides. */
const FRAME = 14;

type Side = 'right' | 'left' | 'below' | 'above';

/** The sides a preview is tried on, in order: beside the element first, as a slot of a form has room there. */
const SIDES: readonly Side[] = ['right', 'left', 'below', 'above'];

/** Elements that take the focus by themselves. */
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

/**
 * A picture shown larger beside an element, on hover and on focus - a picture slot of an admin form, a thumbnail:
 * `<img [src]="icon" alt="Hu Tao's icon" [anotokiPicturePreview]="icon" />`.
 *
 * WCAG 1.4.13, as the kit's tooltip: shown after the pointer rests on the element for `delay` ms, and at once when it
 * takes the keyboard's focus (an element that takes none by itself - a picture - is given a place in the tab order);
 * it stays while the pointer is over the element or the picture itself, and while the focus is there; Escape puts it
 * away, and goes no further. The picture is 18rem wide and as tall as its shape makes it (18rem at most), whatever size
 * it has of its own. It is placed beside the element - right, left, below or above, the first side it fits on, else the
 * side with the most room, the picture made smaller to fit there - so it never covers the element. Its picture
 * is named by `alt` (`anotokiPicturePreviewAlt`), else the element's own alt or aria-label; it describes the element
 * (aria-describedby) unless that is the element's own name already. A picture that cannot be loaded shows nothing.
 */
@Directive({
  selector: '[anotokiPicturePreview]',
  host: {
    '(mouseenter)': 'hoverStart()',
    '(mouseleave)': 'hoverEnd()',
    '(focusin)': 'focusStart()',
    '(focusout)': 'focusEnd()',
  },
})
export class PicturePreviewDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly appRef = inject(ApplicationRef);
  private readonly environment = inject(EnvironmentInjector);

  /** The picture's address: shown larger; nothing, no preview. */
  readonly src = input<string | null | undefined>(null, { alias: 'anotokiPicturePreview' });
  /** The picture's name; the element's own alt or aria-label without it. */
  readonly alt = input<string | null>(null, { alias: 'anotokiPicturePreviewAlt' });
  /** How long the pointer rests before it shows, in ms. */
  readonly delay = input(400, { alias: 'anotokiPicturePreviewDelay' });

  private bubble: ComponentRef<PictureBubbleComponent> | null = null;
  private readonly id = uniqueId('anotoki-picture-preview');
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** What keeps it: the pointer over the element, or over the picture; the focus on the element. */
  private overElement = false;
  private overPicture = false;
  private focused = false;
  /** Escape puts the preview away - and only that: a dialog around it stays (a second Escape is its). */
  private readonly onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.bubble) {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
    }
  };

  constructor() {
    // A picture is no stop of the keyboard's by itself: on focus too, as on hover.
    if (!this.element.matches(FOCUSABLE)) {
      this.element.setAttribute('tabindex', '0');
    }
    // A new picture while it shows: the preview shows it; none: it goes.
    effect(() => {
      const src = this.src();
      const alt = this.name();
      if (!this.bubble) {
        return;
      }
      if (src) {
        this.bubble.instance.src.set(src);
        this.bubble.instance.alt.set(alt);
      } else {
        this.hide();
      }
    });
    inject(DestroyRef).onDestroy(() => this.hide());
  }

  protected hoverStart(): void {
    this.overElement = true;
    this.clearTimers();
    if (this.bubble) {
      return;
    }
    this.showTimer = setTimeout(() => this.show(), this.delay());
  }

  protected hoverEnd(): void {
    this.overElement = false;
    this.leaveSoon();
  }

  protected focusStart(): void {
    this.focused = true;
    this.show();
  }

  protected focusEnd(): void {
    this.focused = false;
    this.leaveSoon();
  }

  /** A moment to move onto the picture itself, which keeps it; then it goes, unless the pointer or the focus stays. */
  private leaveSoon(): void {
    this.clearTimers();
    this.hideTimer = setTimeout(() => {
      if (!this.overElement && !this.overPicture && !this.focused) {
        this.hide();
      }
    }, 120);
  }

  /** Shows it now. */
  show(): void {
    this.clearTimers();
    const src = this.src();
    if (!src || this.bubble) {
      return;
    }
    const bubble = createComponent(PictureBubbleComponent, { environmentInjector: this.environment });
    bubble.instance.id.set(this.id);
    bubble.instance.src.set(src);
    bubble.instance.alt.set(this.name());
    bubble.instance.loaded.subscribe(() => this.place());
    bubble.instance.failed.subscribe(() => this.hide());
    this.appRef.attachView(bubble.hostView);
    const box = bubble.location.nativeElement as HTMLElement;
    box.addEventListener('mouseenter', () => {
      this.overPicture = true;
      this.clearTimers();
    });
    box.addEventListener('mouseleave', () => {
      this.overPicture = false;
      this.leaveSoon();
    });
    this.document.body.appendChild(box);
    bubble.changeDetectorRef.detectChanges();
    if (typeof box.showPopover === 'function') {
      try {
        box.showPopover();
      } catch {
        // Drawn in place all the same.
      }
    }
    this.bubble = bubble;
    this.place();
    this.describe(true);
    this.document.addEventListener('keydown', this.onEscape, true);
  }

  /** Takes it away (Escape, a picture that cannot be loaded, or neither the pointer nor the focus left to keep it). */
  hide(): void {
    this.clearTimers();
    this.overPicture = false;
    if (!this.bubble) {
      return;
    }
    this.describe(false);
    this.document.removeEventListener('keydown', this.onEscape, true);
    this.appRef.detachView(this.bubble.hostView);
    this.bubble.destroy();
    this.bubble.location.nativeElement.remove();
    this.bubble = null;
  }

  /** The picture's name: the page's, else the element's own alt or aria-label. */
  private name(): string {
    return (this.alt() ?? this.element.getAttribute('alt') ?? this.element.getAttribute('aria-label') ?? '').trim();
  }

  /**
   * Beside the element, on the first side the picture fits on whole - else on the side with the most room, the picture
   * made smaller to fit there - and along that side as near the element's middle as the window lets it be.
   */
  private place(): void {
    const bubble = this.bubble;
    const view = this.document.defaultView;
    if (!bubble || !view) {
      return;
    }
    const box = bubble.location.nativeElement as HTMLElement;
    const anchor = this.element.getBoundingClientRect();
    const width = this.document.documentElement.clientWidth || view.innerWidth;
    const height = this.document.documentElement.clientHeight || view.innerHeight;
    const room: Record<Side, number> = {
      right: width - anchor.right - GAP - EDGE,
      left: anchor.left - GAP - EDGE,
      below: height - anchor.bottom - GAP - EDGE,
      above: anchor.top - GAP - EDGE,
    };
    // Its own size first, as large as it is drawn at most.
    bubble.instance.maxWidth.set('18rem');
    bubble.instance.maxHeight.set('18rem');
    bubble.changeDetectorRef.detectChanges();
    let size = box.getBoundingClientRect();
    const fits = (side: Side): boolean =>
      side === 'right' || side === 'left' ? room[side] >= size.width && height - 2 * EDGE >= size.height : room[side] >= size.height && width - 2 * EDGE >= size.width;
    const side = SIDES.find(fits) ?? SIDES.reduce((best, each) => (room[each] > room[best] ? each : best));
    if (!fits(side)) {
      // No side holds it whole: smaller, within its side's room, so that it never covers the element.
      const across = side === 'right' || side === 'left';
      bubble.instance.maxWidth.set(`${Math.max(0, (across ? room[side] : width - 2 * EDGE) - FRAME)}px`);
      bubble.instance.maxHeight.set(`${Math.max(0, (across ? height - 2 * EDGE : room[side]) - FRAME)}px`);
      bubble.changeDetectorRef.detectChanges();
      size = box.getBoundingClientRect();
    }
    const middle = (from: number, length: number, own: number, limit: number): number => Math.max(EDGE, Math.min(from + length / 2 - own / 2, limit - EDGE - own));
    const top = side === 'below' ? anchor.bottom + GAP : side === 'above' ? anchor.top - GAP - size.height : middle(anchor.top, anchor.height, size.height, height);
    const left = side === 'right' ? anchor.right + GAP : side === 'left' ? anchor.left - GAP - size.width : middle(anchor.left, anchor.width, size.width, width);
    box.style.top = `${Math.round(top)}px`;
    box.style.left = `${Math.round(left)}px`;
    bubble.instance.side.set(side);
    bubble.changeDetectorRef.detectChanges();
  }

  /** Ties the preview to the element as its description - not when its name is the element's own name already. */
  private describe(on: boolean): void {
    const ids = (this.element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== this.id);
    const own = (this.element.getAttribute('aria-label') ?? this.element.getAttribute('alt') ?? '').trim();
    if (on && this.name() !== '' && this.name() !== own) {
      ids.push(this.id);
    }
    if (ids.length) {
      this.element.setAttribute('aria-describedby', ids.join(' '));
    } else {
      this.element.removeAttribute('aria-describedby');
    }
  }

  private clearTimers(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
