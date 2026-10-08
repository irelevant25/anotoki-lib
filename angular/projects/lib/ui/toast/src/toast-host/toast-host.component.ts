import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnotokiWords, IconComponent, KitIconName } from '@anotoki/lib/ui';
import { ToastService, ToastTone } from '../toast.service';

const ICONS: Record<ToastTone, KitIconName> = { success: 'checkCircle', info: 'info', warning: 'alert', danger: 'xCircle' };

/**
 * The toasts, bottom right (bottom centre on a phone): put it once in the
 * app's root template, `<anotoki-toast-host />`.
 *
 * The region is always in the page, empty or not - a live region made
 * together with its first message is one many screen readers never announce -
 * and named in the page's language, or in English where there are no words
 * (never by a key).
 */
@Component({
  selector: 'anotoki-toast-host',
  imports: [IconComponent],
  templateUrl: './toast-host.component.html',
  styleUrl: './toast-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
  protected readonly words = inject(AnotokiWords);
  protected readonly icons = ICONS;
}
