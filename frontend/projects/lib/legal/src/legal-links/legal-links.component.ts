import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ANOTOKI_LEGAL_CONFIG, LegalPaths, legalPaths } from '../config';
import { legalLinkWords } from '../link-words';

/**
 * Terms · Privacy · Contact: the three links a site puts in its footer (in the family's frame,
 * `<anotoki-shell>`'s `[shellFooter]`), to its own paths - provideAnotokiLegal()'s, or this piece's `paths`.
 *
 * A navigation of its own ("Legal" to a screen reader), the page that is open marked `aria-current`; the dots
 * between the links are drawn, never read. Its words are the library's (`anotoki.legalLinks.*`), an owner's
 * rewording from the site's database, in the page's language. A site whose footer is its own adds the three links
 * itself, with the same words (`i18n.t('anotoki.legalLinks.terms')`).
 */
@Component({
  selector: 'anotoki-legal-links',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './legal-links.component.html',
  styleUrl: './legal-links.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-legal-links', '[attr.lang]': 'foreignLang()' },
})
export class LegalLinksComponent {
  private readonly config = inject(ANOTOKI_LEGAL_CONFIG, { optional: true });
  private readonly document = inject(DOCUMENT);

  /** The site's paths, over provideAnotokiLegal()'s - for a site that configures no pages here. */
  readonly paths = input<Partial<LegalPaths> | null>(null);

  private readonly language = computed(() => (this.config?.language?.() || this.document.documentElement.lang || 'en').trim());
  protected readonly said = computed(() => legalLinkWords(this.language(), this.config?.translate));
  /** The words' language where it is not the page's: English words on a page in another language say so. */
  protected readonly foreignLang = computed(() => (this.said().lang === this.language().toLowerCase() ? null : this.said().lang));

  protected readonly links = computed(() => {
    const paths = legalPaths({ ...this.config?.paths, ...this.paths() });
    const words = this.said().words;
    return [
      { id: 'terms', label: words.terms, path: paths.terms },
      { id: 'privacy', label: words.privacy, path: paths.privacy },
      { id: 'contact', label: words.contact, path: paths.contact },
    ];
  });
}
