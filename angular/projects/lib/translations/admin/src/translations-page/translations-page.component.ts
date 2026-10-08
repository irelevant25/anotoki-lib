import { ChangeDetectionStrategy, Component, DOCUMENT, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminLanguage, FALLBACK_LANGUAGE, HoldsUnsavedChanges, TranslationChanges, TranslationGrid, TranslationKeyRow, TranslationService, TranslationsFailure } from '@anotoki/lib/translations';
import { AlertComponent, AnotokiIcons, BadgeComponent, ButtonComponent, EmptyStateComponent, ErrorStateComponent, IconComponent, PageHeaderComponent, SpinnerComponent } from '@anotoki/lib/ui';
import { SelectComponent, SelectOption, TextFieldComponent } from '@anotoki/lib/ui/forms';
import { TranslationsAdminApi, failureDetail, readFailure } from '../admin-api';
import { registerPageIcons } from '../icons';
import { LocalizationDrafts } from '../localization-drafts.service';
import { QuestionComponent } from '../question/question.component';
import { Questions } from '../questions';
import { saveFile } from '../save-file';
import { TranslationCellComponent } from '../translation-cell/translation-cell.component';
import {
  IMPORT_MAX_BYTES,
  KeyBlock,
  PluralForm,
  blankText,
  blockMatches,
  blockMissing,
  cellValue,
  coverage,
  editCount,
  keyBlocks,
  pluralNumbers,
  pluralSamples,
  remainingEdits,
  stringsFromFile,
  withEdit,
} from '../translation-grid';

/** A save the server refused about one key of the grid: its sentence, and the string it is about. */
interface Refusal {
  message: string;
  key: string;
  language: string | null;
}

/** A file that was not imported or exported, and why - said above the grid, beside the buttons that chose it. */
interface Notice {
  heading: string;
  message: string;
}

/** One part of the grid: a group the server alone reads (the mails), or the pages' keys. */
interface Part {
  id: string;
  heading: string | null;
  lead: string | null;
  blocks: KeyBlock[];
}

/** More languages than this no longer fit side by side: each key's strings go under one another instead. */
const COLUMNS_MAX = 3;

/** The server's word for "the tables are not there yet": an update is uploaded and not applied. */
const UNAVAILABLE = 'translations_unavailable';

const PAGES_LEAD = 'Another language may leave out a placeholder of the English string, and never adds one; the English string keeps its own. A string is drawn as text: no HTML.';

let nextId = 0;

/**
 * The admin Translations page (English, as every admin panel is): the site's
 * own words in every language - a key a row, a language a column, each string
 * a box. Its keys are the code's (migrations write them); nothing here makes or
 * removes one.
 *
 * What is typed is held until Save, which sends only the boxes that changed;
 * the server checks all of them before it writes any, and answers the grid as
 * it is now - with what others saved meanwhile. What is typed is held in
 * LocalizationDrafts, not here: a sign-in that ends takes the page away with
 * no question, and what was typed must be in its boxes when the page is back.
 * A refusal about one key is said beside it (scrolled to, its box focused) and
 * in the bar that stays in view; a key or a language that is gone meanwhile
 * makes the page read the grid again. An emptied box in another language than
 * English means "no string of its own": the key reads in English there.
 *
 * A search looks at the keys, their descriptions and their text (as stored
 * and as typed; diacritics and case aside); "Missing in X" leaves the keys a
 * language has no string of its own for - of a plural family, only the forms
 * its numbers take. Each language's strings go out as a file and come back
 * from one (the server's checks, all or nothing). Plural families are one
 * block, with the numbers each form is for and samples for 1, 3 and 12; the
 * keys only the server reads (the IAM's mails: `admin.groups`) are blocks of
 * their own, in their own part.
 *
 * For whoever the site allows (`admin.allows.strings`); anybody else is told
 * whose page it is, and nothing is asked of the server. Between an upload and
 * Apply the tables are not there yet: the page says so, and points at the
 * site's Migrations page.
 *
 * Its own entry point (@anotoki/lib/translations/admin): `loadComponent: () =>
 * import('@anotoki/lib/translations/admin').then((m) => m.TranslationsPageComponent)`,
 * with `canDeactivate: [anotokiUnsavedChangesGuard]`.
 */
