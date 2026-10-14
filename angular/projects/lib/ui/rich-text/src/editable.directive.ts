import { DOCUMENT, DestroyRef, Directive, ElementRef, inject, signal } from '@angular/core';
import { TextCommand, safeLinkAddress } from './commands';

/** The browser's editing commands for the toolbar's: a contenteditable's own (document.execCommand). */
const EDITING: Readonly<Record<Exclude<TextCommand, 'link'>, string>> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikeThrough',
  bulletList: 'insertUnorderedList',
  orderedList: 'insertOrderedList',
  indent: 'indent',
  outdent: 'outdent',
  clear: 'removeFormat',
  undo: 'undo',
  redo: 'redo',
};

/** The formats whose state the browser says where the caret is (document.queryCommandState). */
const STATES = ['bold', 'italic', 'underline', 'strike', 'bulletList', 'orderedList'] as const;

/** What comes into the editor from outside: a paste, a drop. */
const FROM_OUTSIDE = ['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop'];

/** The document's editing commands, where the browser has them (a test's jsdom has none). */
type Editing = Document & { execCommand?: (command: string, ui?: boolean, value?: string) => boolean; queryCommandState?: (command: string) => boolean };

/**
 * Carries the toolbar's commands out on a plain contenteditable of the site's (genshin's editor):
 *
 * ```html
 * <anotoki-rich-text-toolbar controls="text" [active]="editor.active()" (command)="command($event)" />
 * <div id="text" contenteditable="true" role="textbox" aria-multiline="true" anotokiRichTextEditable #editor="anotokiRichTextEditable"></div>
 * ```
 *
 * `run(command)` gives it to the browser's own editing (document.execCommand: bold, a list, indent, removeFormat, undo),
 * after putting the focus and the text's selection back in the editor - they are where the person left them, a toolbar
 * button pressed with the keyboard or not. `active` is the formats on where the caret is, for the toolbar's `active`,
 * followed as the selection moves. A link needs its address, which the site asks for in its own words: `link(address)`
 * takes a web, mail or the site's own address and refuses any other (`safeLinkAddress`: never javascript:), `unlink()`.
 *
 * It never inserts markup, and takes none from outside: a paste or a drop that brings HTML (a web page's, a word
 * processor's) comes in as its plain text - and a drop of files not at all. What the editor holds is the site's to read
 * (its own code reads the element's markup) and to clean before it shows it; its server cleans every text it keeps.
 */
@Directive({
  selector: '[anotokiRichTextEditable]',
  exportAs: 'anotokiRichTextEditable',
  host: {
    '(beforeinput)': 'onBeforeInput($event)',
    '(input)': 'refresh()',
    '(focus)': 'refresh()',
  },
})
export class RichTextEditableDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT) as Editing;

  /** The formats on where the caret is: the toolbar's `active`. */
  readonly active = signal<readonly TextCommand[]>([]);
  /** The text's selection, kept while it is in the editor: where a command goes back to. */
  private kept: Range | null = null;

  constructor() {
    // The selection moves with no event on the element (the arrow keys, a click inside it): the document says so.
    const moved = () => this.onSelectionChange();
    this.document.addEventListener('selectionchange', moved);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('selectionchange', moved));
  }

  /** Carries a command out on the editor: false where the browser did not (and for 'link', which needs `link()`). */
  run(command: TextCommand): boolean {
    if (command === 'link') {
      return false;
    }
    this.restore();
    const done = this.exec(EDITING[command]);
    if (command === 'clear') {
      // Clearing the formatting takes links away too; removeFormat leaves them.
      this.exec('unlink');
    }
    this.refresh();
    return done;
  }

  /** Makes the selected words a link: false, and nothing done, for an address the kit does not let in. */
  link(address: string): boolean {
    const safe = safeLinkAddress(address);
    if (safe === null) {
      return false;
    }
    this.restore();
    this.exec('createLink', safe);
    this.refresh();
    return true;
  }

  /** Takes the link where the caret is away. */
  unlink(): void {
    this.restore();
    this.exec('unlink');
    this.refresh();
  }

  /** Reads which formats are on where the caret is. */
  refresh(): void {
    if (!this.selectionInside()) {
      return;
    }
    const on: TextCommand[] = STATES.filter((command) => this.state(EDITING[command]));
    if (this.inLink()) {
      on.push('link');
    }
    this.active.set(on);
  }

  /** A paste or a drop: in as plain text where it brings anything else. */
  protected onBeforeInput(event: InputEvent): void {
    if (!FROM_OUTSIDE.includes(event.inputType)) {
      return;
    }
    const data = event.dataTransfer;
    const types = Array.from(data?.types ?? []);
    if (!data || types.every((type) => type === 'text/plain')) {
      // Plain text alone: the browser inserts it as text.
      return;
    }
    event.preventDefault();
    const text = types.includes('Files') && !types.includes('text/plain') ? '' : data.getData('text/plain');
    if (text === '') {
      return;
    }
    if (event.inputType === 'insertFromDrop') {
      // Where it was dropped: the drop's own place, not the caret's.
      const target = event.getTargetRanges?.()[0];
      const selection = this.document.getSelection();
      if (target && selection) {
        const range = this.document.createRange();
        range.setStart(target.startContainer, target.startOffset);
        range.setEnd(target.endContainer, target.endOffset);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    this.exec('insertText', text);
  }

  private onSelectionChange(): void {
    const selection = this.document.getSelection();
    if (selection && selection.rangeCount > 0 && this.selectionInside()) {
      this.kept = selection.getRangeAt(0).cloneRange();
      this.refresh();
    }
  }

  /** The focus in the editor, and its selection where the person left it (a toolbar's button took neither, or the focus alone). */
  private restore(): void {
    // Asked before the focus moves: focusing the editor puts a caret in it, at its start.
    const inside = this.selectionInside();
    if (this.document.activeElement !== this.element) {
      this.element.focus();
    }
    const selection = this.document.getSelection();
    if (!inside && selection && this.kept) {
      selection.removeAllRanges();
      selection.addRange(this.kept);
    }
  }

  private selectionInside(): boolean {
    const selection = this.document.getSelection();
    return !!selection && selection.rangeCount > 0 && this.element.contains(selection.getRangeAt(0).commonAncestorContainer);
  }

  private inLink(): boolean {
    const node = this.document.getSelection()?.anchorNode ?? null;
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    const link = element?.closest('a');
    return !!link && this.element.contains(link);
  }

  private exec(command: string, value?: string): boolean {
    try {
      return this.document.execCommand?.(command, false, value) ?? false;
    } catch {
      return false;
    }
  }

  private state(command: string): boolean {
    try {
      return this.document.queryCommandState?.(command) ?? false;
    } catch {
      return false;
    }
  }
}
