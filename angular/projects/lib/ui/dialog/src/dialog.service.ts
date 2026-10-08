import { ApplicationRef, DOCUMENT, EnvironmentInjector, Injectable, Injector, Type, createComponent, inject } from '@angular/core';
import { DialogContainerComponent } from './dialog-container/dialog-container.component';
import { ANOTOKI_DIALOG_DATA, AnotokiDialogRef } from './dialog-ref';

/** How AnotokiDialog.open() draws a component. */
export interface AnotokiDialogOptions<D = unknown> {
  /** What the component injects as ANOTOKI_DIALOG_DATA. */
  data?: D;
  /** The dialog's heading (the component can set it later: `inject(AnotokiDialogRef).heading.set(...)`). */
  heading?: string;
  description?: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** False: Escape, the backdrop and the close button do nothing - the component closes it. */
  dismissible?: boolean;
  /** Where the component's injections come from; the application's by default. */
  injector?: Injector;
}

/**
 * Opens a component in a dialog of its own, from code - for pages whose
 * dialogs are classes of their own rather than `@if` blocks:
 *
 * ```ts
 * const ref = inject(AnotokiDialog).open(EditPersonComponent, { heading: 'Edit', data: person });
 * const saved = await ref.closed;
 * ```
 *
 * The component injects AnotokiDialogRef (close(result), busy, heading) and
 * ANOTOKI_DIALOG_DATA, and puts its buttons in `<ng-template anotokiDialogFooter>`.
 * It is drawn in an <anotoki-dialog> with all of its rules (the focus, Tab,
 * Escape, the backdrop), attached to the application, outside the page's own
 * views.
 */
@Injectable({ providedIn: 'root' })
export class AnotokiDialog {
  private readonly appRef = inject(ApplicationRef);
  private readonly environment = inject(EnvironmentInjector);
  private readonly document = inject(DOCUMENT);

  open<C, R = unknown, D = unknown>(component: Type<C>, options: AnotokiDialogOptions<D> = {}): AnotokiDialogRef<R> {
    const ref = new AnotokiDialogRef<R>(options.heading ?? '');
    const elementInjector = Injector.create({
      providers: [
        { provide: AnotokiDialogRef, useValue: ref },
        { provide: ANOTOKI_DIALOG_DATA, useValue: options.data },
      ],
      parent: options.injector ?? this.environment,
    });
    const container = createComponent(DialogContainerComponent, { environmentInjector: this.environment, elementInjector });
    container.setInput('component', component);
    container.setInput('size', options.size ?? 'md');
    container.setInput('dismissible', options.dismissible ?? true);
    container.setInput('description', options.description ?? null);
    this.document.body.appendChild(container.location.nativeElement);
    this.appRef.attachView(container.hostView);

    ref.destroy = () => {
      this.appRef.detachView(container.hostView);
      container.destroy();
      container.location.nativeElement.remove();
    };
    return ref;
  }
}
