import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  Injector,
  input,
  model,
  numberAttribute,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { ColorFieldComponent, ColorSwatch } from '@anotoki/lib/ui/color-field';
import { AnotokiDialog } from '@anotoki/lib/ui/dialog';
import { FieldBase } from '@anotoki/lib/ui/field';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { MenuComponent, MenuItemComponent, MenuTriggerDirective } from '@anotoki/lib/ui/menu';
import { PieceWord, pieceWords } from '@anotoki/lib/ui/piece-words';
import { RichHtmlComponent, cleanRichNodes, drawRichNodes, parseRichHtml, readRichDom, richHtmlIsBlank, writeRichHtml } from '@anotoki/lib/ui/rich-html';
import { RichTextEditableDirective, RichTextToolbarComponent, TextCommand, ToolbarItemDirective, ToolbarTool } from '@anotoki/lib/ui/rich-text';
import { HTML_EDITOR_LIBRARY_WORDS, HtmlEditorLibraryKey } from '@anotoki/lib/words/html-editor';
import { MARK_SENTINEL, closestIn, inList, indentBlocks, removeColour, selectedBlocks, sentinelToMarks, touched, unwrap } from '../editing';
import { registerHtmlEditorIcons } from '../icons';
import { LinkDialogComponent, LinkDialogData, LinkDialogResult } from '../link-dialog/link-dialog.component';

/** A heading level the toolbar may offer: 2 the largest, 4 the smallest (a page's own title is its h1). */
export type HtmlEditorHeading = 2 | 3 | 4;

/** Which colour the panel under the toolbar chooses: the words' own, or the ground behind them. */
type ColourMode = 'fore' | 'back';

/** The kit's buttons, where the page names none: the formats, the lists and their indent, the link, clearing, undo and redo. */
export const HTML_EDITOR_TOOLS: readonly ToolbarTool[] = ['bold', 'italic', 'underline', 'strike', '|', 'bulletList', 'orderedList', 'indent', 'outdent', '|', 'link', 'clear', '|', 'undo', 'redo'];

/** The seven sizes of <font size>, by their words. */
const SIZES = ['1', '2', '3', '4', '5', '6', '7'] as const;

/** One step of an indent of plain lines, in pixels: a list is indented by its own levels. */
const INDENT_STEP = 24;

/** The document's editing commands, where the browser has them (a test's jsdom has none). */
type Editing = Document & { execCommand?: (command: string, ui?: boolean, value?: string) => boolean };

/**
 * The family's editor of a text's HTML - a guide, a voice line, a survey's question:
 * `<anotoki-html-editor label="The guide" [(value)]="text" [headings]="[2, 3]" highlight sizes [fonts]="fonts" colors preview />`.
 *
 * The kit's rich-text toolbar (the ARIA toolbar pattern: one Tab stop, the arrow keys between its items) over a text
 * the person writes in (a contenteditable carrying the kit's [anotokiRichTextEditable]): its buttons in `tools` (the
 * formats, the lists and their indent, the link, clearing, undo and redo), and the editor's own in the same row, each
 * where the page asks for it - `headings` (levels 2 to 4: the survey's welcome), `highlight` (the highlighter's mark),
 * `sizes` (seven, in the library's words), `fonts` (the fonts by name), `colors` (the words' colour and the colour
 * behind them, chosen in the kit's colour field under the toolbar, with the page's `swatches`), `source` (the text as
 * its HTML, to write it so) and `preview` (the text as the site shows it, beside it). A link's address is asked in a
 * dialog of the editor's own: a web or a mail address, nothing else. A paste or a drop brings plain text, never another
 * page's markup; pictures pasted or dropped are handed to the page (`images`, then `pastedImages`) - never into the text.
 *
 * **The value is the allow-list's HTML** (@anotoki/lib/ui/rich-html - the same rules a site's server keeps with,
 * Anotoki\Lib\RichHtml\RichHtml): what the person writes is read back from the page node by node through it, '' when it
 * has no words; a value from the page is drawn through it the same way, so a stored text with an event handler or a
 * javascript: link never reaches the page. Tab moves the focus on, as from every field (no keyboard trap). A field of
 * the kit's: its label (`hideLabel` keeps it for screen readers alone), hint, error, invalid, required, optional,
 * disabled, autofocus, focus(); `placeholder`, `rows` (its height in lines), `classes` (the class names its text may
 * carry: genshin's "tag"), `blurred` when the focus leaves the text.
 */