@Component({
  selector: 'anotoki-translations-page',
  imports: [
    RouterLink,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    PageHeaderComponent,
    QuestionComponent,
    SelectComponent,
    SpinnerComponent,
    TextFieldComponent,
    TranslationCellComponent,
  ],
  templateUrl: './translations-page.component.html',
  styleUrl: './translations-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-translations-page', lang: 'en' },
})
export class TranslationsPageComponent implements HoldsUnsavedChanges {
  private readonly api = inject(TranslationsAdminApi);
  private readonly i18n = inject(TranslationService);
  private readonly drafts = inject(LocalizationDrafts);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  private readonly admin = this.api.settings.admin;
  protected readonly id = `anotoki-translations-${++nextId}`;
  protected readonly fallback = FALLBACK_LANGUAGE;
  protected readonly siteName = this.admin.siteName || 'the site';
  protected readonly lead = this.admin.leads?.translations || `What ${this.siteName} says, in every language. This page stays English.`;
  protected readonly migrationsRoute = this.admin.routes?.migrations ?? null;
  protected readonly questions = new Questions();
  private readonly importMax = this.admin.importMaxBytes ?? IMPORT_MAX_BYTES;

  /** The site lets this person reword its strings. */
  protected readonly allowed = computed(() => this.admin.allows?.strings?.() ?? false);
  /** The Languages page, where the site has one for this person. */
  protected readonly languagesRoute = computed(() => (this.admin.routes?.languages && (this.admin.allows?.languages?.() ?? false) ? this.admin.routes.languages : null));

  private readonly grid = signal<TranslationGrid | null>(null);
  /** The boxes that do not say what the site has: key -> language -> text. Kept outside the page, so they outlive it. */
  private readonly edits = this.drafts.strings;

  protected readonly loadError = signal<string | null>(null);
  /** The tables are not there yet: a database update waits on the Migrations page. */
  protected readonly unavailable = signal(false);
  protected readonly search = signal('');
  /** A language's code: only the keys it has no string of its own for. */
  protected readonly missingIn = signal('');
  protected readonly saving = signal(false);
  /** The language being exported, and the one being imported, just now. */
  protected readonly exporting = signal<string | null>(null);
  protected readonly importing = signal<string | null>(null);
  protected readonly refusal = signal<Refusal | null>(null);
  /** Why the last save saved nothing, when that is about no key of the grid: said in the bar, in view wherever the page is. */
  protected readonly saveFailure = signal<string | null>(null);
  /** What the last save saved, until a box changes again. */
  protected readonly saved = signal<string | null>(null);
  /** A file that went out or came in. */
  protected readonly happened = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly loaded = computed(() => this.grid() !== null);
  protected readonly languages = computed(() => this.grid()?.languages ?? []);
  protected readonly total = computed(() => this.grid()?.keys.length ?? 0);
  protected readonly stacked = computed(() => this.languages().length > COLUMNS_MAX);
  protected readonly changed = computed(() => editCount(this.edits()));

  private readonly codes = computed(() => this.languages().map((language) => language.code));
  private readonly groups = this.admin.groups ?? [];
  private readonly blocks = computed(() => keyBlocks(this.grid()?.keys ?? [], this.groups));

  /**
   * The blocks the search and the filter leave. A search looks at what stands
   * in the boxes too - but which rows match is worked out when the search, the
   * filter or the grid changes, never while a box is typed in: a row found only
   * by its unsaved words would leave, with the cursor in it, at the keystroke
   * that changes them.
   */
  protected readonly visible = computed(() => {
    const search = this.search();
    const missingIn = this.missingIn();
    const codes = this.codes();
    const edits = untracked(this.edits);
    return this.blocks().filter((block) => (missingIn === '' || blockMissing(block, missingIn)) && blockMatches(block, search, codes, edits));
  });
  protected readonly visibleKeys = computed(() => this.visible().reduce((count, block) => count + block.rows.length, 0));

