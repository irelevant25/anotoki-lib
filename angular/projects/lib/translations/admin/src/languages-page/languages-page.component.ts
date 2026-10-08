import { ChangeDetectionStrategy, Component, DOCUMENT, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminLanguage, FALLBACK_LANGUAGE, HoldsUnsavedChanges, LanguageChanges, TranslationService } from '@anotoki/lib/translations';
import { AlertComponent, AnotokiIcons, BadgeComponent, ButtonComponent, CardComponent, ErrorStateComponent, IconComponent, PageHeaderComponent, SpinnerComponent } from '@anotoki/lib/ui';
import { SwitchComponent, TextFieldComponent } from '@anotoki/lib/ui/forms';
import { TranslationsAdminApi, readFailure } from '../admin-api';
import { registerPageIcons } from '../icons';
import { LanguageDraft, LocalizationDrafts } from '../localization-drafts.service';
import { QuestionComponent } from '../question/question.component';
import { Questions } from '../questions';
import { saveFile } from '../save-file';
import { inLanguageOrder } from '../translation-grid';

/** A language code as the database keeps it - the server's rule (LanguageCode::ok). */
const LANGUAGE_CODE = /^[a-z]{2}(-[a-z]{2})?$/;
/** A place in the order: a whole number from 0 to 1000, as the server takes it. */
const SORT_ORDER = /^\d{1,4}$/;
const SORT_ORDER_MAX = 1000;

/** The server's word for "the tables are not there yet". */
const UNAVAILABLE = 'translations_unavailable';

/** A row's fields as they are saved: what a draft is measured against. */
function savedDraft(language: AdminLanguage): LanguageDraft {
  return { name: language.name, native_name: language.native_name, sort_order: String(language.sort_order) };
}

function sameDraft(a: LanguageDraft, b: LanguageDraft): boolean {
  return a.name === b.name && a.native_name === b.native_name && a.sort_order === b.sort_order;
}

function strings(count: number): string {
  return count === 1 ? '1 string' : `${count} strings`;
}

let nextId = 0;

/**
 * The admin Languages page (English): the languages the site can be read in -
 * their names, their order in the switcher, whether readers are offered them.
 *
 * English is what every other language falls back to: it is never hidden and
 * never deleted. A language the site is released in (its migrations write its
 * strings: "Released with the site") can be hidden but not deleted; any other
 * can be deleted with its strings - the page offers to export them first, then
 * asks, naming how many go (and what the site's own fields say: the IAM's
 * accounts that go back to English). The page only hides what the server
 * refuses anyway, and shows the server's sentence when it does refuse.
 *
 * Each row's names and place are saved with its own Save (Undo puts them back);
 * the switch saves the moment it is flipped, and goes back when the server
 * refuses. A new language starts hidden unless the person adding it says
 * otherwise: with no string of its own it would read in English throughout,
 * under its own name. What is typed in a row is held in LocalizationDrafts,
 * so it outlives the page.
 *
 * For whoever the site allows (`admin.allows.languages`); anybody else is told
 * whose page it is, and nothing is asked of the server.
 */
@Component({
  selector: 'anotoki-languages-page',
  imports: [
    RouterLink,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    ErrorStateComponent,
    IconComponent,
    PageHeaderComponent,
    QuestionComponent,
    SpinnerComponent,
    SwitchComponent,
    TextFieldComponent,
  ],
  templateUrl: './languages-page.component.html',
  styleUrl: './languages-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-languages-page', lang: 'en' },
})
export class LanguagesPageComponent implements HoldsUnsavedChanges {
  private readonly api = inject(TranslationsAdminApi);
  private readonly i18n = inject(TranslationService);
  private readonly store = inject(LocalizationDrafts);
  private readonly document = inject(DOCUMENT);

  private readonly admin = this.api.settings.admin;
  protected readonly id = `anotoki-languages-${++nextId}`;
  protected readonly fallback = FALLBACK_LANGUAGE;
  protected readonly siteName = this.admin.siteName || 'the site';
  protected readonly lead =
    this.admin.leads?.languages || `The languages ${this.siteName} can be read in. A new one reads in English until its strings are written, key by key. This page stays English.`;
  protected readonly migrationsRoute = this.admin.routes?.migrations ?? null;
  protected readonly questions = new Questions();

