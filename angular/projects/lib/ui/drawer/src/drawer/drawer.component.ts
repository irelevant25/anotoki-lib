import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, viewChild } from '@angular/core';
import { AnotokiWords, IconComponent, tabbable, uniqueId } from '@anotoki/lib/ui';

/**
 * A panel that slides in from the right, over the page: for looking closer at
 * one thing - the people behind a number, one person's answers - without
 * leaving the page it was opened from. The whole screen on a phone.
 *
 * Like the dialog, a native `<dialog>` opened with showModal() as it appears:
 * the page behind is inert, Tab cycles inside, Escape and the backdrop ask to
 * close it (`dismiss`), and the focus goes back where it was. Its content can
 * change while it is open - a list, then one of its entries, with `back`
 * between them - and each change starts the reader at the top again, the
 * heading in focus.
 */
@Component({
  selector: 'anotoki-drawer',
  imports: [IconComponent],
  templateUrl: './drawer.component.html',
  styleUrl: './drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-drawer' },
})
export class DrawerComponent {
  private readonly document = inject(DOCUMENT);
  protected readonly words = inject(AnotokiWords);

  readonly heading = input.required<string>();
  readonly subheading = input<string | null>(null);
  /** A back button with these words ("All 12 people"); null for none. */
  readonly backLabel = input<string | null>(null);

  readonly dismiss = output<void>();
  readonly back = output<void>();

  protected readonly headingId = uniqueId('anotoki-drawer-title');
  protected pointerDownTarget: EventTarget | null = null;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly returnFocus = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
  private shown = false;

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (!dialog.open) {
        dialog.showModal();
      }
      this.shown = true;
      this.title().nativeElement.focus();
    });

    // New content, new reading: back to its top, with the heading in focus.
    effect(() => {
      this.heading();
      this.subheading();
      if (this.shown) {
        this.body().nativeElement.scrollTop = 0;
        queueMicrotask(() => this.title().nativeElement.focus({ preventScroll: true }));
      }
    });

    inject(DestroyRef).onDestroy(() => {
      const dialog = this.dialog().nativeElement;
      if (dialog.open) {
        dialog.close();
      }
      if (this.returnFocus?.isConnected) {
        this.returnFocus.focus({ preventScroll: true });
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.dismiss.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dismiss.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const dialog = this.dialog().nativeElement;
    const focusable = tabbable(dialog);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    const outside = !dialog.contains(active) || active === this.title().nativeElement;
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  /** The backdrop is the <dialog> itself; only a click that also started there closes it. */
  protected onClick(event: MouseEvent): void {
    const dialog = this.dialog().nativeElement;
    if (event.target === dialog && this.pointerDownTarget === dialog) {
      this.dismiss.emit();
    }
  }
}
