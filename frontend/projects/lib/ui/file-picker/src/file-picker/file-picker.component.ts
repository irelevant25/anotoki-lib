import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, effect, inject, input, model, signal, viewChild, viewChildren } from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { FieldBase } from '@anotoki/lib/ui/field';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { PieceWord, pieceWords } from '@anotoki/lib/ui/piece-words';
import { FILE_PICKER_LIBRARY_WORDS } from '@anotoki/lib/words/file-picker';
import { accepts, sameFile, writtenSize } from '../files';
import { registerFilePickerIcons } from '../icons';

/** A file of the last choice that was not taken, and why. */
type Refusal = { readonly kind: 'tooLarge'; readonly file: File } | { readonly kind: 'wrongType'; readonly file: File } | { readonly kind: 'oneOnly' };

/**
 * Files chosen to send: `<anotoki-file-picker label="Export" accept=".json" [maxSize]="20 * 1024 * 1024" [(files)]="files" />`.
 *
 * It never uploads: `files` is the browser's File objects, for the site to send where it wants - and its server checks
 * every file again (its kind, its size, what is in it): what the picker checks is a convenience for the person, a file
 * refused at once with its reason, never a defence.
 *
 * Two ways in, the button always: a real button ("Choose files") opens the device's file chooser, and the area round it
 * takes files dropped on it with a mouse ("Drop files here" - not said on a touch screen). `accept` is the kinds taken,
 * as the `accept` attribute says them ('.json', 'image/*', 'application/pdf', comma-separated), and the chooser offers
 * those; `maxSize` the largest file, in bytes. A file of another kind, or too large, is not taken, and the picker says
 * so under itself (role="alert": "photo.png is too large: 24 MB, at most 20 MB."). One file (the default: a new one takes
 * the place of the one there) or `multiple` (each added, the same file not twice; several dropped where one is taken
 * are refused together).
 *
 * The files taken are listed under it - each name, its size, and a button that takes it away ("Remove: report.json";
 * the focus then goes to the next file's button, the one before, or back to the choose button) - and a screen reader is
 * told what was chosen ("Chosen: report.json"). A field of the kit's: its label names the area (a group), its hint and
 * error are tied to the button, `required` is the page's to check, `disabled` shuts both ways in.
 */
@Component({
  selector: 'anotoki-file-picker',
  imports: [ButtonComponent, IconComponent],
  templateUrl: './file-picker.component.html',
  styleUrl: './file-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-file-picker' },
})
export class FilePickerComponent extends FieldBase {
  protected readonly word = pieceWords(FILE_PICKER_LIBRARY_WORDS);

  /** The files taken: the browser's File objects, never uploaded. */
  readonly files = model<readonly File[]>([]);
  /** Several files, each added to the list; one otherwise, a new one taking the place of the one there. */
  readonly multiple = input(false, { transform: booleanAttribute });
  /** The kinds of file taken, as the `accept` attribute says them: '.json', 'image/*', 'application/pdf', comma-separated. */
  readonly accept = input('');
  /** The largest file taken, in bytes; null for any size. */
  readonly maxSize = input<number | null>(null);

  /** The choose button (the kit's button: its element, not the component). */
  protected readonly control = viewChild('control', { read: ElementRef });
  private readonly native = viewChild<ElementRef<HTMLInputElement>>('native');
  private readonly removeButtons = viewChildren<ElementRef<HTMLButtonElement>>('removeButton');

  protected readonly labelId = `${this.inputId}-label`;
  /** Files are dragged over the area. */
  protected readonly over = signal(false);
  /** The files of the last choice that were not taken, and why. */
  private readonly refusals = signal<readonly Refusal[]>([]);
  /** The names of the files the last choice took: told to a screen reader. */
  private readonly taken = signal<readonly string[]>([]);
  /** dragenter and dragleave come in pairs for every element inside the area: the area is left when they even out. */
  private depth = 0;
  /** A file's remove button pressed: where it stood, and how many there were - the focus goes on once it is gone. */
  private asked: { index: number; count: number } | null = null;

