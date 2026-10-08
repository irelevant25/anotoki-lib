import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnotokiWords, ButtonComponent } from '@anotoki/lib/ui';
import { ConfirmService } from '../confirm.service';
import { DialogComponent } from '../dialog/dialog.component';

/**
 * Draws the question ConfirmService is asking, if any: put it once in the
 * app's root template, `<anotoki-confirm-host />`. The focus starts on the no.
 */
@Component({
  selector: 'anotoki-confirm-host',
  imports: [ButtonComponent, DialogComponent],
  templateUrl: './confirm-host.component.html',
  styleUrl: './confirm-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);
  protected readonly words = inject(AnotokiWords);
}
