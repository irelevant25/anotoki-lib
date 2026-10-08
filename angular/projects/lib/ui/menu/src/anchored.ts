import { DOCUMENT, DestroyRef, Directive, ElementRef, Injector, Signal, afterNextRender, inject, input, output, signal } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui';

/** Where a box drawn under its trigger lines up with it. */
export type PanelAlign = 'start' | 'end' | 'center';

/** How far from the trigger, and from the window's edges, in px. */
const GAP = 8;
const EDGE = 8;

/**
 * A box that opens under the element that opened it (a menu, a popover):
 * drawn only while open, in the top layer where the browser has one (the
 * popover API) - above a sticky bar, a dialog and any `overflow: hidden`, and
 * never inside a containing block a `backdrop-filter` makes - placed under
 * its trigger (above it when there is more room there), kept on the screen,
 * and placed again as the page scrolls or the window changes size.
 *
 * A click outside the box and its trigger closes it, the focus left where it
 * is; closing it any other way gives the focus back to the trigger.
 */
@Directive()
export abstract class AnchoredPanel {
  protected readonly document = inject(DOCUMENT);
  protected readonly injector = inject(Injector);

  /** How the box lines up with its trigger: their starts, their ends, or centred under it. */
  readonly align = input<PanelAlign>('start');
  readonly opened = output<void>();
  readonly closed = output<void>();

  /** The box's id, while it is open: the trigger's aria-controls. */
  readonly panelId = uniqueId('anotoki-panel');
  private readonly _open = signal(false);
  readonly isOpen = this._open.asReadonly();

  /** The element that opens it (set by its trigger directive). */
  protected trigger: HTMLElement | null = null;
  protected abstract readonly panel: Signal<ElementRef<HTMLElement> | undefined>;

  private unlisten: (() => void) | null = null;
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopListening());
  }

  /** Called by the trigger directive: the element the box hangs from and gives the focus back to. */
  attach(trigger: HTMLElement): void {
    this.trigger = trigger;
  }

  /** The trigger, for a component that needs it (its id names the box). */
  get triggerElement(): HTMLElement | null {
    return this.trigger;
  }

  toggle(): void {
    if (this._open()) {
      this.close(true);
    } else {
      this.open();
    }
  }

  open(): void {
    if (this._open()) {
      return;
    }
    this._open.set(true);
    // Placed and given the focus once it is drawn: with no zone, a microtask
    // runs before that, so afterNextRender and not a promise.
    afterNextRender(
      () => {
        const panel = this.panel()?.nativeElement;
        if (!panel || !this._open()) {
          return;
        }
        if (typeof panel.showPopover === 'function' && panel.hasAttribute('popover')) {
          try {
            panel.showPopover();
          } catch {
            // Already shown, or not connected: drawn in place all the same.
          }
        }
        this.place();
        this.startListening();
        this.afterOpen(panel);
      },
      { injector: this.injector },
    );
    this.opened.emit();
  }

  /** Closes it; `returnFocus`: back to the trigger (Escape, Tab, a choice made) - not after a click elsewhere, which put the focus where it wanted. */
  close(returnFocus = true): void {
    if (!this._open()) {
      return;
    }
    this._open.set(false);
    this.stopListening();
    if (returnFocus) {
      this.trigger?.focus();
    }
    this.closed.emit();
  }

  /** What the box does once it is open and placed (a menu focuses an item). */
  protected afterOpen(_panel: HTMLElement): void {}

  /** Under the trigger - or above it when there is more room there - lined up as `align` says, and wholly on the screen. */
  protected place(): void {
    const panel = this.panel()?.nativeElement;
    const trigger = this.trigger;
    const view = this.document.defaultView;
    if (!panel || !trigger || !view) {
      return;
    }
    const anchor = trigger.getBoundingClientRect();
    const width = this.document.documentElement.clientWidth || view.innerWidth;
    const height = view.innerHeight;
    panel.style.maxHeight = '';
    const box = panel.getBoundingClientRect();

    const align = this.align();
    let left = align === 'end' ? anchor.right - box.width : align === 'center' ? anchor.left + anchor.width / 2 - box.width / 2 : anchor.left;
    left = Math.max(EDGE, Math.min(left, width - EDGE - box.width));

    const below = height - anchor.bottom - GAP - EDGE;
    const above = anchor.top - GAP - EDGE;
    let top: number;
    let room: number;
    if (box.height <= below || below >= above) {
      top = anchor.bottom + GAP;
      room = below;
    } else {
      room = above;
      top = anchor.top - GAP - Math.min(box.height, above);
    }
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.maxHeight = `${Math.max(120, Math.floor(room))}px`;
  }

  /** The focus left the box (a popover closes then; a menu keeps it inside itself). */
  protected onOutsideClick(): void {
    this.close(false);
  }

  private startListening(): void {
    this.stopListening();
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    const replace = (): void => {
      if (typeof view.requestAnimationFrame !== 'function') {
        this.place();
      } else if (!this.frame) {
        this.frame = view.requestAnimationFrame(() => {
          this.frame = 0;
          this.place();
        });
      }
    };
    const click = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      const panel = this.panel()?.nativeElement;
      if (target && (panel?.contains(target) || this.trigger?.contains(target))) {
        return;
      }
      this.onOutsideClick();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        this.close(true);
      }
    };
    view.addEventListener('resize', replace, { passive: true });
    view.addEventListener('scroll', replace, { passive: true, capture: true });
    this.document.addEventListener('click', click);
    this.document.addEventListener('keydown', escape);
    this.unlisten = () => {
      view.removeEventListener('resize', replace);
      view.removeEventListener('scroll', replace, { capture: true });
      this.document.removeEventListener('click', click);
      this.document.removeEventListener('keydown', escape);
      if (this.frame) {
        view.cancelAnimationFrame(this.frame);
        this.frame = 0;
      }
    };
  }

  private stopListening(): void {
    this.unlisten?.();
    this.unlisten = null;
  }
}
