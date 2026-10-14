/*
 * @anotoki/lib/ui/stepper - <anotoki-stepper> (the steps of a wizard in a row: done, current, to come; a done one a way
 * back to it) and <anotoki-step-dots> (a lesson's steps as small dots or pills). Their words (`anotoki.stepper.*`:
 * "Step 2 of 4", "done") are @anotoki/lib/words/stepper, read by the pieces themselves. An entry point of its own: not
 * re-exported by @anotoki/lib/ui.
 */

export type { StepItem } from './src/step-item';
export { StepDotsComponent } from './src/step-dots/step-dots.component';
export { StepperComponent } from './src/stepper/stepper.component';
