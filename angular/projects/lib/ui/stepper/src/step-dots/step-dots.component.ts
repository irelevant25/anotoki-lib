import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { STEPPER_LIBRARY_WORDS } from '@anotoki/lib/words/stepper';
import { StepItem, stepStates } from '../step-item';

/**
 * A lesson's steps as small dots - or pills of short words (`showLabels`: "1", "Listen") -, the current one filled,
 * the ones done in the success colour: `<anotoki-step-dots label="The unit's steps" [steps]="steps" [current]="2" />`.
 *
 * A named list as the stepper is: the current step `aria-current="step"`, heard "Step 3 of 5: Play"; a step done
 * heard "Listen, done". The dots and their short words are for the eye alone - each step's name is heard instead.
 * They wrap onto lines where the row is narrow.
 */
@Component({
  selector: 'anotoki-step-dots',
  templateUrl: './step-dots.component.html',
  styleUrl: './step-dots.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-step-dots', '[class.anotoki-step-dots--labels]': 'showLabels()' },
})
export class StepDotsComponent {
  /** The list's name, for screen readers: "The unit's steps". */
  readonly label = input.required<string>();
  readonly steps = input.required<readonly StepItem[]>();
  /** The current step's index. */
  readonly current = input(0);
  /** Each dot a pill of its short words; dots alone otherwise. */
  readonly showLabels = input(false, { transform: booleanAttribute });

  protected readonly word = pieceWords(STEPPER_LIBRARY_WORDS);
  protected readonly states = computed(() => stepStates(this.steps(), this.current()));
}
