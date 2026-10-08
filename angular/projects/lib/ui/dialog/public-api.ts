/*
 * @anotoki/lib/ui/dialog - the modal dialog (declared in a page's @if, or
 * opened from code with AnotokiDialog), and "Are you sure?" (ConfirmService
 * and <anotoki-confirm-host />).
 */

export { DialogComponent } from './src/dialog/dialog.component';
export { ANOTOKI_DIALOG_DATA, AnotokiDialogRef } from './src/dialog-ref';
export type { AnotokiDialogOptions } from './src/dialog.service';
export { AnotokiDialog } from './src/dialog.service';
export { DialogFooterDirective } from './src/dialog-footer.directive';
export type { ConfirmOptions } from './src/confirm.service';
export { ConfirmService } from './src/confirm.service';
export { ConfirmHostComponent } from './src/confirm-host/confirm-host.component';
