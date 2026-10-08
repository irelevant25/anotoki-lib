import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, TemplateRef, afterNextRender, computed, contentChild, contentChildren, inject, isDevMode } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { ANOTOKI_MIGRATIONS_CONFIG } from '../config';
import { isOnRoute } from '../http';
import { SiteStatus } from '../site-status.service';
import { SiteStatusComponent } from '../site-status/site-status.component';
import { SitePagesDirective } from './site-pages.directive';

/**
 * Wraps the site's pages (its router outlet): shows them while the site is
 * ready - or not asked yet - and the status page otherwise. An ADMIN still
 * reaches the Migrations page while an update waits, and nothing else. It
 * asks the server once, when nothing has asked yet, and follows the router.
 *
 * Give it the pages as a marked template -
 * `<anotoki-site-gate><ng-template anotokiSitePages><router-outlet /></ng-template></anotoki-site-gate>`
 * (and SitePagesDirective in the component's imports) - and they are made only
 * while the site is open. Content given as it is, without the marked template,
 * shows as it did in 0.1.0 - but Angular makes it whether it shows or not, so
 * a page behind the status page would still run and send its requests (and
 * their failures) while nobody sees it. An unmarked `<ng-template>` is no
 * longer taken for the pages: a control-flow block is a template too.
 */
@Component({
  selector: 'anotoki-site-gate',
  imports: [NgTemplateOutlet, SiteStatusComponent],
  templateUrl: './site-gate.component.html',
  styleUrl: './site-gate.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteGateComponent {
  private readonly status = inject(SiteStatus);
  private readonly config = inject(ANOTOKI_MIGRATIONS_CONFIG);
  private readonly router = inject(Router);

  /** The pages, when they come as a marked template: made only while the site is open. */
  private readonly marked = contentChild(SitePagesDirective);
  protected readonly pages = computed(() => this.marked()?.template ?? null);
  /** Every template given as content (control-flow blocks included): only for the warning below. */
  private readonly templates = contentChildren(TemplateRef);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Whether the site's own pages show. */
  protected readonly open = computed(() => {
    const state = this.status.state();
    if (state === 'ready' || state === 'unknown') {
      return true;
    }
    return state === 'update-pending' && this.config.isAdmin() && isOnRoute(this.url(), this.config.migrationsRoute);
  });

  constructor() {
    if (this.status.state() === 'unknown') {
      void this.status.check();
    }

    // An unmarked <ng-template> (the 0.1.1 form) draws nothing now: said once, in development, where it shows.
    if (isDevMode()) {
      const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
      afterNextRender(() => {
        if (!this.marked() && this.templates().length > 0 && this.open() && !host.querySelector('*')) {
          console.warn(
            '<anotoki-site-gate> draws nothing. If its pages are an <ng-template>, mark it - <ng-template anotokiSitePages> - and import SitePagesDirective: since @anotoki/lib 0.2.0 an unmarked template is not taken for the pages.',
          );
        }
      });
    }
  }
}
