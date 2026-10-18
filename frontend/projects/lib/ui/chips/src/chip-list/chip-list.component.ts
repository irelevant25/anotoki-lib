import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, effect, inject, input, output, viewChildren } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { CHIPS_LIBRARY_WORDS } from '@anotoki/lib/words/chips';

/** One chip of a chip list. */
export interface ChipItem {
  value: string;
  /** Its words: shown, and in its remove button's name ("Remove: Furina"). */
  label: string;
  /** The words' language, where it is not the page's (an answer in Japanese): a `lang` on them. */
  lang?: string | null;
  /** false: shown without a remove button - one the person may not take away. */
  removable?: boolean;
}

/**
 * The things a person chose or added, each a chip with a small button that takes it away: the characters chosen in a
 * search, the answers a learner added, the filters on.
 *
 * A list (role="list", named by `label`); each remove button is named with the chip's words - "Remove: Furina" (the
 * library's `anotoki.chips.remove`, in the page's language; the site's database may reword it) - so a screen reader's
 * list of buttons says which, and the same words are its tooltip. A press asks the page (`remove`, with the chip's
 * value); the page takes the chip away - or keeps it, and nothing moves. Once it is gone the focus goes to the next
 * chip's button, or the one before when it was the last, or to the list itself when it was the only one: the focus
 * never falls back to the page's start. So keep the list in the page while it can be emptied.
 *
 * Long words wrap inside their chip; the buttons are 24 px, 44 px where the pointer is a finger.
 */
@Component({
  selector: 'anotoki-chip-list',
  imports: [IconComponent],
  templateUrl: './chip-list.component.html',
  styleUrl: './chip-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-chip-list', role: 'list', tabindex: '-1', '[attr.aria-label]': 'label()' },
})
export class ChipListComponent {
  /** The list's name, for screen readers: "Chosen characters". */
  readonly label = input.required<string>();
  readonly items = input.required<readonly ChipItem[]>();
  /** No chip can be taken away meanwhile (a save on its way). */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** A chip's remove button was pressed: its value. */
  readonly remove = output<string>();

  protected readonly word = pieceWords(CHIPS_LIBRARY_WORDS);

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('removeButton');
  /** The chip whose button was pressed, and where it stood: the focus goes on from there once the page takes it away. */
  private asked: { value: string; index: number } | null = null;

  constructor() {
    effect(() => {
      const items = this.items();
      const buttons = this.buttons();
      const asked = this.asked;
      if (asked === null || items.some((item) => item.value === asked.value)) {
        return;
      }
      const removable = items.map((item, index) => ({ item, index })).filter(({ item }) => item.removable !== false);
      // Until the list is drawn again, the buttons are the ones before.
      if (buttons.length !== removable.length) {
        return;
      }
      this.asked = null;
      const next = removable.findIndex(({ index }) => index >= asked.index);
      const target = buttons[next < 0 ? removable.length - 1 : next]?.nativeElement ?? this.element;
      target.focus();
    });
  }

  protected ask(item: ChipItem, index: number): void {
    this.asked = { value: item.value, index };
    this.remove.emit(item.value);
  }
}
