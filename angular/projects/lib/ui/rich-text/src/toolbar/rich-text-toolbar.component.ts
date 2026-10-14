import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, inject, input, output, signal, viewChildren } from '@angular/core';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { PieceWord, pieceWords } from '@anotoki/lib/ui/piece-words';
import { RICH_TEXT_LIBRARY_WORDS } from '@anotoki/lib/words/rich-text';
import { DEFAULT_TOOLS, TOGGLES, TOOL_ICONS, TOOL_WORDS, TextCommand, ToolbarTool } from '../commands';
import { registerRichTextIcons } from '../icons';

/** The mark of the toolbar's items - its buttons and the site's own: the arrow keys move between them. */
const ITEM = 'data-anotoki-toolbar-item';

/**
 * The buttons over a text editor - bold, italic, a list, a link - as the ARIA toolbar pattern has them:
 * `<anotoki-rich-text-toolbar controls="guide-text" [active]="formats()" (command)="apply($event)" />`.
 *
 * role="toolbar", named ("Formatting", the library's `anotoki.richText.toolbar`, or the site's `label`) and controlling
 * the editor (`controls`, its id): one Tab stop - the button the focus was last on, the first one before that - and the
 * Left and Right arrows (round the row), Home and End move between its items. Each button is the kit's icon with its
 * name (heard, and its tooltip: "Bold", "Bulleted list"); a format that is on says so (aria-pressed, from `active`) and
 * is drawn on - a ring and the soft primary ground, not a colour alone. `unavailable` (undo with nothing to undo) and
 * `disabled` keep buttons in the row, aria-disabled, doing nothing. `tools` chooses the buttons and their order ('|' a
 * line between groups); the site's own controls go after them (`[anotokiToolbarItem]` on each: a menu button for the
 * font, a colour box), one row and one Tab stop with them - so a control that uses Left and Right itself (a text
 * field) is no item of a toolbar.
 *
 * It holds no text and inserts none: a press is `command` ('bold', 'link', ...), for the site's editor to carry out -
 * a library's (the survey's TipTap: `editor.chain().focus().toggleBold().run()`, `editor.isActive('bold')` into
 * `active`), or a plain contenteditable through the kit's `[anotokiRichTextEditable]`. A press with a pointer leaves the
 * focus, and the text's selection, in the editor. What the editor writes is the site's: it shows it through its own
 * cleaning, and its server cleans every text it keeps.
 */
@Component({
  selector: 'anotoki-rich-text-toolbar',
  imports: [IconComponent],
  templateUrl: './rich-text-toolbar.component.html',
  styleUrl: './rich-text-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-rich-text-toolbar',
    role: 'toolbar',
    '[attr.aria-label]': 'name()',
    '[attr.aria-controls]': 'controls()',
    '(keydown)': 'onKeydown($event)',
    '(focusin)': 'onFocusIn($event)',
  },
})
export class RichTextToolbarComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly word = pieceWords(RICH_TEXT_LIBRARY_WORDS);

  /** The toolbar's name; without one, the library's "Formatting". */
  readonly label = input<string | null>(null);
  /** The buttons, in order; '|' draws a line between two groups. */
  readonly tools = input<readonly ToolbarTool[]>(DEFAULT_TOOLS);
  /** The formats on where the caret is: their buttons pressed. */
  readonly active = input<readonly TextCommand[]>([]);
  /** Buttons that can do nothing now (undo with nothing to undo): aria-disabled. */
  readonly unavailable = input<readonly TextCommand[]>([]);
  /** The editor's id: aria-controls. */
  readonly controls = input<string | null>(null);
  /** Every button aria-disabled (a save on its way, an editor read-only). */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** A button pressed: what it asks the editor to do. */
  readonly command = output<TextCommand>();

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('button');
  /** The site's own items, in the order they came. */
  protected readonly own = signal<readonly HTMLElement[]>([]);
  /** The item the focus was last on: the one Tab stop. */
  private readonly current = signal<HTMLElement | null>(null);

  protected readonly name = computed(() => this.label() || this.word('anotoki.richText.toolbar').text);
  /** The Tab stop before the focus was on any item: the first. */
  private readonly first = computed(() => this.buttons()[0]?.nativeElement ?? this.own()[0] ?? null);

  constructor() {
    registerRichTextIcons(inject(AnotokiIcons));
  }

  /** Whether an item is the toolbar's one Tab stop: the item the focus was last on, else the first. */
  isStop(item: HTMLElement): boolean {
    const current = this.current();
    if (current !== null && current.isConnected && this.element.contains(current)) {
      return current === item;
    }
    return this.first() === item;
  }

  /** One of the site's own items came (ToolbarItemDirective). */
  join(item: HTMLElement): void {
    this.own.update((items) => [...items, item]);
  }

  /** ... or went. */
  leave(item: HTMLElement): void {
    this.own.update((items) => items.filter((each) => each !== item));
    if (this.current() === item) {
      this.current.set(null);
    }
  }

  protected wordsOf(tool: TextCommand): PieceWord {
    return this.word(TOOL_WORDS[tool]);
  }

  protected iconOf(tool: TextCommand): string {
    return TOOL_ICONS[tool];
  }

  protected isToggle(tool: TextCommand): boolean {
    return TOGGLES.includes(tool);
  }

  protected isOn(tool: TextCommand): boolean {
    return this.active().includes(tool);
  }

  protected isShut(tool: TextCommand): boolean {
    return this.disabled() || this.unavailable().includes(tool);
  }

  protected press(tool: TextCommand): void {
    if (!this.isShut(tool)) {
      this.command.emit(tool);
    }
  }

  /** The focus on an item (a Tab, a click, the arrows): it is the Tab stop now. */
  protected onFocusIn(event: FocusEvent): void {
    const item = (event.target as Element | null)?.closest<HTMLElement>(`[${ITEM}]`);
    if (item && this.element.contains(item)) {
      this.current.set(item);
    }
  }

  /** Left and Right round the items, Home and End to the ends - what an item handles itself (a menu's keys) is left to it. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const from = (event.target as Element | null)?.closest<HTMLElement>(`[${ITEM}]`);
    const items = this.items();
    const index = from ? items.indexOf(from) : -1;
    if (index < 0) {
      return;
    }
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    event.preventDefault();
    this.current.set(items[next]);
    items[next].focus();
  }

  /** The items that can take the focus, in the page's order: the toolbar's buttons, then the site's own. */
  private items(): HTMLElement[] {
    return Array.from(this.element.querySelectorAll<HTMLElement>(`[${ITEM}]`)).filter((item) => !(item as HTMLButtonElement).disabled);
  }
}
