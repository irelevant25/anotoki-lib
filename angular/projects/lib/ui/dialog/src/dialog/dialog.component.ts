import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, ElementRef, afterNextRender, booleanAttribute, inject, input, output, viewChild } from '@angular/core';
import { AnotokiWords, IconComponent, tabbable, uniqueId } from '@anotoki/lib/ui';

/**
 * A modal dialog on the native `<dialog>` element.
 *
 * The page decides whether it exists - `@if (editing()) { <anotoki-dialog ...> }` -
 * and it opens itself with showModal() as it appears, so its content starts
 * fresh every time. It asks to be closed through `dismiss` (Escape, a click on
 * the backdrop, its close button); the page then removes it.
 *
 * showModal() makes the rest of the page inert, which is most of a focus trap;
 * Tab is kept cycling inside as well (never onto anything taken out of the tab
 * order, tabindex="-1"), so the focus never wanders to the browser's own
 * controls. The focus goes to the first `[autofocus]` element inside, else the
 * first focusable one that is not the close button, and back where it was
 * when the dialog goes.
 *
 * `dismissible` false is for the one dialog that must not close by accident
 * (recovery codes shown once); `busy` holds it open while a request it started
 * is on its way. Content marked `dialogFooter` is the row of buttons at the
 * bottom.
 */
@Component({
  selector: 'anotoki-dialog',
  imports: [IconComponent],
  templateUrl: './dialog.component.html',
  styleUrl: './dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-dialog' },
})
export class DialogComponent {
  private readonly document = inject(DOCUMENT);
  protected readonly words = inject(AnotokiWords);

  readonly heading = input.required<string>();
  readonly description = input<string | null>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly dismissible = input(true, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });

  readonly dismiss = output<void>();

  protected readonly headingId = uniqueId('anotoki-dialog-title');
  protected readonly descriptionId = uniqueId('anotoki-dialog-description');
  protected pointerDownTarget: EventTarget | null = null;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  /** Where the focus was when the dialog came: it goes back there. */
  private readonly returnFocus = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (!dialog.open) {
        dialog.showModal();
      }
      this.focusFirst(dialog);
    });

    inject(DestroyRef).onDestroy(() => {
      const dialog = this.dialog().nativeElement;
      if (dialog.open) {
        dialog.close();
      }
      if (this.returnFocus?.isConnected) {
        this.returnFocus.focus();
      }
    });
  }

  protected requestDismiss(): void {
    if (this.dismissible() && !this.busy()) {
      this.dismiss.emit();
    }
  }

  /** The browser's own close request (Escape, a back gesture): always the dialog's to decide. */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.requestDismiss();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Handled here as well as in `cancel`: Chrome closes a dialog on a second
      // Escape even when the first cancel was refused, which would lose what
      // a dialog that is not dismissible holds, with no way back.
      event.preventDefault();
      event.stopPropagation();
      this.requestDismiss();
      return;
    }
    if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  /**
   * A click on the backdrop lands on the <dialog> itself, because the panel
   * fills everything inside it. Only a click that also started there counts -
   * a text selection dragged out of a field ends on the backdrop too.
   */
  protected onClick(event: MouseEvent): void {
    const dialog = this.dialog().nativeElement;
    if (event.target === dialog && this.pointerDownTarget === dialog) {
      this.requestDismiss();
    }
  }

  private focusFirst(dialog: HTMLDialogElement): void {
    const preferred = dialog.querySelector<HTMLElement>('[autofocus]');
    const focusable = tabbable(dialog);
    const target = preferred ?? focusable.find((element) => !element.classList.contains('close')) ?? focusable[0];
    target?.focus();
  }

  private trapTab(event: KeyboardEvent): void {
    const dialog = this.dialog().nativeElement;
    const focusable = tabbable(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
}