  /** What is left in the grid's parts: each group's own (the mails), then the pages' keys. A part with nothing left is not drawn. */
  protected readonly parts = computed<Part[]>(() => {
    const visible = this.visible();
    if (!this.groups.length) {
      return [{ id: 'keys', heading: null, lead: null, blocks: visible }];
    }
    return [
      ...this.groups.map((group, index) => ({ id: `group-${index}`, heading: group.heading, lead: group.lead ?? null, blocks: visible.filter((block) => block.group === group) })),
      { id: 'pages', heading: 'Pages', lead: this.admin.pagesLead || PAGES_LEAD, blocks: visible.filter((block) => block.group === null) },
    ].filter((part) => part.blocks.length > 0);
  });

  /** How much of each language is written - by what is saved, and of the rows it needs. */
  protected readonly coverage = computed(() => coverage(this.blocks(), this.languages()));

  /** "Missing in Slovak" for every language that can miss a string - English cannot. */
  protected readonly missingOptions = computed<SelectOption[]>(() =>
    this.languages()
      .filter((language) => language.code !== FALLBACK_LANGUAGE)
      .map((language) => ({ value: language.code, label: `Missing in ${language.name}` })),
  );
  protected readonly missingName = computed(() => this.languages().find((language) => language.code === this.missingIn())?.name ?? '');

  private started = false;

  constructor() {
    registerPageIcons(inject(AnotokiIcons));
    // Read once the person is known to be allowed - never before, never for anybody else.
    effect(() => {
      if (this.allowed() && !this.started) {
        this.started = true;
        untracked(() => {
          // What was typed before the page was taken away is in the drafts - once they are known to be this person's.
          this.drafts.settle();
          void this.load();
        });
      }
    });
  }

  /**
   * Leaving with boxes not saved asks first - and "Leave" is what gives them
   * up: they are kept outside the page, so they would be in their boxes again
   * the next time.
   */
  canLeave(): boolean | Promise<boolean> {
    const changed = this.changed();
    if (!changed || !this.allowed()) {
      return true;
    }
    return this.questions
      .ask({
        title: 'Leave without saving?',
        message: `${changed === 1 ? '1 changed string is' : `${changed} changed strings are`} not saved yet, and leaving loses ${changed === 1 ? 'it' : 'them'}.`,
        confirmLabel: 'Leave',
        cancelLabel: 'Stay here',
        tone: 'danger',
      })
      .then((leave) => {
        if (leave) {
          this.edits.set({});
        }
        return leave;
      });
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    this.unavailable.set(false);
    try {
      this.take(await this.api.grid());
    } catch (error) {
      const failure = readFailure(error);
      if (failure.code === UNAVAILABLE) {
        this.unavailable.set(true);
      } else {
        this.loadError.set(this.api.failureText(failure));
      }
    }
  }

  // ── The boxes ──────────────────────────────────────────────────────────────

  protected valueOf(key: TranslationKeyRow, code: string): string {
    return cellValue(this.edits(), key, code);
  }

  protected isChanged(key: TranslationKeyRow, code: string): boolean {
    const cells = this.edits()[key.name];
    return cells !== undefined && Object.hasOwn(cells, code);
  }

  protected isRefused(key: TranslationKeyRow, code: string): boolean {
    const refusal = this.refusal();
    return refusal !== null && refusal.key === key.name && (refusal.language === code || refusal.language === null);
  }

  protected setValue(key: TranslationKeyRow, code: string, value: string): void {
    // While a save or an import is on its way the grid is about to change: what is typed then is held
    // whatever it says, and measured against the answer.
    const onItsWay = this.saving() || this.importing() !== null;
    this.edits.update((edits) => withEdit(edits, key, code, value, onItsWay));
    this.saved.set(null);
    // The refusal was about what stood here: changing it is the answer to it.
    const refusal = this.refusal();
    if (refusal && refusal.key === key.name && (refusal.language === code || refusal.language === null)) {
      this.refusal.set(null);
    }
    // Typing after a save that failed starts the next try: the bar says what stands now.
    this.saveFailure.set(null);
  }

