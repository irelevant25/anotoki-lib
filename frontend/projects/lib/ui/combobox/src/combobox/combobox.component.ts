import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { ChipItem, ChipListComponent } from '@anotoki/lib/ui/chips';
import { FieldBase } from '@anotoki/lib/ui/field';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { COMBOBOX_LIBRARY_WORDS } from '@anotoki/lib/words/combobox';
import { ComboboxPanelComponent } from '../combobox-panel/combobox-panel.component';
import { ComboboxOption, FoldedOption, foldOptions, matchOptions } from '../options';

/**
 * One or several things chosen out of many by typing - genshin's characters with their portraits:
 * `<anotoki-combobox label="Characters" [options]="characters" multiple [(values)]="team" />`.
 *
 * The ARIA 1.2 combobox: a text field (role="combobox", aria-expanded, aria-controls) and a list box under it
 * (role="listbox" of role="option"), the focus always in the field and the active option told by
 * aria-activedescendant. Typing filters the options - its words anywhere in a name or its `keywords`, with or without
 * accents, in any case ("furina" finds "Fúrina"), the names that start with it first - and opens the list with its first
 * match active; Down and Up move the active option (and open the list), Alt+Down opens it as it is, Enter chooses,
 * Escape closes it (and, closed, empties the field); a press on an option chooses it. Options that cannot be chosen
 * (`disabled`) are shown and passed over. Nothing matching says "No matches"; a long list draws `limit` matches at once
 * (50) and says how many more wait for more typing ("12 more: keep typing to narrow the list.") - both told to a screen
 * reader as well. An option's `picture` is drawn beside its name with an empty alt: the name says it.
 *
 * One at a time (the default: `[(value)]`, null for none): the chosen option's name in the field (its picture before
 * it), the list its check; leaving the field puts the name back, or no choice where the field was emptied. Several
 * (`multiple`: `[(values)]`, in the options' order): each pressed option is chosen or let go (aria-selected, a check), the
 * list stays open, and the chosen ones are the kit's removable chips over the field (ui/chips, "Characters: chosen").
 * A field of the kit's (its label, hint, error, invalid, required, optional, disabled).
 */
@Component({
  selector: 'anotoki-combobox',
  imports: [ChipListComponent, ComboboxPanelComponent, IconComponent],
  templateUrl: './combobox.component.html',
  styleUrl: './combobox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-combobox' },
})
export class ComboboxComponent extends FieldBase {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  protected readonly word = pieceWords(COMBOBOX_LIBRARY_WORDS);

  readonly options = input.required<readonly ComboboxOption[]>();
  /** Several at once (`[(values)]`); one otherwise (`[(value)]`). */
  readonly multiple = input(false, { transform: booleanAttribute });
  /** The chosen option's value, one at a time; null while none is. */
  readonly value = model<string | null>(null);
  /** The chosen values, with `multiple`, in the options' order. */
  readonly values = model<readonly string[]>([]);
  readonly placeholder = input('');
  /** The most matches drawn at once; the rest wait for more typing. */
  readonly limit = input(50);

  protected readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');
  private readonly list = viewChild(ComboboxPanelComponent);

  protected readonly labelId = `${this.inputId}-label`;
  protected readonly listboxId = `${this.inputId}-listbox`;

  /** The options as the filter reads them, folded once. */
  private readonly folded = computed(() => foldOptions(this.options()));

  /** The option chosen, one at a time. */
  protected readonly chosenOption = computed(() => (this.multiple() ? null : (this.options().find((option) => option.value === this.value()) ?? null)));

  /** The chosen ones, several at a time: the chips over the field. */
  protected readonly chosenItems = computed<ChipItem[]>(() => {
    if (!this.multiple()) {
      return [];
    }
    const options = this.options();
    return this.values()
      .map((value) => options.find((option) => option.value === value))
      .filter((option): option is ComboboxOption => option !== undefined)
      .map((option) => ({ value: option.value, label: option.label, lang: option.lang ?? null }));
  });

  /** What the field shows: the chosen option's name (one at a time) - or what is typed. */
  protected readonly text = linkedSignal(() => this.chosenOption()?.label ?? '');
  /** Whether what is in the field was typed since the list opened: only then does it filter. */
  private readonly typing = signal(false);
  /** The active option's value: the one Enter chooses. */
  protected readonly active = signal<string | null>(null);

  protected readonly isOpen = computed(() => this.list()?.isOpen() ?? false);
  /** What the typing finds. */
  protected readonly matches = computed(() => matchOptions(this.folded(), this.typing() ? this.text() : ''));
  /** What the list draws: the first `limit` matches. */
  protected readonly shown = computed(() => this.matches().slice(0, Math.max(1, this.limit())));
  /** How many more match than are drawn. */
  protected readonly more = computed(() => this.matches().length - this.shown().length);
  protected readonly activeId = computed(() => {
    const active = this.active();
    const entry = this.shown().find((each) => each.option.value === active);
    return entry ? this.optionId(entry) : null;
  });

  /** "No matches", "12 more: keep typing to narrow the list." - in the list for the eye, and told to a screen reader. */
  protected readonly note = computed(() => {
    if (this.matches().length === 0) {
      return this.word('anotoki.combobox.noMatches');
    }
    const more = this.more();
    return more > 0 ? this.word('anotoki.combobox.more', { count: this.number(more) }) : null;
  });
  protected readonly told = computed(() => (this.isOpen() ? (this.note()?.text ?? '') : ''));

