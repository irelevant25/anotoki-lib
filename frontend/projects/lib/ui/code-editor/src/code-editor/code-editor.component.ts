import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, input, model, output, signal, viewChild } from '@angular/core';
import { JsonPiece, jsonPieces } from '@anotoki/lib/ui/code-json';
import { SqlPiece, sqlPieces } from '@anotoki/lib/ui/code-sql';
import { FieldBase } from '@anotoki/lib/ui/field';
import { IconComponent } from '@anotoki/lib/ui/icon';

/** What the editor colours its text as; `text` colours nothing. */
export type CodeLanguage = 'json' | 'sql' | 'text';

/** A run of the text, of one kind - its colour, by its class; plain text has none. */
type CodePiece = JsonPiece | SqlPiece;

/** Each language's highlighter: the text in pieces, which joined are the text again. */
const HIGHLIGHTERS: Record<CodeLanguage, (text: string) => readonly CodePiece[]> = {
  json: jsonPieces,
  sql: sqlPieces,
  text: (text) => (text ? [{ kind: null, text }] : []),
};

/**
 * A field for code (0.9.2): `<anotoki-code-editor label="The levels, as JSON" language="json" [rows]="22" [(value)]="text" />`.
 *
 * A native textarea - typing, pasting, undo, IME, selecting and copying are the browser's own, as in any field -
 * over a layer that draws the same text coloured by the kit's highlighters (@anotoki/lib/ui/code-json, /code-sql).
 * The textarea's letters are transparent, its caret and its selection seen over the layer, which has its font, its
 * size, its padding and its line height, ligatures off in both, and follows its scrolling: each letter of the layer
 * lies under the textarea's own. The layer is a span a piece, its text drawn as text - never markup - and hidden from
 * screen readers, which read the textarea. Tab moves the focus on, as from every field (no keyboard trap: WCAG
 * 2.1.2). Spell checking, capitals and corrections are off; a line never wraps - a long one scrolls. In forced colours
 * the layer gives way to the textarea's own text.
 *
 * A field of the kit's (its label, hint, error, invalid, required, optional, disabled, hideLabel, autofocus), with
 * `readonly`, `rows` and a `placeholder`, and `blurred` when the focus leaves it - the value two-way, `[(value)]`, as
 * every field of the kit's. The value is the textarea's: its line ends are \n, as a textarea gives them.
 */
@Component({
  selector: 'anotoki-code-editor',
  imports: [IconComponent],
  templateUrl: './code-editor.component.html',
  styleUrl: './code-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-code-editor', translate: 'no' },
})
export class CodeEditorComponent extends FieldBase {
  readonly value = model<string>('');
  /** json or sql - or text, which colours nothing. */
  readonly language = input<CodeLanguage>('text');
  /** The lines it shows; more scroll, and the reader may draw it taller. */
  readonly rows = input(8);
  readonly placeholder = input('');
  readonly readonly = input(false, { transform: booleanAttribute });

  /** The focus left the field (a form's "touched"). */
  readonly blurred = output<void>();

  protected readonly control = viewChild<ElementRef<HTMLTextAreaElement>>('control');

  /** The text as the textarea holds it - its line ends \n - in the pieces of its language. */
  protected readonly pieces = computed(() => (HIGHLIGHTERS[this.language()] ?? HIGHLIGHTERS.text)(this.value().replace(/\r\n?/g, '\n')));
  /** The layer moved as far as the textarea has scrolled. */
  protected readonly offset = signal('');

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }

  protected onScroll(event: Event): void {
    const area = event.target as HTMLTextAreaElement;
    this.offset.set(`translate(${-area.scrollLeft}px, ${-area.scrollTop}px)`);
  }
}
