import { ChangeDetectionStrategy, Component, ElementRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { LegalTextComponent } from '../legal-text/legal-text.component';
import { legalPage } from '../page';

/**
 * The site's terms of use - in the family's words, with the site's facts: what the site is, the anotoki account,
 * age (under 16, a parent's or guardian's permission), using it fairly, messages and feedback, a hobby project's
 * availability, no warranty and liability as far as Slovak law allows, the fan clause where the site asks for it,
 * Slovak law, and where to write. "Last updated" is the later of the site's day and the library's words'.
 *
 * In the page's language (`anotoki.legal.*`: an owner's rewording from the site's database, else the built-in
 * English and impersonal Slovak), in the site's frame - one `<h1>`, a section per `<h2>`, a list of them at the top
 * whose links move the focus to the section. For a lazy route of the site's own:
 * `loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.TermsPageComponent)`.
 */
@Component({
  selector: 'anotoki-terms-page',
  imports: [LegalTextComponent, PageHeaderComponent, RouterLink],
  templateUrl: './terms-page.component.html',
  styleUrl: './terms-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-terms-page', '[attr.lang]': 'page.lang()' },
})
export class TermsPageComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly page = legalPage('anotoki-terms');
  protected readonly w = this.page.w;
  protected readonly facts = this.page.facts;
  protected readonly updated = computed(() => this.page.updated('terms'));
  protected readonly fan = computed(() => this.facts().fanDisclaimer === 'hoyoverse');

  /** The page's sections, for the list at its top: each heading's id and words. */
  protected readonly sections = computed(() => {
    const w = this.w();
    return [
      { id: 'what', title: this.page.fill(w.termsWhatTitle) },
      { id: 'account', title: w.accountTitle },
      { id: 'age', title: w.termsAgeTitle },
      { id: 'use', title: w.termsUseTitle },
      { id: 'send', title: w.termsSendTitle },
      { id: 'availability', title: w.termsAvailabilityTitle },
      { id: 'warranty', title: w.termsWarrantyTitle },
      ...(this.fan() ? [{ id: 'fan', title: w.termsFanTitle }] : []),
      { id: 'law', title: w.termsLawTitle },
      { id: 'contact', title: w.sectionContact },
    ];
  });

  protected anchor(id: string): string {
    return `${this.page.id}-${id}`;
  }

  /** A link of the list: the focus to its section's heading, which brings it into view - the address stays. */
  protected jump(event: Event, id: string): void {
    const heading = this.host.nativeElement.querySelector<HTMLElement>(`[id="${this.anchor(id)}"]`);
    if (heading) {
      event.preventDefault();
      heading.focus();
    }
  }
}