  /** The site lets this person change its languages. */
  protected readonly allowed = computed(() => this.admin.allows?.languages?.() ?? false);
  /** The Translations page, where the site has one for this person. */
  protected readonly translationsRoute = computed(() => (this.admin.routes?.translations && (this.admin.allows?.strings?.() ?? false) ? this.admin.routes.translations : null));

  private readonly list = signal<AdminLanguage[] | null>(null);
  /** The rows whose fields do not say what is saved, by code. Kept outside the page. */
  private readonly drafts = this.store.languages;
  /** What the server said when it refused a row's change, by code - its own sentence. */
  private readonly errors = signal<Record<string, string>>({});

  protected readonly loadError = signal<string | null>(null);
  protected readonly unavailable = signal(false);
  /** The language whose names and order are being saved, whose switch is, and the one being deleted. */
  protected readonly saving = signal<string | null>(null);
  protected readonly switching = signal<string | null>(null);
  protected readonly deleting = signal<string | null>(null);
  /** What the last action did, read out. */
  protected readonly happened = signal<string | null>(null);

  protected readonly newCode = signal('');
  protected readonly newName = signal('');
  protected readonly newNativeName = signal('');
  /** Offered to readers the moment it is added - off unless the person says so: a new language has no strings yet. */
  protected readonly newOffered = signal(false);
  protected readonly adding = signal(false);
  protected readonly addError = signal<string | null>(null);

  protected readonly loaded = computed(() => this.list() !== null);
  protected readonly languages = computed(() => this.list() ?? []);
  protected readonly offered = computed(() => this.languages().filter((language) => language.enabled).length);
  protected readonly unsaved = computed(() => Object.keys(this.drafts()).length);
  protected readonly canAdd = computed(() => this.newCode().trim() !== '' && this.newName().trim() !== '' && this.newNativeName().trim() !== '');
  /** Said under the code as it is typed - the server's rule. */
  protected readonly newCodeError = computed(() => {
    const code = this.newCode().trim().toLowerCase();
    return code === '' || LANGUAGE_CODE.test(code) ? null : 'A language’s code is two small letters, or two and two with a dash between: "cs", "pt-br".';
  });

  private started = false;

  constructor() {
    registerPageIcons(inject(AnotokiIcons));
    effect(() => {
      if (this.allowed() && !this.started) {
        this.started = true;
        untracked(() => {
          this.store.settle();
          void this.load();
        });
      }
    });
  }

  /** Leaving with a row changed and not saved asks first - and "Leave" gives the changes up. */
  canLeave(): boolean | Promise<boolean> {
    const unsaved = this.unsaved();
    if (!unsaved || !this.allowed()) {
      return true;
    }
    return this.questions
      .ask({
        title: 'Leave without saving?',
        message: `${unsaved === 1 ? '1 language has' : `${unsaved} languages have`} changes that are not saved yet, and leaving loses them.`,
        confirmLabel: 'Leave',
        cancelLabel: 'Stay here',
        tone: 'danger',
      })
      .then((leave) => {
        if (leave) {
          this.drafts.set({});
        }
        return leave;
      });
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    this.unavailable.set(false);
    try {
      const languages = inLanguageOrder(await this.api.languages());
      this.list.set(languages);
      // Drafts kept from before: not for a language that is gone, and not one that says what is saved now.
      this.drafts.update((drafts) =>
        Object.fromEntries(
          Object.entries(drafts).filter(([code, draft]) => {
            const language = languages.find((other) => other.code === code);
            return language !== undefined && !sameDraft(draft, savedDraft(language));
          }),
        ),
      );
    } catch (error) {
      const failure = readFailure(error);
      if (failure.code === UNAVAILABLE) {
        this.unavailable.set(true);
      } else {
        this.loadError.set(this.api.failureText(failure));
      }
    }
  }

  // ── A row ──────────────────────────────────────────────────────────────────

  /** What a row's fields show: what is typed, or what is saved. */
  protected draft(language: AdminLanguage): LanguageDraft {
    const drafts = this.drafts();
    return Object.hasOwn(drafts, language.code) ? drafts[language.code] : savedDraft(language);
  }

  protected isChanged(language: AdminLanguage): boolean {
    return Object.hasOwn(this.drafts(), language.code);
  }

