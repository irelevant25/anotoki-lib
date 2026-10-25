import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { ANOTOKI_DIALOG_DATA, AnotokiDialogRef, DialogFooterDirective } from '@anotoki/lib/ui/dialog';
import { TextFieldComponent } from '@anotoki/lib/ui/forms';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { richLinkAddress } from '@anotoki/lib/ui/rich-html';
import { HTML_EDITOR_LIBRARY_WORDS } from '@anotoki/lib/words/html-editor';

/** What the editor tells the dialog: whether the words are a link already, and its address. */
export interface LinkDialogData {
  readonly inLink: boolean;
  readonly address: string;
}

/** What the dialog answers: an address a text's link may have, or the link taken away. Dismissed: nothing. */
export type LinkDialogResult = { readonly address: string } | { readonly remove: true };

/**
 * The address a person typed, as a text's link may have it: a web or mail address as written ("https://…",
 * "mailto:…"), a site's name with no scheme made a web address ("anotoki.eu/guides" - https), and nothing else - no
 * other scheme, no address of the site's own: richLinkAddress(), the allow-list's own rule.
 */
export function typedLinkAddress(typed: string): string | null {
  const text = typed.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    return richLinkAddress(text);
  }
  return /^[/#?]/.test(text) ? null : richLinkAddress(`https://${text}`);
}

/**
 * The HTML editor's link, asked in its own dialog - never the browser's prompt(): the kit's dialog, the focus in it and
 * back afterwards. Enter adds it, as the button does; an address a text's link may not have is refused here with why
 * (the library's words), and nothing is done - the allow-list keeps no other, wherever the text is shown or kept.
 */
@Component({
  selector: 'anotoki-html-editor-link-dialog',
  imports: [ButtonComponent, DialogFooterDirective, TextFieldComponent],
  templateUrl: './link-dialog.component.html',
  styleUrl: './link-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkDialogComponent {
  private readonly ref = inject<AnotokiDialogRef<LinkDialogResult>>(AnotokiDialogRef);
  protected readonly data = inject<LinkDialogData>(ANOTOKI_DIALOG_DATA);
  protected readonly kit = inject(AnotokiWords);
  protected readonly word = pieceWords(HTML_EDITOR_LIBRARY_WORDS);

  protected readonly address = signal(this.data.address);
  /** Said once an add was tried with an address a link may not have. */
  private readonly tried = signal(false);
  private readonly safe = computed(() => typedLinkAddress(this.address()));

  protected readonly error = computed(() => (this.tried() && this.safe() === null ? this.word('anotoki.htmlEditor.linkInvalid').text : null));

  /** Enter's own work stopped: the focus goes back to the text as the dialog closes, and the key would go on there. */
  protected add(event?: Event): void {
    event?.preventDefault();
    this.tried.set(true);
    const address = this.safe();
    if (address !== null) {
      this.ref.close({ address });
    }
  }

  protected remove(): void {
    this.ref.close({ remove: true });
  }

  protected cancel(): void {
    this.ref.close();
  }
}