@Component({
  selector: 'anotoki-html-editor',
  imports: [
    ButtonComponent,
    ColorFieldComponent,
    IconComponent,
    MenuComponent,
    MenuItemComponent,
    MenuTriggerDirective,
    RichHtmlComponent,
    RichTextEditableDirective,
    RichTextToolbarComponent,
    ToolbarItemDirective,
  ],
  templateUrl: './html-editor.component.html',
  styleUrl: './html-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-html-editor', '[style.--_html-editor-rows]': 'rows()' },
})
export class HtmlEditorComponent extends FieldBase {
  protected readonly word = pieceWords(HTML_EDITOR_LIBRARY_WORDS);
  private readonly document = inject(DOCUMENT) as Editing;
  private readonly dialogs = inject(AnotokiDialog);
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The text's HTML: the allow-list's; '' while it has no words. */
  readonly value = model<string>('');
  /** The kit's buttons, in order ('|' a line between groups). */
  readonly tools = input<readonly ToolbarTool[]>(HTML_EDITOR_TOOLS);
  /** The heading levels the toolbar offers, each a button: [2, 3] the survey's welcome; none by default. */
  readonly headings = input<readonly HtmlEditorHeading[]>([]);
  /** The highlighter: a mark over the selected words. */
  readonly highlight = input(false, { transform: booleanAttribute });
  /** The menu of seven text sizes. */
  readonly sizes = input(false, { transform: booleanAttribute });
  /** The fonts the menu of fonts offers, by name; none: no menu. */
  readonly fonts = input<readonly string[]>([]);
  /** The words' colour and the colour behind them, chosen in the kit's colour field. */
  readonly colors = input(false, { transform: booleanAttribute });
  /** Suggested colours under the colour field, each with its name. */
  readonly swatches = input<readonly ColorSwatch[]>([]);
  /** The button that shows the text as its HTML, to write it so. */
  readonly source = input(false, { transform: booleanAttribute });
  /** The button that shows the text as the site shows it, beside the editor (open from the start). */
  readonly preview = input(false, { transform: booleanAttribute });
  /** Pictures pasted or dropped are handed to the page (`pastedImages`); without it they are not taken. */
  readonly images = input(false, { transform: booleanAttribute });
  /** The class names the text may carry - the site's own styles (genshin's "tag"); none by default. */
  readonly classes = input<readonly string[]>([]);
  /** How tall the text is, in lines (it grows with what is written). */
  readonly rows = input(6, { transform: numberAttribute });
  readonly placeholder = input('');

  /** The focus left the text (a form's "touched"). */
  readonly blurred = output<void>();
  /** Pictures pasted or dropped into the text, where `images` takes them: the page's to keep (beside the text, never in it). */
  readonly pastedImages = output<File[]>();

  protected readonly control = viewChild<ElementRef<HTMLDivElement>>('editor');
  protected readonly editable = viewChild(RichTextEditableDirective);
  private readonly sourceArea = viewChild<ElementRef<HTMLTextAreaElement>>('sourceArea');

  protected readonly labelId = `${this.inputId}-label`;
  protected readonly coloursId = `${this.inputId}-colours`;
  protected readonly sizeOptions = SIZES;

  /** The HTML the editor last drew or wrote: a value that differs is the page's, and is drawn. */
  private last: string | null = null;
  /** The text's selection, kept while it is in the text: where the editor's own buttons go back to. */
  private kept: Range | null = null;

  /** The text shown as its HTML (the source button). */
  protected readonly showingSource = signal(false);
  /** What the source holds, as typed. */
  protected readonly draft = signal('');
  /** The preview beside the text (open from the start where `preview` is asked for). */
  protected readonly previewOpen = signal(true);
  /** The colour panel under the toolbar, and the colour chosen in it, not given yet. */
  protected readonly colourPanel = signal<ColourMode | null>(null);
  protected readonly pendingColour = signal('');
  /** The colours last given, on their buttons. */
  protected readonly foreColour = signal('');
  protected readonly backColour = signal('');
  /** The text has the focus. */
  protected readonly focused = signal(false);
  /** Where the caret is: in a heading of which level, in a mark, at which size, in which font. */
  protected readonly headingHere = signal<number | null>(null);
  protected readonly markHere = signal(false);
  protected readonly sizeHere = signal<string>('3');
  protected readonly fontHere = signal<string | null>(null);

