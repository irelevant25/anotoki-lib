import { ChangeDetectionStrategy, Component, ElementRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { LegalTextComponent } from '../legal-text/legal-text.component';
import { DATA_PROTECTION_AUTHORITY_URL, LegalLink, isOwnPath, keptParts, legalPage, recipients, storedParts } from '../page';

/**
 * The site's privacy policy - the family's words around the site's facts: who runs it (the operator, from
 * Slovakia: the controller), what the site keeps (its own list, what it keeps for visitors without an account, and
 * the library's modules it runs - feedback, the error log, the audit log, backups - each with what it is for), the
 * anotoki account (kept by the account's own site, its privacy policy linked; on the IAM itself, the account), the
 * cookies and browser storage, counting visits (the family's Umami), who else handles data, how long each part
 * stays, a person's rights under the GDPR (the account deleted on its own page; a complaint to Slovakia's
 * authority), changes, and where to write.
 *
 * In the page's language, in the site's frame - one `<h1>`, a section per `<h2>`, each part of what the site keeps
 * an `<h3>`, a list of the sections at the top. For a lazy route of the site's own:
 * `loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.PrivacyPageComponent)`.
 */
@Component({
  selector: 'anotoki-privacy-page',
  imports: [LegalTextComponent, PageHeaderComponent, RouterLink],
  templateUrl: './privacy-page.component.html',
  styleUrl: './privacy-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-privacy-page', '[attr.lang]': 'page.lang()' },
})
export class PrivacyPageComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly page = legalPage('anotoki-privacy');
  protected readonly w = this.page.w;
  protected readonly facts = this.page.facts;
  protected readonly updated = computed(() => this.page.updated('privacy'));

  protected readonly kept = computed(() => keptParts(this.facts(), this.w()));
  protected readonly stored = computed(() => storedParts(this.facts(), this.w()));
  protected readonly recipients = computed(() => recipients(this.facts(), this.w()));
  protected readonly isIam = computed(() => this.facts().account.isIam === true);
  protected readonly accountPrivacy = computed(() => this.facts().account.privacyUrl || null);
  protected readonly ownDelete = computed(() => isOwnPath(this.page.deleteUrl()));
  protected readonly authority = computed<LegalLink>(() => ({ name: 'authority', href: DATA_PROTECTION_AUTHORITY_URL, label: this.w().authority }));

  /** The page's sections, for the list at its top: each heading's id and words. */
  protected readonly sections = computed(() => {
    const w = this.w();
    return [
      { id: 'who', title: w.privacyWhoTitle },
      { id: 'keeps', title: w.privacyKeepsTitle },
      { id: 'account', title: w.accountTitle },
      { id: 'storage', title: w.privacyStorageTitle },
      { id: 'analytics', title: w.privacyAnalyticsTitle },
      { id: 'others', title: w.privacyOthersTitle },
      { id: 'how-long', title: w.privacyHowLongTitle },
      { id: 'rights', title: w.privacyRightsTitle },
      { id: 'changes', title: w.privacyChangesTitle },
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
