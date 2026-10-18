import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { STEPPER_LIBRARY_WORDS } from '@anotoki/lib/words/stepper';
import { StepItem, stepStates } from '../step-item';

/**
 * The steps of a wizard in a row - choose the game, the way in, import -:
 * `<anotoki-stepper label="The import's steps" [steps]="steps" [current]="step()" navigable (choose)="goTo($event)" />`.
 *
 * A named list, in order. The current step is `aria-current="step"`, heard "Step 2 of 4: Import"; a step done shows a
 * check and is heard "Choose the game, done" (the library's `anotoki.stepper.*`, in the page's language); one to come
 * shows its number. With `navigable` a step done is a button back to it (`choose`, its index), shut while `disabled`.
 * Narrow - its own width under 36rem, a phone's - the steps are their marks, and the current one its name too.
 */
@Component({
  selector: 'anotoki-stepper',
  imports: [IconComponent, NgTemplateOutlet],
  templateUrl: './stepper.component.html',
  styleUrl: './stepper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-stepper' },
})
export class StepperComponent {
  /** The list's name, for screen readers: "The import's steps". */
  readonly label = input.required<string>();
  readonly steps = input.required<readonly StepItem[]>();
  /** The current step's index. */
  readonly current = input(0);
  /** A step done is a button back to it. */
  readonly navigable = input(false, { transform: booleanAttribute });
  /** The way back shut meanwhile (an import on its way). */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** A step done was chosen: its index. */
  readonly choose = output<number>();

  protected readonly word = pieceWords(STEPPER_LIBRARY_WORDS);
  protected readonly states = computed(() => stepStates(this.steps(), this.current()));
}