  protected errorOf(language: AdminLanguage): string | null {
    const errors = this.errors();
    return Object.hasOwn(errors, language.code) ? errors[language.code] : null;
  }

  /** The site's own fields of the language, in its words (the IAM: how many accounts have it). */
  protected noteOf(language: AdminLanguage): string | null {
    return this.admin.languageNotes?.row?.(language) ?? null;
  }

  /** Under a row's switch: what offered and hidden mean for this language. */
  protected offeredHint(language: AdminLanguage): string {
    if (language.code === FALLBACK_LANGUAGE) {
      return 'Always offered: every other language falls back to it.';
    }
    return language.enabled ? 'Readers can choose it.' : 'Nobody is offered it. Its strings stay, and a reader who had it reads another language until it is offered again.';
  }

  protected edit(language: AdminLanguage, change: Partial<LanguageDraft>): void {
    this.keep(language, { ...this.draft(language), ...change });
  }

  protected undo(language: AdminLanguage): void {
    this.forget(language.code);
    this.setError(language.code, null);
  }

  /**
   * The names and the place in the order - what changed of them, in one
   * request. The row's fields stay open meanwhile: what is typed before the
   * answer comes is a change to what the answer saved, not lost to it.
   */
  protected async save(language: AdminLanguage): Promise<void> {
    if (this.saving() !== null) {
      return;
    }
    const draft = this.draft(language);
    const changes: LanguageChanges = {};
    if (draft.name !== language.name) {
      changes.name = draft.name;
    }
    if (draft.native_name !== language.native_name) {
      changes.native_name = draft.native_name;
    }
    if (draft.sort_order !== String(language.sort_order)) {
      const sortOrder = SORT_ORDER.test(draft.sort_order.trim()) ? Number(draft.sort_order.trim()) : -1;
      if (sortOrder < 0 || sortOrder > SORT_ORDER_MAX) {
        this.setError(language.code, 'The order is a whole number from 0 to 1000.');
        return;
      }
      changes.sort_order = sortOrder;
    }

    this.saving.set(language.code);
    this.setError(language.code, null);
    this.happened.set(null);
    try {
      const saved = await this.api.updateLanguage(language.code, changes);
      // The fields as they stand now: as sent - or typed in since the request left.
      const now = this.draft(language);
      this.replace(saved);
      if (sameDraft(now, draft)) {
        this.forget(language.code);
      } else {
        this.keep(saved, now);
      }
      this.happened.set(`${saved.name} is saved.`);
      void this.i18n.reload();
    } catch (error) {
      this.setError(language.code, this.api.failureText(readFailure(error)));
    } finally {
      this.saving.set(null);
    }
  }

  /** Offered or hidden, saved the moment the switch is flipped; the row goes back when the server refuses. */
  protected async setOffered(language: AdminLanguage, enabled: boolean): Promise<void> {
    if (enabled === language.enabled) {
      return;
    }
    this.switching.set(language.code);
    this.setError(language.code, null);
    this.happened.set(null);
    this.patch(language.code, { enabled });
    try {
      const saved = await this.api.updateLanguage(language.code, { enabled });
      this.patch(language.code, saved);
      this.happened.set(saved.enabled ? `${saved.name} is offered to readers now.` : `${saved.name} is hidden: readers are not offered it.`);
      void this.i18n.reload();
    } catch (error) {
      this.patch(language.code, { enabled: !enabled });
      this.setError(language.code, this.api.failureText(readFailure(error)));
    } finally {
      this.switching.set(null);
    }
  }