  /** The text has no words: its placeholder shows. */
  protected readonly blank = computed(() => this.value() === '');
  /** The editor's own buttons do nothing: the editor is off, or shows its source. */
  protected readonly shut = computed(() => this.disabled() || this.showingSource());
  protected readonly toolbarName = computed(() => this.word('anotoki.htmlEditor.toolbar', { field: this.label() }).text);
  protected override readonly describedBy = computed(() => (this.error() ? this.errorId : this.hint() ? this.hintId : null));

  constructor() {
    super();
    registerHtmlEditorIcons(inject(AnotokiIcons));
    // A value from the page - one the editor did not write - is drawn through the allow-list.
    effect(() => {
      const value = this.value();
      const editor = this.control()?.nativeElement;
      if (editor && value !== this.last) {
        untracked(() => this.draw(value));
      }
    });
    // The selection moves with no event on the text (the arrow keys, a click): the document says so.
    const moved = () => this.onSelectionChange();
    this.document.addEventListener('selectionchange', moved);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('selectionchange', moved));
  }

  /** One of the seven sizes, in the library's words. */
  protected sizeName(size: string): PieceWord {
    return this.word(`anotoki.htmlEditor.size${size}` as HtmlEditorLibraryKey);
  }

  /** A word of the editor's, its text. */
  protected says(key: HtmlEditorLibraryKey, params?: Record<string, string | number>): string {
    return this.word(key, params).text;
  }

  // ── The text ─────────────────────────────────────────────────────────────────────────────────────────────────────

  protected onInput(): void {
    this.write();
  }

  protected onFocus(): void {
    this.focused.set(true);
    // A new line is a paragraph, as the survey's editor and every page's text write them.
    this.exec('defaultParagraphSeparator', 'p');
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.blurred.emit();
  }

  /** A paste or a drop of pictures, where the page takes them: handed out, never into the text. */
  protected onPictures(event: ClipboardEvent | DragEvent): void {
    const data = 'clipboardData' in event ? event.clipboardData : event.dataTransfer;
    const pictures = Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!this.images() || pictures.length === 0) {
      return;
    }
    // Words with the pictures (cells of a spreadsheet, with a picture of them) are what was meant - but an address alone.
    const text = (data?.getData('text/plain') ?? '').trim();
    if (text !== '' && !/^https?:\/\/\S+$/i.test(text)) {
      return;
    }
    event.preventDefault();
    this.pastedImages.emit(pictures);
  }

  /** The value drawn into the text: through the allow-list, an empty line where it has no words (a caret has a place). */
  private draw(value: string): void {
    const editor = this.control()?.nativeElement;
    if (!editor) {
      return;
    }
    this.last = value;
    editor.replaceChildren();
    const nodes = cleanRichNodes(parseRichHtml(value), { classes: this.classes() });
    drawRichNodes(richHtmlIsBlank(value) ? [{ tag: 'p', attrs: [], children: [{ tag: 'br', attrs: [], children: [] }] }] : nodes, editor, this.document);
  }

  /** What the text holds now, read back through the allow-list, as the value: '' while it has no words. */
  private write(): void {
    const editor = this.control()?.nativeElement;
    if (!editor) {
      return;
    }
    const html = writeRichHtml(readRichDom(editor, { classes: this.classes() }));
    const value = richHtmlIsBlank(html) ? '' : html;
    this.last = value;
    this.value.set(value);
  }

  // ── The toolbar ──────────────────────────────────────────────────────────────────────────────────────────────────

  /** A press of the kit's toolbar: the browser's editing, the link's dialog, or the indent of plain lines. */
  protected onCommand(command: TextCommand): void {
    const editable = this.editable();
    if (!editable || this.disabled()) {
      return;
    }
    if (command === 'link') {
      this.askForLink();
      return;
    }
    if (command === 'indent' || command === 'outdent') {
      this.indent(command === 'indent' ? 1 : -1);
      return;
    }
    editable.run(command);
    if (command === 'clear') {
      // Clearing takes the highlighter's marks away too, which the browser's removeFormat leaves.
      this.inRange((editor, range) => touched(editor, range, 'mark').forEach(unwrap));
    }
    this.write();
  }

  /** A heading of that level where the caret is - or the line again where it is one. */
  protected toggleHeading(level: number): void {
    this.restore();
    this.exec('formatBlock', this.headingHere() === level ? 'p' : `h${level}`);
    this.write();
    this.onSelectionChange();
  }

  /** The highlighter: a mark over the selected words, or the marks it touches taken away. */
  protected toggleMark(): void {
    this.inRange((editor, range) => {
      const marks = touched(editor, range, 'mark');
      if (marks.length) {
        marks.forEach(unwrap);
      } else if (!range.collapsed) {
        this.exec('hiliteColor', MARK_SENTINEL);
        sentinelToMarks(editor);
      }
    });
    this.write();
    this.onSelectionChange();
  }

  protected chooseSize(size: string): void {
    this.restore();
    this.exec('fontSize', size);
    this.write();
    this.onSelectionChange();
  }

  protected chooseFont(font: string): void {
    this.restore();
    this.exec('fontName', font);
    this.write();
    this.onSelectionChange();
  }

  /** Before one of the editor's own buttons takes the focus: what it will act on. */
  protected keepSelection(): void {
    const range = this.rangeInside();
    if (range) {
      this.kept = range.cloneRange();
    }
  }

  // ── The colours ──────────────────────────────────────────────────────────────────────────────────────────────────

  /** Opens the colour panel for the words' colour or their ground - or closes it. */
  protected toggleColours(mode: ColourMode): void {
    if (this.colourPanel() === mode) {
      this.closeColours(false);
      return;
    }
    this.keepSelection();
    this.pendingColour.set(mode === 'fore' ? this.foreColour() : this.backColour());
    this.colourPanel.set(mode);
  }

  /** The colour chosen, on the selected words; the panel closes and the text has the focus. */
  protected applyColour(mode: ColourMode): void {
    const colour = this.pendingColour();
    if (!colour) {
      return;
    }
    this.restore();
    this.exec(mode === 'fore' ? 'foreColor' : 'hiliteColor', colour);
    (mode === 'fore' ? this.foreColour : this.backColour).set(colour);
    this.colourPanel.set(null);
    this.write();
  }

  /** No colour: the words' own (or their ground) taken off the selection. */
  protected clearColour(mode: ColourMode): void {
    this.inRange((editor, range) => removeColour(editor, range, mode));
    (mode === 'fore' ? this.foreColour : this.backColour).set('');
    this.colourPanel.set(null);
    this.write();
  }

  /** The panel closed - by Escape or Close with the focus back on the button that opened it. */
  protected closeColours(returnFocus: boolean): void {
    const mode = this.colourPanel();
    this.colourPanel.set(null);
    if (returnFocus && mode) {
      afterNextRender(() => this.element.querySelector<HTMLElement>(`[data-colour="${mode}"]`)?.focus(), { injector: this.injector });
    }
  }

  // ── The source and the preview ───────────────────────────────────────────────────────────────────────────────────

  protected toggleSource(): void {
    if (this.showingSource()) {
      this.showingSource.set(false);
      // The text drawn afresh from what the source made of it.
      this.last = null;
      afterNextRender(() => this.draw(this.value()), { injector: this.injector });
      return;
    }
    this.colourPanel.set(null);
    this.draft.set(this.value());
    this.showingSource.set(true);
    afterNextRender(() => this.sourceArea()?.nativeElement.focus(), { injector: this.injector });
  }

  /** The source typed: the value is what the allow-list makes of it ('' with no words); the source keeps what was typed. */
  protected onSourceInput(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    this.draft.set(text);
    const html = writeRichHtml(cleanRichNodes(parseRichHtml(text), { classes: this.classes() }));
    const value = richHtmlIsBlank(html) ? '' : html;
    this.last = value;
    this.value.set(value);
  }

  protected togglePreview(): void {
    this.previewOpen.update((open) => !open);
  }

  // ── Within the text ──────────────────────────────────────────────────────────────────────────────────────────────

  /** The link's address, asked in the editor's own dialog; then the kit's link() - or that link changed, or taken away. */
  private askForLink(): void {
    this.keepSelection();
    // The words chosen as the dialog opens: the dialog gives the focus back to the text, where a browser puts the caret
    // at its start - which the text's own selection then follows.
    const held = this.kept?.cloneRange() ?? null;
    const editor = this.control()?.nativeElement;
    const anchor = editor && held ? closestIn(held.commonAncestorContainer, editor, 'a') : null;
    const ref = this.dialogs.open<LinkDialogComponent, LinkDialogResult, LinkDialogData>(LinkDialogComponent, {
      heading: this.says(anchor ? 'anotoki.htmlEditor.linkChange' : 'anotoki.htmlEditor.linkAdd'),
      size: 'sm',
      data: { inLink: anchor !== null, address: anchor?.getAttribute('href') ?? '' },
    });
    void ref.closed.then((result) => {
      const editable = this.editable();
      this.restore(held);
      if (!result || !editable) {
        return;
      }
      if (anchor && editor?.contains(anchor) && ('remove' in result || held?.collapsed)) {
        // The caret in a link: the whole link changes, or goes.
        this.select(anchor);
      }
      if ('remove' in result) {
        editable.unlink();
      } else {
        editable.link(result.address);
      }
      this.write();
    });
  }

  /** The indent of the selected lines: a list's level in a list, a step of margin on plain lines. */
  private indent(direction: 1 | -1): void {
    this.restore();
    const editor = this.control()?.nativeElement;
    const range = this.rangeInside();
    if (!editor || !range) {
      return;
    }
    if (inList(range.startContainer, editor)) {
      this.editable()?.run(direction === 1 ? 'indent' : 'outdent');
    } else {
      let blocks = selectedBlocks(editor, range);
      if (blocks.length === 0) {
        // A line standing bare in the text: made a paragraph first, then indented.
        this.exec('formatBlock', 'p');
        const again = this.rangeInside();
        blocks = again ? selectedBlocks(editor, again) : [];
      }
      indentBlocks(blocks, direction, INDENT_STEP);
    }
    this.write();
  }

  /** Runs `work` on the text's selection, the focus and the selection put back in the text first. */
  private inRange(work: (editor: HTMLElement, range: Range) => void): void {
    this.restore();
    const editor = this.control()?.nativeElement;
    const range = this.rangeInside();
    if (editor && range) {
      work(editor, range);
    }
  }

  /**
   * The focus in the text, and its selection where the person left it - a button of the editor's took the focus, or a
   * focus given back put the caret at the text's start (some engines do): the range held before is put back. `held`,
   * where the caller kept it, before all (a dialog's: the text's own selection is the caret the focus brought back).
   */
  private restore(held: Range | null = null): void {
    const editor = this.control()?.nativeElement;
    if (!editor) {
      return;
    }
    const range = held ?? this.rangeInside()?.cloneRange() ?? this.kept;
    if (this.document.activeElement !== editor) {
      editor.focus();
    }
    const selection = this.document.getSelection();
    const now = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const same =
      now !== null &&
      range !== null &&
      now.startContainer === range.startContainer &&
      now.startOffset === range.startOffset &&
      now.endContainer === range.endContainer &&
      now.endOffset === range.endOffset;
    if (range && selection && !same && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  /** The selection's range, where it is in the text; null where it is not. */
  private rangeInside(): Range | null {
    const editor = this.control()?.nativeElement;
    const selection = this.document.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer) ? range : null;
  }

  /** Selects the whole of an element of the text (a link, to change or to take away). */
  private select(element: Element): void {
    const selection = this.document.getSelection();
    if (!selection) {
      return;
    }
    const range = this.document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    this.kept = range.cloneRange();
  }

  /** Where the caret is: the heading, the mark, the size and the font of the editor's own buttons. */
  private onSelectionChange(): void {
    const editor = this.control()?.nativeElement;
    const range = this.rangeInside();
    if (!editor || !range) {
      return;
    }
    this.kept = range.cloneRange();
    const at = range.startContainer;
    const heading = closestIn(at, editor, 'h2, h3, h4');
    this.headingHere.set(heading ? Number(heading.localName.slice(1)) : null);
    this.markHere.set(closestIn(at, editor, 'mark') !== null);
    this.sizeHere.set(closestIn(at, editor, 'font[size]')?.getAttribute('size') ?? '3');
    this.fontHere.set(closestIn(at, editor, 'font[face]')?.getAttribute('face') ?? null);
  }

  private exec(command: string, value?: string): boolean {
    try {
      return this.document.execCommand?.(command, false, value) ?? false;
    } catch {
      return false;
    }
  }
}
