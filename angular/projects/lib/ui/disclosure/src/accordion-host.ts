import { InjectionToken } from '@angular/core';

/** One disclosure of an accordion, as the accordion knows it. Internal. */
export interface AccordionItem {
  /** Closes it (another opened, one at a time). */
  close(): void;
  /** Its button: where the arrow keys move the focus. */
  button(): HTMLButtonElement | undefined;
}

/** The accordion a disclosure belongs to. Internal. */
export interface AccordionHost {
  add(item: AccordionItem): void;
  remove(item: AccordionItem): void;
  /** One of its disclosures opened: the others close, one at a time. */
  opened(item: AccordionItem): void;
}

/**
 * The accordion around a disclosure - provided by the accordion, and as null by every disclosure for its own content,
 * so a disclosure inside another's panel never joins the accordion around them both. Internal.
 */
export const ANOTOKI_ACCORDION = new InjectionToken<AccordionHost | null>('ANOTOKI_ACCORDION');