  /** "Required" for English - every other language falls back to it - and what an empty box means for the others. */
  protected placeholderFor(language: AdminLanguage): string {
    return language.code === FALLBACK_LANGUAGE ? 'Required' : 'Falls back to English';
  }

  /** The numbers a plural's form is for in a column's language. */
  protected numbers(language: AdminLanguage, form: PluralForm): string {
    return pluralNumbers(language.code, form, language.name);
  }

  /** A plural family as the site would say it for 1, 3 and 12 - from the boxes as they stand. */
  protected samples(block: KeyBlock, code: string): string[] {
    const edits = this.edits();
    return pluralSamples(code, (form) => {
      const key = block.rows.find((row) => row.form === form)?.key;
      return key ? cellValue(edits, key, code).trim() || cellValue(edits, key, FALLBACK_LANGUAGE).trim() : '';
    });
  }

  /** A group's block: its title and what it is, when the site says. */
  protected about(block: KeyBlock): { title: string; text?: string } | null {
    const about = block.group?.about;
    return about && Object.hasOwn(about, block.name) ? about[block.name] : null;
  }

  protected rowId(name: string): string {
    return `${this.id}-key-${name}`;
  }

  protected refusalId(name: string): string {
    return `${this.rowId(name)}-refusal`;
  }

  /** Every box back to what the site has. */
  protected async discard(): Promise<void> {
    const changed = this.changed();
    const sure = await this.questions.ask({
      title: changed === 1 ? 'Discard the change?' : `Discard ${changed} changes?`,
      message: `${changed === 1 ? 'The box goes' : 'The boxes go'} back to what ${this.siteName} has now.`,
      confirmLabel: 'Discard',
      tone: 'danger',
    });
    if (sure) {
      this.edits.set({});
      this.refusal.set(null);
      this.saveFailure.set(null);
      this.saved.set(null);
    }
  }

  protected showEverything(): void {
    this.search.set('');
    this.missingIn.set('');
  }

  // ── Saving ─────────────────────────────────────────────────────────────────

