import { Directive, TemplateRef, inject } from '@angular/core';

/**
 * A disclosure's content as a template, made only once it is opened - a list of hundreds, editors that load:
 * `<ng-template anotokiDisclosurePanel>…</ng-template>` inside <anotoki-disclosure>. Dropped again when it closes,
 * unless the disclosure `keep`s it (made once, then hidden while closed).
 */
@Directive({ selector: 'ng-template[anotokiDisclosurePanel]' })
export class DisclosurePanelDirective {
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
