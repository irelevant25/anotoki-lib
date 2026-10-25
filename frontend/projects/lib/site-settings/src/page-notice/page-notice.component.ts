import { ChangeDetectionStrategy, Component, ViewContainerRef, computed, inject, inputBinding, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { drawWhile } from '../drawn-part';
import { SiteSettings } from '../site-settings.service';

/**
 * What the site's administrators are told above the page they are on - and nobody else, ever: an administrator sees
 * the site as it is, which makes the switches usable (whoever switched a page off must be able to look at it) and
 * makes a page that is off look exactly like one that is on. So this says which:
 *
 * - the site is closed for maintenance (the site settings' "Getting in", as the public settings said it when they were
 *   read - and again after the administrators' page saved): everybody else sees the closed sign;
 * - this page is switched off (Page access): everybody else gets a page that is not there;
 * - this page is shown to some readers alone: people signed in, editors and administrators, administrators.
 *
 * In the site's frame rather than on each page, following the router - between the site's header and its page, as
 * genshin's route notice; in the admin panel's frame (`[adminFrameNotice]`), the maintenance line alone. The notice
 * itself is drawn by @anotoki/lib/site-settings/notice, which this element fetches only for an administrator, and only
 * while there is something to tell them (0.11.1): the notice, the kit's callout and its words (`anotoki.siteSettings.*`,
 * read by the notice itself - the site's string first) are in no first load. With nothing to say the element holds
 * nothing.
 */
@Component({
  selector: 'anotoki-page-notice',
  templateUrl: './page-notice.component.html',
  styleUrl: './page-notice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-page-notice' },
})
export class PageNoticeComponent {
  private readonly settings = inject(SiteSettings);
  private readonly router = inject(Router);
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });

  /** The page's path, without its query or fragment, after each navigation. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  /** What there is to tell an administrator here - the site closed, this page off or limited - or null; anybody else, null. */
  private readonly told = computed(() => {
    if (!this.settings.isAdmin()) {
      return null;
    }
    const maintenance = this.settings.maintenance();
    const page = this.settings.noticeFor(this.path());
    return maintenance || page ? { maintenance, page } : null;
  });

  constructor() {
    drawWhile(
      'notice',
      () => this.slot(),
      () => this.told() !== null,
      () => [inputBinding('maintenance', () => this.told()?.maintenance ?? false), inputBinding('page', () => this.told()?.page ?? null)],
    );
  }
}
