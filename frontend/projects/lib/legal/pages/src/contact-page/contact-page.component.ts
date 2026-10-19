import { ChangeDetectionStrategy, Component, ComponentRef, DestroyRef, ElementRef, Type, ViewContainerRef, computed, inject, inputBinding, outputBinding, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FeedbackDialogComponent } from '@anotoki/lib/feedback/form';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CopyButtonComponent } from '@anotoki/lib/ui/copy';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { LegalTextComponent } from '../legal-text/legal-text.component';
import { isOwnPath, legalPage } from '../page';

/**
 * The site's contact page, modelled on genshintrack.com/contact: every message is read; a bug or an idea - the
 * site's feedback form (the library's, in the kit's dialog with its buttons in the dialog's footer, its code loaded
 * with the first press), on a site that takes feedback; everything else - the address, a mailto link joined only in
 * the page (no simple harvester reads it whole from the code), with a button that copies it; deleting the account - no
 * need to write, the anotoki account's page (after the IAM's 30 days, cancellable); how soon an answer comes; who
 * runs the site, and the fan clause where the site asks for it.
 *
 * The form takes the site's provideAnotokiFeedback() as it is (its words, its sections, the person's address), in the
 * footer's dialog (<anotoki-feedback-dialog>, 0.8.0): what was typed in either waits in the form's draft for the next.
 * For a lazy route of the site's own: `loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.ContactPageComponent)`.
 */
@Component({
  selector: 'anotoki-contact-page',
  imports: [AlertComponent, ButtonComponent, CopyButtonComponent, LegalTextComponent, PageHeaderComponent, RouterLink],
  templateUrl: './contact-page.component.html',
  styleUrl: './contact-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-contact-page', '[attr.lang]': 'page.lang()' },
})
export class ContactPageComponent {
  protected readonly page = legalPage('anotoki-contact');
  protected readonly w = this.page.w;
  protected readonly facts = this.page.facts;

  /** The site takes feedback: the form is offered first, and the address for everything else. */
  protected readonly feedback = computed(() => {
    const feedback = this.facts().feedback;
    return feedback !== undefined && feedback !== false;
  });
  protected readonly isIam = computed(() => this.facts().account.isIam === true);
  protected readonly ownDelete = computed(() => isOwnPath(this.page.deleteUrl()));
  protected readonly fan = computed(() => this.facts().fanDisclaimer === 'hoyoverse');

  /** The dialog's code is on its way; it could not be loaded. */
  protected readonly opening = signal(false);
  protected readonly failed = signal(false);

  /** The button itself (the reference names the kit's button component, whose element is wanted). */
  private readonly opener = viewChild('opener', { read: ElementRef<HTMLButtonElement> });
  /** Where the dialog is made: after the page's article - it is drawn over the page. */
  private readonly feedbackSlot = viewChild.required('feedbackSlot', { read: ViewContainerRef });
  private dialogPart: Type<FeedbackDialogComponent> | null = null;
  private dialog: ComponentRef<FeedbackDialogComponent> | null = null;
  private gone = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.gone = true));
  }

  /** Opens the form in its dialog - its code fetched with the first press, so no page that does not open it carries it. */
  protected async openFeedback(): Promise<void> {
    if (this.opening() || this.dialog) {
      return;
    }
    this.failed.set(false);
    let part = this.dialogPart;
    if (!part) {
      this.opening.set(true);
      try {
        part = this.dialogPart = (await import('@anotoki/lib/feedback/form')).FeedbackDialogComponent;
      } catch (error) {
        console.error('[anotoki legal] the feedback form could not be loaded', error);
        this.failed.set(true);
        return;
      } finally {
        this.opening.set(false);
      }
    }
    if (this.gone || this.dialog) {
      return;
    }
    this.dialog = this.feedbackSlot().createComponent(part, {
      bindings: [inputBinding('heading', () => this.w().contactFeedbackButton), outputBinding('closed', () => this.closeFeedback())],
    });
  }

  /**
   * The dialog is done with: taken away, and the focus back on the button. The button was busy - so disabled - while
   * the form's code came, and lost the focus then: the dialog, made after it, found none to give back.
   */
  private closeFeedback(): void {
    const dialog = this.dialog;
    if (!dialog) {
      return;
    }
    this.dialog = null;
    dialog.destroy();
    this.opener()?.nativeElement.focus();
  }
}
