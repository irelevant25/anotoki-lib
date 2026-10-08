import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * "Nothing here yet", said calmly: an icon, a heading, a line of text, and
 * whatever action makes the list not empty (the content).
 */
@Component({
  selector: 'anotoki-empty-state',
  imports: [IconComponent],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-empty-state' },
})
export class EmptyStateComponent {
  /** One of the kit's icons, or one the site registered. */
  readonly icon = input<string>('sparkle');
  readonly heading = input.required<string>();
  readonly text = input<string | null>(null);
}