  constructor() {
    super();
    // The list hangs from the field's box (its edge, its width), and the field keeps the focus.
    effect(() => {
      const list = this.list();
      const box = this.box()?.nativeElement;
      if (list && box) {
        list.attach(box);
      }
    });
  }

  protected optionId(entry: FoldedOption): string {
    return `${this.listboxId}-${entry.index}`;
  }

  protected isChosen(option: ComboboxOption): boolean {
    return this.multiple() ? this.values().includes(option.value) : this.value() === option.value;
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
    this.typing.set(true);
    this.open();
    this.activate(this.enabled()[0] ?? null);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const open = this.isOpen();
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (event.altKey) {
          // Alt+Down opens the list as it is; Alt+Up closes it.
          if (event.key === 'ArrowDown') {
            this.open();
          } else {
            this.close();
          }
          return;
        }
        if (!open) {
          this.open();
        }
        this.step(event.key === 'ArrowDown' ? 1 : -1, !open);
        return;
      }
      case 'Enter': {
        const active = this.enabled().find((option) => option.value === this.active());
        if (open && active) {
          event.preventDefault();
          this.pick(active);
        }
        return;
      }
      case 'Escape':
        if (open) {
          // Kept here: a dialog around the field must not close as well.
          event.preventDefault();
          event.stopPropagation();
          this.close();
        } else if (this.text() !== '') {
          event.preventDefault();
          event.stopPropagation();
          this.text.set('');
          this.typing.set(false);
          if (!this.multiple()) {
            this.value.set(null);
          }
        }
        return;
      case 'Tab':
        this.close();
        return;
      default:
        return;
    }
  }

  /** A press in the field opens the list as it is. */
  protected onClick(): void {
    this.open();
  }

  /** The arrow at the field's end: a mouse's way to open and close the list, the focus to the field. */
  protected onArrow(event: MouseEvent): void {
    event.preventDefault();
    if (this.disabled()) {
      return;
    }
    this.control()?.nativeElement.focus();
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  /** The focus left the field (the list never takes it): the list closes; one at a time, the field shows the choice again - none, where it was emptied. */
  protected onBlur(): void {
    this.close();
    if (this.multiple()) {
      this.text.set('');
    } else {
      if (this.text().trim() === '') {
        this.value.set(null);
      }
      this.text.set(this.chosenOption()?.label ?? '');
    }
    this.typing.set(false);
  }

  /** The list closed (a press outside it too). */
  protected onClosed(): void {
    this.active.set(null);
  }

  /** An option chosen - one at a time: the choice, the list closed; several: chosen or let go, the list open. */
  protected pick(option: ComboboxOption): void {
    if (option.disabled || this.disabled()) {
      return;
    }
    if (!this.multiple()) {
      this.value.set(option.value);
      this.text.set(option.label);
      this.typing.set(false);
      this.close();
      return;
    }
    const values = this.values();
    const next = values.includes(option.value) ? values.filter((value) => value !== option.value) : [...values, option.value];
    // In the options' order, whatever order they were chosen in.
    const order = this.options().map((each) => each.value);
    this.values.set(next.sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    // A new search for the next one: every option again, the one just pressed still active.
    this.text.set('');
    this.typing.set(false);
    this.activate(option);
  }

  /** A pointer over an option makes it the active one. */
  protected hover(option: ComboboxOption): void {
    if (!option.disabled) {
      this.active.set(option.value);
    }
  }

  /** A chip's remove button, several at a time. */
  protected unchoose(value: string): void {
    this.values.set(this.values().filter((each) => each !== value));
  }

  private open(): void {
    if (this.disabled() || this.isOpen()) {
      return;
    }
    this.list()?.open();
    // The chosen option active where it is drawn, as the list opens.
    if (this.active() === null) {
      const chosen = this.multiple() ? null : this.enabled().find((option) => option.value === this.value());
      if (chosen) {
        this.activate(chosen);
      }
    }
  }

  private close(): void {
    this.list()?.close();
    this.typing.set(false);
  }

  /** The options drawn that can be chosen. */
  private enabled(): ComboboxOption[] {
    return this.shown()
      .map((entry) => entry.option)
      .filter((option) => !option.disabled);
  }

  /** Down and Up: the next or the one before, round the list; the first or the last where none is active. */
  private step(direction: 1 | -1, fresh: boolean): void {
    const options = this.enabled();
    if (options.length === 0) {
      return;
    }
    const index = options.findIndex((option) => option.value === this.active());
    let next: number;
    if (index < 0) {
      next = direction === 1 ? 0 : options.length - 1;
    } else if (fresh) {
      next = index;
    } else {
      next = (index + direction + options.length) % options.length;
    }
    this.activate(options[next]);
  }

  /** Makes an option the active one, and brings it into the list's view once drawn. */
  private activate(option: ComboboxOption | null): void {
    this.active.set(option?.value ?? null);
    if (option) {
      afterNextRender(
        () => {
          const id = this.activeId();
          const element = id ? this.document.getElementById(id) : null;
          if (element && typeof element.scrollIntoView === 'function') {
            element.scrollIntoView({ block: 'nearest' });
          }
        },
        { injector: this.injector },
      );
    }
  }

  private number(count: number): string {
    try {
      return new Intl.NumberFormat(this.words.language()).format(count);
    } catch {
      return String(count);
    }
  }
}
