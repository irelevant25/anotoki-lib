/** One step of a stepper or of progress dots. */
export interface StepItem {
  /** Its name ("Choose the game"): shown by the stepper, and what a screen reader hears of the step. */
  label: string;
  /** Shorter words for the dots' pills ("1", "Listen"); the label otherwise. */
  short?: string;
  /** The words' language, where it is not the page's. */
  lang?: string | null;
  /** Done - by default every step before the current one; a step after it may be done too (passed before). */
  done?: boolean;
}

/** A step as the pieces draw it: done, the current one, or still to come. */
export type StepState = 'done' | 'current' | 'todo';

/** Each step's state: the current one is current whatever it says; another is done as it says, or when it comes before. */
export function stepStates(steps: readonly StepItem[], current: number): StepState[] {
  return steps.map((step, index) => (index === current ? 'current' : (step.done ?? index < current) ? 'done' : 'todo'));
}
