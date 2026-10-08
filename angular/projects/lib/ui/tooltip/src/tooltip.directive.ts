import { ApplicationRef, ComponentRef, DOCUMENT, DestroyRef, Directive, ElementRef, EnvironmentInjector, createComponent, effect, inject, input } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui';
import { TooltipBubbleComponent } from './tooltip-bubble/tooltip-bubble.component';

/** How far from the element, and from the window's edges, in px. */
const GAP = 6;
const EDGE = 8;

/**
 * A few words about an element, shown above it (below where there is no room):
 * `<button anotokiButton iconOnly aria-label="Copy" anotokiTooltip="Copy">`.
 *
 * WCAG 1.4.13: shown after the pointer rests on the element for `delay` ms,
 * and at once when it takes the keyboard's focus; it stays while the pointer
 * is over the element or the tooltip itself, and while the focus is there;
 * Escape puts it away. It describes the element (aria-describedby) - unless
 * its words are the element's own name already. Never the only name of an
 * icon-only button: that keeps its aria-label.
 */
@Directive({
  selector: '[anotokiTooltip]',
  host: {
    '(mouseenter)': 'hoverStart()',
    '(mouseleave)': 'hoverEnd()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
  },
})
export class TooltipDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly appRef = inject(ApplicationRef);
  private readonly environment = inject(EnvironmentInjector);

  readonly text = input<string | null>(null, { alias: 'anotokiTooltip' });
  /** How long the pointer rests before it shows, in ms. */
  readonly delay = input(500, { alias: 'anotokiTooltipDelay' });

  private bubble: ComponentRef<TooltipBubbleComponent> | null = null;
  private readonly id = uniqueId('anotoki-tooltip');
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** Escape puts the tooltip away - and only that: a dialog or menu around it stays (a second Escape is theirs). */
  private readonly onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.bubble) {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
    }
  };

  constructor() {
    // New words while it shows: the tooltip says them; none: it goes.
    effect(() => {
      const text = this.text();
      if (!this.bubble) {
        return;
      }
      if (text) {
        this.bubble.instance.text.set(text);
      } else {
        this.hide();
      }
    });
    inject(DestroyRef).onDestroy(() => this.hide());
  }

  protected hoverStart(): void {
    this.clearTimers();
    if (this.bubble) {
      return;
    }
    this.showTimer = setTimeout(() => this.show(), this.delay());
  }

  protected hoverEnd(): void {
    this.clearTimers();
    // A moment to move onto the tooltip itself, which keeps it.
    this.hideTimer = setTimeout(() => this.hide(), 120);
  }

  /** Shows it now. */
  show(): void {
    this.clearTimers();
    const text = this.text();
    if (!text || this.bubble) {
      return;
    }
    const bubble = createComponent(TooltipBubbleComponent, { environmentInjector: this.environment });
    bubble.instance.id.set(this.id);
    bubble.instance.text.set(text);
    this.appRef.attachView(bubble.hostView);
    const box = bubble.location.nativeElement as HTMLElement;
    box.addEventListener('mouseenter', () => this.clearTimers());
    box.addEventListener('mouseleave', () => this.hoverEnd());
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

  /** Takes it away. */
  hide(): void {
    this.clearTimers();
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

  /** Above the element, centred - below when there is no room above - and wholly on the screen. */
  private place(): void {
    const box = this.bubble?.location.nativeElement as HTMLElement | undefined;
    const view = this.document.defaultView;
    if (!box || !view) {
      return;
    }
    const anchor = this.element.getBoundingClientRect();
    const size = box.getBoundingClientRect();
    const width = this.document.documentElement.clientWidth || view.innerWidth;
    const above = anchor.top - GAP - size.height >= EDGE;
    const top = above ? anchor.top - GAP - size.height : anchor.bottom + GAP;
    const left = Math.max(EDGE, Math.min(anchor.left + anchor.width / 2 - size.width / 2, width - EDGE - size.width));
    box.style.top = `${Math.round(top)}px`;
    box.style.left = `${Math.round(left)}px`;
    this.bubble?.instance.side.set(above ? 'above' : 'below');
  }

  /** Ties the tooltip to the element as its description - not when it only repeats the element's name. */
  private describe(on: boolean): void {
    const ids = (this.element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== this.id);
    const repeatsName = (this.element.getAttribute('aria-label') ?? '').trim() === (this.text() ?? '').trim();
    if (on && !repeatsName) {
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
