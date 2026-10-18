import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  ElementRef,
  Type,
  ViewContainerRef,
  booleanAttribute,
  computed,
  inject,
  input,
  inputBinding,
  output,
  outputBinding,
  signal,
  viewChild,
} from '@angular/core';
import type { FooterFeedbackDialogComponent } from '@anotoki/lib/footer/feedback';
import { LegalLinksComponent } from '@anotoki/lib/legal';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { FOOTER_LIBRARY_WORDS } from '@anotoki/lib/words/footer';

/** A fan clause the footer says, last: HoYoverse's (the genshin site, the build analyzer). */
export type SiteFooterFan = 'hoyoverse';

/** A part of the footer's first row, in the row's order. */
type RowPart = 'version' | 'whatsNew' | 'feedback';

/**
 * The family's footer, the owner's choice of 2026-10-18 - the build analyzer's: its order, its words and its top
 * border. Under every page of a site and of its admin panel (in the family's frame, `<anotoki-shell>`'s
 * `[shellFooter]`), never under the status page (README.md, "Footer"):
 *
 * - a row - "Version X" (its figures of one width), "What's new" and "Feedback", the kit's small link buttons
 *   (44 px where the pointer is a finger), each naming the dialog it opens (`aria-haspopup`), a dot between two parts
 *   that is drawn and never read. A part the site leaves out takes its dot with it, and with none the row is not drawn;
 * - Terms · Privacy · Contact, always (<anotoki-legal-links>, to the paths of the site's provideAnotokiLegal());
 * - the fan clause, where the site asks for it (`fan`).
 *
 * What's new is the site's own: the footer tells it (`whatsNew`). Feedback opens the library's feedback form -
 * the site's provideAnotokiFeedback() as it is - in the kit's dialog, named by the button's words. The dialog and the
 * form come with the first press (@anotoki/lib/footer/feedback), as the Contact page's form does, so no first load
 * carries them; the focus is back on the button once the dialog goes (Cancel, Close after the thanks, Escape, the
 * backdrop, its close button).
 *
 * Its words are the library's (`anotoki.footer.*`: the site's string first, through provideAnotokiUi's `lookup` - the
 * database's -, then the built-in English and impersonal Slovak), read by the footer itself: it has no provide*() of
 * its own, so they reach a site with the footer alone. Each says its language where it is not the page's.
 */
@Component({
  selector: 'anotoki-site-footer',
  imports: [ButtonComponent, LegalLinksComponent],
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-site-footer' },
})
export class SiteFooterComponent {
  private readonly word = pieceWords(FOOTER_LIBRARY_WORDS);

  /** The version of the site the page runs ('0.3'): "Version 0.3", first in the row. Null or empty: neither it nor its dot. */
  readonly version = input<string | null | undefined>(null);
  /** "What's new" in the row, after the version: pressed, `(whatsNew)` - the site opens its own. */
  readonly showWhatsNew = input(false, { alias: 'whatsNew', transform: booleanAttribute });
  /** "Feedback" in the row, last: pressed, the library's feedback form in the kit's dialog. A site that takes no feedback leaves it out. */
  readonly feedback = input(false, { transform: booleanAttribute });
  /** The fan clause under Terms · Privacy · Contact: 'hoyoverse' (the genshin site, the build analyzer); null for none. */
  readonly fan = input<SiteFooterFan | null | undefined>(null);

  /** "What's new" was pressed: the site opens its own What's new (the notes of its releases). */
  readonly whatsNew = output<void>();

  /** The version as it is shown, or null for none. */
  protected readonly versionNumber = computed(() => this.version()?.trim() || null);

  /** The row's parts that are on, in its order: a dot goes between two of them, never before the first or after the last. */
  protected readonly parts = computed<readonly RowPart[]>(() => {
    const parts: RowPart[] = [];
    if (this.versionNumber()) {
      parts.push('version');
    }
    if (this.showWhatsNew()) {
      parts.push('whatsNew');
    }
    if (this.feedback()) {
      parts.push('feedback');
    }
    return parts;
  });

  /** The words, in the page's language - each with its own language where it is not the page's. */
  protected readonly said = computed(() => ({
    version: this.word('anotoki.footer.version', { version: this.versionNumber() ?? '' }),
    whatsNew: this.word('anotoki.footer.whatsNew'),
    feedback: this.word('anotoki.footer.feedback'),
    fan: this.word('anotoki.footer.fanHoyoverse'),
  }));

  /** The feedback dialog's code is on its way: the button says so, and is not pressed twice. */
  protected readonly opening = signal(false);

  /** The button itself (the reference names the kit's button component, whose element is wanted). */
  private readonly feedbackButton = viewChild('feedbackButton', { read: ElementRef<HTMLButtonElement> });
  /** Where the feedback dialog is made: after the footer's <footer>, never in its landmark. */
  private readonly feedbackSlot = viewChild.required('feedbackSlot', { read: ViewContainerRef });
  private dialogPart: Type<FooterFeedbackDialogComponent> | null = null;
  private dialog: ComponentRef<FooterFeedbackDialogComponent> | null = null;
  private gone = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.gone = true));
  }

  /**
   * Opens the feedback form in its dialog - their code fetched with the first press, so no page that does not open it
   * carries it. Code that cannot be fetched (offline, a release replaced) is said in the console, and the next press
   * tries again.
   */
  protected async openFeedback(): Promise<void> {
    if (this.opening() || this.dialog) {
      return;
    }
    let part = this.dialogPart;
    if (!part) {
      this.opening.set(true);
      try {
        part = this.dialogPart = (await import('@anotoki/lib/footer/feedback')).FooterFeedbackDialogComponent;
      } catch (error) {
        console.error('[anotoki footer] the feedback form could not be loaded', error);
        return;
      } finally {
        this.opening.set(false);
      }
    }
    if (this.gone || this.dialog) {
      return;
    }
    this.dialog = this.feedbackSlot().createComponent(part, {
      bindings: [inputBinding('heading', () => this.said().feedback.text), inputBinding('lang', () => this.said().feedback.lang), outputBinding('closed', () => this.closeFeedback())],
    });
  }

  /**
   * The dialog is done with: taken away, and the focus back on the button. The button was busy - so disabled - while
   * the dialog's code came, and lost the focus then: the dialog, made after it, found none to give back.
   */
  private closeFeedback(): void {
    const dialog = this.dialog;
    if (!dialog) {
      return;
    }
    this.dialog = null;
    dialog.destroy();
    this.feedbackButton()?.nativeElement.focus();
  }
}
