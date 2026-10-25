import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageNoticeComponent, SiteSettings } from '@anotoki/lib/site-settings';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';

/**
 * The site settings on a site's pages (0.11.0), against the showcase's imagined server (site-settings-server.ts): the
 * announcement bar above the showcase's own bar (?announcement=info|warning|danger shows it from the start; the admin
 * page's save shows it too), the notice an administrator reads above this page - its row keeps it for editors and
 * administrators - and the ways to the administrators' page and to the closed sign.
 */
@Component({
  selector: 'show-site-settings-demo',
  imports: [RouterLink, ButtonComponent, CardComponent, PageHeaderComponent, PageNoticeComponent],
  templateUrl: './site-settings-demo.component.html',
  styleUrl: './site-settings-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteSettingsDemoComponent {
  protected readonly settings = inject(SiteSettings);
}