  /**
   * Never for a language the site is released in. Its strings go with it, so
   * a language that has some is first offered as a file - one that can be
   * imported again - and then the deletion is asked, naming how many strings go.
   */
  protected async remove(language: AdminLanguage): Promise<void> {
    const count = language.strings;
    if (count > 0) {
      const exportFirst = await this.questions.ask({
        title: `Export the ${strings(count)} of ${language.name} first?`,
        message: 'Deleting a language deletes its strings, and they cannot be brought back. An exported file can be imported again on the Translations page.',
        confirmLabel: 'Export first',
        cancelLabel: 'No, go on',
      });
      if (exportFirst && !(await this.exportStrings(language))) {
        return;
      }
    }
    const extra = this.admin.languageNotes?.beforeDelete?.(language) ?? null;
    const sure = await this.questions.ask({
      title: `Delete ${language.name} (${language.code})?`,
      message:
        (count > 0
          ? `Its ${strings(count)} ${count === 1 ? 'goes' : 'go'} with it, and none of ${count === 1 ? 'it' : 'them'} can be brought back.`
          : 'It has no strings of its own, so nothing else goes with it.') + (extra ? ` ${extra}` : ''),
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!sure) {
      return;
    }
    this.deleting.set(language.code);
    this.setError(language.code, null);
    this.happened.set(null);
    try {
      const answer = await this.api.deleteLanguage(language.code);
      this.list.update((languages) => (languages ?? []).filter((other) => other.code !== language.code));
      this.forget(language.code);
      const after = this.admin.languageNotes?.afterDelete?.(language, answer) ?? null;
      const gone = typeof answer.strings === 'number' ? answer.strings : 0;
      this.happened.set(`${gone > 0 ? `${language.name} is deleted, and its ${strings(gone)} with it.` : `${language.name} is deleted.`}${after ? ` ${after}` : ''}`);
      void this.i18n.reload();
      // The site's fields of the other languages may follow it (the IAM: English has its accounts now).
      void this.refresh();
    } catch (error) {
      this.setError(language.code, this.api.failureText(readFailure(error)));
    } finally {
      this.deleting.set(null);
    }
  }

  /** The language's strings as the server's file, saved by the browser; whether that went through. */
  private async exportStrings(language: AdminLanguage): Promise<boolean> {
    this.deleting.set(language.code);
    try {
      const file = await this.api.exportFile(language.code);
      saveFile(this.document, file.name, file.text);
      return true;
    } catch (error) {
      this.setError(language.code, `The strings could not be exported, so nothing was deleted. ${this.api.failureText(readFailure(error))}`);
      return false;
    } finally {
      this.deleting.set(null);
    }
  }

  // ── A new language ─────────────────────────────────────────────────────────

  protected async add(): Promise<void> {
    if (!this.canAdd() || this.newCodeError() !== null || this.adding()) {
      return;
    }
    this.adding.set(true);
    this.addError.set(null);
    this.happened.set(null);
    try {
      // Said every time, on or off: whether readers are offered it is this form's to decide, not a default's.
      const added = await this.api.createLanguage({
        code: this.newCode().trim().toLowerCase(),
        name: this.newName().trim(),
        native_name: this.newNativeName().trim(),
        enabled: this.newOffered(),
      });
      this.list.update((languages) => inLanguageOrder([...(languages ?? []), added]));
      this.newCode.set('');
      this.newName.set('');
      this.newNativeName.set('');
      this.newOffered.set(false);
      this.happened.set(
        added.enabled ? `${added.name} is added, and offered to readers. It reads in English until its strings are written.` : `${added.name} is added, hidden. Write its strings, then offer it.`,
      );
      void this.i18n.reload();
    } catch (error) {
      this.addError.set(this.api.failureText(readFailure(error)));
    } finally {
      this.adding.set(false);
    }
  }

  /** The languages again, quietly: after a delete, the site's fields of the others may have changed. */
  private async refresh(): Promise<void> {
    try {
      const languages = inLanguageOrder(await this.api.languages());
      this.list.set(languages);
    } catch {
      // The rows stay as they are; the next visit reads them.
    }
  }

  private replace(saved: AdminLanguage): void {
    this.list.update((languages) => inLanguageOrder((languages ?? []).map((language) => (language.code === saved.code ? saved : language))));
  }

  private patch(code: string, change: Partial<AdminLanguage>): void {
    this.list.update((languages) => (languages ?? []).map((language) => (language.code === code ? { ...language, ...change } : language)));
  }

  private forget(code: string): void {
    this.drafts.update(({ [code]: _, ...others }) => others);
  }

  /** A row's fields measured against the row as saved: a draft while they differ, none when they say the same. */
  private keep(language: AdminLanguage, draft: LanguageDraft): void {
    const same = sameDraft(draft, savedDraft(language));
    this.drafts.update(({ [language.code]: _, ...others }) => (same ? others : { ...others, [language.code]: draft }));
  }

  private setError(code: string, message: string | null): void {
    this.errors.update(({ [code]: _, ...others }) => (message === null ? others : { ...others, [code]: message }));
  }
}
