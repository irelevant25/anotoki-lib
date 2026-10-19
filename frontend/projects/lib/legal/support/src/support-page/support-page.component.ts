import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject } from '@angular/core';
import { ANOTOKI_LEGAL_CONFIG } from '@anotoki/lib/legal';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { supportWords } from '../words';

/** The owner's page on Ko-fi, where the anotoki projects are supported: the library's code, never a string. */
export const SUPPORT_URL = 'https://ko-fi.com/projectanotoki';

/**
 * The Support page (0.8.0), the same on every anotoki site, in the owner's own words: why and where the projects can
 * be supported, the kit's button that is a link to the owner's Ko-fi page - opened in a new tab, with no opener and no
 * referrer, the icon saying it goes elsewhere - and the owner's thanks.
 *
 * In the page's language (`anotoki.support.*`: an owner's rewording from the site's database, else the built-in
 * English and impersonal Slovak), read by the page itself; the address is the library's code. In the site's frame -
 * the one its legal pages are in. With the legal configuration or without it (the page's own language). For a lazy
 * route of the site's own: `loadComponent: () => import('@anotoki/lib/legal/support').then((m) => m.SupportPageComponent)`.
 */
@Component({
  selector: 'anotoki-support-page',
  imports: [ButtonComponent, IconComponent, PageHeaderComponent],
  templateUrl: './support-page.component.html',
  styleUrl: './support-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-support-page', '[attr.lang]': 'said().lang' },
})
export class SupportPageComponent {
  private readonly config = inject(ANOTOKI_LEGAL_CONFIG, { optional: true });
  private readonly document = inject(DOCUMENT);

  private readonly language = computed(() => (this.config?.language?.() || this.document.documentElement.lang || 'en').trim());
  protected readonly said = computed(() => supportWords(this.language(), this.config?.translate));
  protected readonly w = computed(() => this.said().words);
  protected readonly koFi = SUPPORT_URL;
}
