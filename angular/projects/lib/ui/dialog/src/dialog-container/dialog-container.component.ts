import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Type, inject, input } from '@angular/core';
import { DialogComponent } from '../dialog/dialog.component';
import { AnotokiDialogRef } from '../dialog-ref';

/**
 * Draws a component AnotokiDialog.open() was given inside an <anotoki-dialog>,
 * and the component's footer in the dialog's footer row. Internal.
 */
@Component({
  selector: 'anotoki-dialog-container',
  imports: [DialogComponent, NgComponentOutlet, NgTemplateOutlet],
  templateUrl: './dialog-container.component.html',
  styleUrl: './dialog-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogContainerComponent {
  protected readonly ref = inject(AnotokiDialogRef);

  readonly component = input.required<Type<unknown>>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly dismissible = input(true);
  readonly description = input<string | null>(null);
}
