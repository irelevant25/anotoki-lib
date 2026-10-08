import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/**
 * A small label - "Confirmed", "2FA", a role's name.
 *
 * The colour repeats what the word says and never replaces it: a badge must
 * read the same to somebody who cannot tell green from red. Its words stand
 * on a soft ground at 4.5:1 at least (the -text inks for success and warning).
 */
@Component({
  selector: 'anotoki-badge',
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-badge', '[attr.data-tone]': 'tone()', '[class.is-mono]': 'mono()' },
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
  /** A dot before the words. */
  readonly dot = input(false, { transform: booleanAttribute });
  /** Monospaced: a code, a version. */
  readonly mono = input(false, { transform: booleanAttribute });
}