  protected async save(): Promise<void> {
    const sent = this.edits();
    const count = editCount(sent);
    if (!count || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.notice.set(null);
    this.saveFailure.set(null);
    this.saved.set(null);
    try {
      const grid = await this.api.save(sent);
      this.refusal.set(null);
      this.take(grid, sent);
      this.saved.set(count === 1 ? 'The string is saved.' : `${count} strings are saved.`);
      void this.i18n.reload();
    } catch (error) {
      // A box typed back to what is stored while the save was out was held for the answer; none came.
      this.settleEdits();
      await this.refused(readFailure(error));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Nothing was saved - and the bar Save is in says so. When the server names
   * a key of the grid, its sentence goes beside that key as well, and the key
   * is brought into view (out of the search or the filter that hides it); the
   * box gets the focus. A refusal because a language or a key is gone - deleted
   * while its boxes were filled in here - cannot be answered by changing a box:
   * the page reads the grid again, lets go of what was typed for what is gone,
   * keeps the rest, and says so.
   */
  private async refused(failure: TranslationsFailure): Promise<void> {
    const message = this.api.failureText(failure);
    const key = failureDetail(failure, 'key');
    const language = failureDetail(failure, 'language');

    if (failure.code === 'unknown_language' || failure.code === 'unknown_key') {
      let fresh: TranslationGrid | null = null;
      try {
        fresh = await this.api.grid();
      } catch {
        // Not read again: the refusal is shown as any other, below.
        this.settleEdits();
      }
      if (fresh) {
        this.take(fresh);
        const gone = failure.code === 'unknown_language' ? language === null || !fresh.languages.some((other) => other.code === language) : key === null || !fresh.keys.some((row) => row.name === key);
        if (gone) {
          this.refusal.set(null);
          this.saveFailure.set(`${message}${/[.!?]$/.test(message) ? '' : '.'} What was typed for it could not be kept.${this.changed() ? ' Save again for the rest.' : ''}`);
          return;
        }
      }
    }

    if (key === null || !this.grid()?.keys.some((row) => row.name === key)) {
      this.refusal.set(null);
      this.saveFailure.set(message);
      return;
    }
    this.refusal.set({ message, key, language });
    if (!this.visible().some((block) => block.rows.some((row) => row.key.name === key))) {
      this.showEverything();
    }
    afterNextRender(
      () => {
        const row = this.document.getElementById(this.rowId(key));
        row?.scrollIntoView?.({ block: 'center' });
        row?.querySelector<HTMLTextAreaElement>('textarea[aria-invalid="true"]')?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  // ── A language as a file ───────────────────────────────────────────────────

  /** The language's own strings as the server's file, saved by the browser. */
  protected async exportLanguage(language: AdminLanguage): Promise<void> {
    this.exporting.set(language.code);
    this.happened.set(null);
    this.notice.set(null);
    try {
      const file = await this.api.exportFile(language.code);
      saveFile(this.document, file.name, file.text);
      const unsaved = Object.values(this.edits()).some((cells) => Object.hasOwn(cells, language.code));
      this.happened.set(
        `${file.count === 1 ? '1 string' : `${file.count} strings`} of ${language.name} ${file.count === 1 ? 'is' : 'are'} downloaded as ${file.name}.${unsaved ? ' What you have not saved yet is not in the file.' : ''}`,
      );
    } catch (error) {
      this.notice.set({ heading: `${language.name} was not exported`, message: this.api.failureText(readFailure(error)) });
    } finally {
      this.exporting.set(null);
    }
  }

  /** A file of strings into a language: checked by the server like a save, all of it or none. */
  protected async importLanguage(language: AdminLanguage, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const heading = `"${file.name}" was not imported`;
    const tooLarge = file.size > this.importMax;
    const text = tooLarge ? '' : await file.text().catch(() => '');
    // Emptied once the file is read, so choosing the same file again is a change again.
    input.value = '';
    this.notice.set(null);
    this.happened.set(null);
    if (tooLarge) {
      this.notice.set({ heading, message: `The file is larger than ${formatBytes(this.importMax)} - more than every string of a language takes.` });
      return;
    }
    const values = stringsFromFile(text);
    if (values === null) {
      this.notice.set({ heading, message: 'It is not a language’s strings: the file must hold one JSON object of "key": "text", as an export does.' });
      return;
    }
    // A value with nothing in it to see is passed over by the server, as an empty one is.
    const count = Object.values(values).filter((value) => !blankText(value)).length;
    if (count === 0) {
      this.notice.set({ heading, message: 'It holds no string: every value in it is empty.' });
      return;
    }
    const sure = await this.questions.ask({
      title: `Import ${count === 1 ? '1 string' : `${count} strings`} into ${language.name}?`,
      message: `Each string in the file replaces the one ${this.siteName} has for its key. Keys the file leaves out, or leaves empty, stay as they are.`,
      confirmLabel: 'Import',
    });
    if (!sure) {
      return;
    }

    this.importing.set(language.code);
    try {
      this.take(await this.api.importStrings(language.code, values));
      // A fresh grid: what an earlier save was refused over, or failed on, no longer stands here.
      this.refusal.set(null);
      this.saveFailure.set(null);
      this.saved.set(null);
      this.happened.set(`The strings of ${language.name} are imported.`);
      void this.i18n.reload();
    } catch (error) {
      this.settleEdits();
      this.notice.set({ heading, message: this.api.failureText(readFailure(error)) });
    } finally {
      this.importing.set(null);
    }
  }

  /** A fresh grid: what is typed and still differs from it stays typed. */
  private take(grid: TranslationGrid, sent: TranslationChanges = {}): void {
    this.grid.set(grid);
    this.edits.update((edits) => remainingEdits(edits, grid, sent));
    if (!grid.languages.some((language) => language.code === this.missingIn())) {
      this.missingIn.set('');
    }
  }

  /** The edits measured against the grid the page has: a box held while a request was out, and saying what is stored, is let go. */
  private settleEdits(): void {
    const grid = this.grid();
    if (grid) {
      this.edits.update((edits) => remainingEdits(edits, grid));
    }
  }
}

/** 1048576 -> "1 MB". */
function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB` : `${Math.round(bytes / 1024)} kB`;
}
