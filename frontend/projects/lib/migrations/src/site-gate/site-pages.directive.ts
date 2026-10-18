import { Directive, TemplateRef, inject } from '@angular/core';

/**
 * Marks the template that is a site's pages, given to <anotoki-site-gate>:
 *
 * ```html
 * <anotoki-site-gate><ng-template anotokiSitePages><router-outlet /></ng-template></anotoki-site-gate>
 * ```
 *
 * The gate makes what is in it only while the site is open. A marker and not
 * any template: a control-flow block (`@if`, `@switch`, `@for`) given as the
 * gate's content is a template too, and the gate must never take one of those
 * for the pages.
 */
@Directive({ selector: 'ng-template[anotokiSitePages]' })
export class SitePagesDirective {
  readonly template = inject(TemplateRef);
}
