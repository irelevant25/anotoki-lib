import { DestroyRef, Directive, TemplateRef, inject } from '@angular/core';
import { AnotokiDialogRef } from './dialog-ref';

/**
 * The buttons of a dialog opened by AnotokiDialog.open(), drawn in its footer
 * row - from the opened component's own template, so they can use its fields:
 *
 * ```html
 * <ng-template anotokiDialogFooter>
 *   <button anotokiButton (click)="ref.close()">Cancel</button>
 *   <button anotokiButton variant="primary" (click)="save()">Save</button>
 * </ng-template>
 * ```
 */
@Directive({ selector: 'ng-template[anotokiDialogFooter]' })
export class DialogFooterDirective {
  constructor() {
    const ref = inject(AnotokiDialogRef, { optional: true });
    const template = inject(TemplateRef);
    if (ref) {
      ref.footer.set(template);
      inject(DestroyRef).onDestroy(() => {
        if (ref.footer() === template) {
          ref.footer.set(null);
        }
      });
    }
  }
}
