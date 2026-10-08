import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { AnotokiWords, SegmentedComponent, SegmentedOption, keepOnScreen, uniqueId } from '@anotoki/lib/ui';
import { MenuComponent, MenuItemComponent, MenuTriggerDirective } from '@anotoki/lib/ui/menu';
import { ANOTOKI_SHELL_CONFIG, AnotokiLanguage } from '../config';

/** Up to this many languages are segments side by side (`auto`); more would not fit beside the theme on a phone. */
const MOST_SEGMENTS = 4;

/**
 * The language the pages are read in, from the languages the site offers
 * (provideAnotokiShell's `languages`). Draws nothing with fewer than two.
 *
 * - `menu` - the top bar's: one 40 px button showing the language's code,
 *   opening a menu of the languages, each under its own name and with its own
 *   `lang`. The button's name holds the code it shows - "Language:
 *   Slovenčina (SK)" - so "click SK" finds it by voice (WCAG 2.5.3).
 * - `segmented` - the codes side by side (a radio group), each named in its own language.
 * - `select` - a native select of the names.
 * - `auto` - segments up to four languages, the select above (a sign-in page).
 *
 * A language is switched to once its words are there (the site's `choose`),
 * and `changed` says so. The last choice wins: the control stays usable while
 * a language is on its way, and only the latest choice's answer counts. A
 * language that cannot be had leaves the page as it is, and a note under the
 * control says so; so does one the account refused (`notSaved`). A note goes
 * on the next choice, a click elsewhere or Escape. Keys pressed in it stay in
 * it: a page listening on `document` (a quiz's Enter) never hears them.
 */
@Component({
  selector: 'anotoki-language-switcher',
  imports: [MenuComponent, MenuItemComponent, MenuTriggerDirective, SegmentedComponent],
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-language-switcher',
    '[class.is-menu]': 'form() === "menu"',
    '[hidden]': '!offered()',
    '(keydown)': 'onKeydown($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class LanguageSwitcherComponent {
  protected readonly words = inject(AnotokiWords);
  private readonly config = inject(ANOTOKI_SHELL_CONFIG, { optional: true })?.languages;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly appearance = input<'menu' | 'segmented' | 'select' | 'auto'>('menu');
  /** The language now on the page - emitted only once it is. */
  readonly changed = output<string>();

  protected readonly languages = computed<readonly AnotokiLanguage[]>(() => this.config?.offered() ?? []);
  protected readonly current = computed(() => this.config?.current() ?? '');
  protected readonly offered = computed(() => this.languages().length >= 2);
  protected readonly form = computed(() => {
    const appearance = this.appearance();
    return appearance === 'auto' ? (this.languages().length <= MOST_SEGMENTS ? 'segmented' : 'select') : appearance;
  });

  /** The language on the page as its speakers write it; its code while the list does not name it. */
  protected readonly currentName = computed(() => {
    const code = this.current();
    return this.languages().find((language) => language.code === code)?.name ?? code.toUpperCase();
  });
  protected readonly code = computed(() => this.current().toUpperCase());
  protected readonly buttonName = computed(() => this.words.t('language.button', { name: this.currentName(), code: this.code() }));
  protected readonly segments = computed<SegmentedOption[]>(() =>
    this.languages().map((language) => ({
      value: language.code,
      label: language.code.toUpperCase(),
      name: `${language.name} (${language.code.toUpperCase()})`,
      hint: language.name,
      lang: language.code,
    })),
  );

  /** A chosen language's words are on their way. */
  protected readonly switching = signal(false);
  /** The latest choice could not be had. */
  private readonly failed = signal(false);
  /** What the note under the control says, if anything. */
  protected readonly note = computed(() => (this.failed() ? this.words.t('language.notLoaded') : this.config?.notSaved?.() ? this.words.t('language.notSaved') : null));

  protected readonly selectId = uniqueId('anotoki-language');

  private readonly noteElement = viewChild<ElementRef<HTMLElement>>('note');
  private readonly select = viewChild<ElementRef<HTMLSelectElement>>('select');
  /** Counts the choices made: only the latest one's answer is acted on. */
  private choice = 0;

  constructor() {
    // Near the screen's edge on a phone: the note is measured once it is drawn, and moved onto the screen.
    afterRenderEffect(() => keepOnScreen(this.noteElement()?.nativeElement));
  }

  /** Switches to a language once its words are there; says so when they cannot be had. */
  async choose(code: string): Promise<void> {
    this.dismissNotes();
    if (!this.config) {
      return;
    }
    const mine = ++this.choice;
    const before = untracked(this.current);
    this.switching.set(true);
    let switched = false;
    try {
      switched = await this.config.choose(code);
    } catch {
      switched = false;
    }
    if (mine !== this.choice) {
      // Overtaken by a later choice: its answer is no news.
      return;
    }
    this.switching.set(false);
    if (switched && code !== before) {
      this.changed.emit(code);
    } else if (!switched && untracked(this.current) !== code) {
      this.failed.set(true);
      // The select shows what is true again.
      const select = this.select()?.nativeElement;
      if (select) {
        select.value = untracked(this.current);
      }
    }
  }

  protected onSelect(event: Event): void {
    void this.choose((event.target as HTMLSelectElement).value);
  }

  /** Keys pressed here stay here; Escape puts a note away. */
  protected onKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.dismissNotes();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.contains(event.target as Node)) {
      this.dismissNotes();
    }
  }

  private dismissNotes(): void {
    this.failed.set(false);
    if (this.config?.notSaved?.()) {
      this.config.clearNotSaved?.();
    }
  }
}