  /** Why the files of the last choice were not taken, in the page's language. */
  protected readonly refused = computed<readonly PieceWord[]>(() =>
    this.refusals().map((refusal) => {
      if (refusal.kind === 'oneOnly') {
        return this.word('anotoki.filePicker.oneOnly');
      }
      if (refusal.kind === 'wrongType') {
        return this.word('anotoki.filePicker.wrongType', { name: refusal.file.name, types: this.kinds() });
      }
      return this.word('anotoki.filePicker.tooLarge', { name: refusal.file.name, size: this.size(refusal.file.size), max: this.size(this.maxSize() ?? 0) });
    }),
  );

  /** What a screen reader is told of the last choice. */
  protected readonly told = computed(() => (this.taken().length ? this.word('anotoki.filePicker.chosen', { names: this.taken().join(', ') }).text : ''));

  /** The kinds taken, as people read them: ".json, image/*". */
  private readonly kinds = computed(() =>
    this.accept()
      .split(',')
      .map((kind) => kind.trim())
      .filter(Boolean)
      .join(', '),
  );

  constructor() {
    super();
    registerFilePickerIcons(inject(AnotokiIcons));
    // Once a file is taken away, the focus goes on to the next file's button, or the one before at the end, or back to
    // the choose button: never to the page's start.
    effect(() => {
      const buttons = this.removeButtons();
      const count = this.files().length;
      const asked = this.asked;
      if (asked === null || count !== asked.count - 1 || buttons.length !== count) {
        return;
      }
      this.asked = null;
      (buttons[Math.min(asked.index, count - 1)]?.nativeElement ?? this.control()?.nativeElement)?.focus();
    });
  }

  /** A size the page's way: "20 MB". */
  protected size(bytes: number): string {
    return writtenSize(bytes, this.words.language());
  }

  /** The button: the device's file chooser. */
  protected choose(): void {
    if (!this.disabled()) {
      this.native()?.nativeElement.click();
    }
  }

  protected onChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.take(Array.from(input.files ?? []));
    // Emptied, so that choosing the same file again is a choice again.
    input.value = '';
  }

  protected onDragEnter(event: DragEvent): void {
    if (!this.carriesFiles(event) || this.disabled()) {
      return;
    }
    event.preventDefault();
    this.depth++;
    this.over.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.carriesFiles(event) || this.disabled()) {
      return;
    }
    // Saying "yes, here" is what lets the drop happen.
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDragLeave(): void {
    if (!this.over()) {
      return;
    }
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) {
      this.over.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    if (!this.carriesFiles(event)) {
      return;
    }
    // Never left to the browser, which would open the file in place of the page.
    event.preventDefault();
    this.depth = 0;
    this.over.set(false);
    if (!this.disabled()) {
      this.take(Array.from(event.dataTransfer?.files ?? []));
    }
  }

  protected removeAt(index: number): void {
    if (this.disabled()) {
      return;
    }
    const files = this.files();
    this.asked = { index, count: files.length };
    this.refusals.set([]);
    this.taken.set([]);
    this.files.set(files.filter((_, at) => at !== index));
  }

  /** The browser's checks, then the files taken: added, or in the place of the one there. */
  private take(chosen: readonly File[]): void {
    if (chosen.length === 0) {
      return;
    }
    if (!this.multiple() && chosen.length > 1) {
      this.refusals.set([{ kind: 'oneOnly' }]);
      this.taken.set([]);
      return;
    }
    const refusals: Refusal[] = [];
    const taken: File[] = [];
    const max = this.maxSize();
    for (const file of chosen) {
      if (!accepts(file, this.accept())) {
        refusals.push({ kind: 'wrongType', file });
      } else if (max !== null && file.size > max) {
        refusals.push({ kind: 'tooLarge', file });
      } else {
        taken.push(file);
      }
    }
    this.refusals.set(refusals);
    if (taken.length === 0) {
      this.taken.set([]);
      return;
    }
    const files = this.multiple() ? [...this.files(), ...taken.filter((file) => !this.files().some((there) => sameFile(there, file)))] : taken;
    this.taken.set(taken.map((file) => file.name));
    this.files.set(files);
  }

  /** A drag that carries files (not words, nor a link from the page). */
  private carriesFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }
}
