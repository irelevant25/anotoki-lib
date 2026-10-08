import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { KitIconName } from '../icons';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<AlertTone, KitIconName> = {
  info: 'info',
  success: 'checkCircle',
  warning: 'alert',
  danger: 'xCircle',
};

/** A bare `announce` attribute means true. */
function announceAttribute(value: boolean | 'polite' | '' | null | undefined): boolean | 'polite' {
  return value === '' ? true : value === 'polite' ? 'polite' : !!value;
}

/**
 * A callout: a coloured box with an icon, an optional heading and content.
 *
 * `announce` is for a message that appears because of something the person
 * just did (a refused sign-in) and must be heard now: `role="alert"`; or
 * `announce="polite"` for one that may wait its turn (an action that went
 * well): `role="status"`. Leave it off for notices that are simply part of the
 * page, or a screen reader interrupts the reading to shout them. Content
 * marked `alertActions` goes in a row of buttons underneath.
 */
@Component({
  selector: 'anotoki-alert',
  imports: [IconComponent],
  templateUrl: './alert.component.html',
  styleUrl: './alert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-alert',
    '[attr.role]': 'role()',
    '[attr.data-tone]': 'tone()',
  },
})
export class AlertComponent {
  readonly tone = input<AlertTone>('info');
  readonly heading = input<string | null>(null);
  readonly announce = input(false, { transform: announceAttribute });

  protected readonly icon = computed(() => ICONS[this.tone()]);
  protected readonly role = computed(() => {
    const announce = this.announce();
    return announce === 'polite' ? 'status' : announce ? 'alert' : null;
  });
}
