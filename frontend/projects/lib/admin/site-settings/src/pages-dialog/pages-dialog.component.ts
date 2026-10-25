import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { AdminQuestionComponent, AdminTools, Questions } from '@anotoki/lib/admin/parts';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { CheckboxComponent, SelectComponent, SelectOption, TextFieldComponent } from '@anotoki/lib/ui/forms';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { AdminPage, AdminSiteSettings, PageVisibility } from '../models';

/** Who sees a page, as the page says it. */
const VISIBILITY_NAMES: Readonly<Record<PageVisibility, string>> = { PUBLIC: 'Anybody', USER: 'Anybody signed in', EDITOR: 'Editors and administrators', ADMIN: 'Administrators only' };

/** A page as the form holds it, before anything is saved. */
interface PageDraft {
  visibility: PageVisibility;
  blocked: boolean;
  api_paths: string[];
}

const draftOf = (page: AdminPage): PageDraft => ({ visibility: page.visibility, blocked: page.blocked, api_paths: [...page.api_paths] });

/**
 * Page access in the kit's dialog - genshin's "Parts of the site": a row a page, two decisions on each - who sees it
 * (anybody, somebody signed in, editors and administrators, administrators alone) and whether it is switched off for
 * everybody but the administrators - and, folded away, the third that is seldom wanted: the API paths refused with it,
 * which turn the sign into a lock (none: the page alone, its data still answering).
 *
 * The rows' changes are saved together (Save): a page and its API paths are one decision. Adding a page and stopping
 * governing one are written at once - they are not edits of a row - and keep the rest of the form as it was.
 * The server refuses a reserved page or API path, and says which and why: that sentence is the answer shown.
 */
@Component({
  selector: 'anotoki-site-settings-pages',
  imports: [AdminQuestionComponent, AlertComponent, ButtonComponent, CheckboxComponent, DialogComponent, IconComponent, SelectComponent, TextFieldComponent],
  templateUrl: './pages-dialog.component.html',
  styleUrl: './pages-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PagesDialogComponent {
  protected readonly tools = inject(AdminTools);
  private readonly base = `${this.tools.base('site-settings')}/pages`;

  readonly data = input.required<AdminSiteSettings>();

  /** The whole as the server has it after a write, what the page says of it, and whether the dialog is done. */
  readonly saved = output<{ data: AdminSiteSettings; said: string; close: boolean }>();
  readonly closed = output<void>();

  protected readonly questions = new Questions();
  protected readonly visibilityNames = VISIBILITY_NAMES;
  protected readonly choices = computed<SelectOption[]>(() => this.data().visibilities.map((value) => ({ value, label: VISIBILITY_NAMES[value] ?? value })));

  /** The rows as the server has them: the form's starting point, and what Discard goes back to. */
  protected readonly pages = signal<AdminPage[]>([]);
  protected readonly draft = signal<Record<number, PageDraft>>({});
  /** Whose API paths are open: one row at a time, the table is long. */
  protected readonly expanded = signal<number | null>(null);
  protected readonly newApiPath = signal('');
  protected readonly adding = signal(false);
  protected readonly newPath = signal('');
  protected readonly newVisibility = signal<string>('ADMIN');

  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** The rows that differ from what is saved. */
  protected readonly changed = computed(() => this.pages().filter((page) => this.differs(page)));

  constructor() {
    queueMicrotask(() => this.adopt(this.data().pages, true));
  }

  protected of(page: AdminPage): PageDraft {
    return this.draft()[page.id] ?? draftOf(page);
  }

  protected isChanged(page: AdminPage): boolean {
    return this.differs(page);
  }

  protected setVisibility(page: AdminPage, value: string): void {
    this.write(page, { visibility: (this.data().visibilities as string[]).includes(value) ? (value as PageVisibility) : 'ADMIN' });
  }

  protected setBlocked(page: AdminPage, blocked: boolean): void {
    this.write(page, { blocked });
  }

  protected toggle(page: AdminPage): void {
    this.newApiPath.set('');
    this.expanded.set(this.expanded() === page.id ? null : page.id);
  }

  protected addApiPath(page: AdminPage): void {
    const path = this.newApiPath().trim().replace(/\/+$/, '');
    if (!path || this.of(page).api_paths.includes(path)) {
      return;
    }
    this.write(page, { api_paths: [...this.of(page).api_paths, path].sort() });
    this.newApiPath.set('');
  }

  protected removeApiPath(page: AdminPage, path: string): void {
    this.write(page, { api_paths: this.of(page).api_paths.filter((entry) => entry !== path) });
  }

  /** Back to the rows as they are saved. */
  protected discard(): void {
    this.adopt(this.pages(), true);
    this.refusal.set(null);
  }

  protected async save(): Promise<void> {
    const pages = this.changed().map((page) => ({ id: page.id, ...this.of(page) }));
    if (pages.length === 0 || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      const data = await this.tools.put<AdminSiteSettings>(this.base, { pages });
      this.saved.emit({ data, said: pages.length === 1 ? 'Page access: 1 page saved.' : `Page access: ${pages.length} pages saved.`, close: true });
    } catch (error) {
      // The server names the path it refused and why (a reserved API path, say): that sentence is the answer.
      this.refusal.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.busy.set(false);
    }
  }

  protected startAdding(): void {
    this.newPath.set('');
    this.newVisibility.set('ADMIN');
    this.adding.set(true);
  }

  protected async add(): Promise<void> {
    const path = this.newPath().trim();
    if (!path || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      const data = await this.tools.post<AdminSiteSettings>(this.base, { path, visibility: this.newVisibility(), blocked: false, api_paths: [] });
      this.adopt(data.pages, false);
      this.adding.set(false);
      this.saved.emit({ data, said: 'Page access: the page is governed now.', close: false });
    } catch (error) {
      this.refusal.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.busy.set(false);
    }
  }

  /** Stops governing a page, after a question: a page with no row is anybody's again, as every page was before. */
  protected async remove(page: AdminPage): Promise<void> {
    const yes = await this.questions.ask({
      title: `Stop governing ${page.path}?`,
      message: "The page is anybody's again, as every page was before it had a row - and the API paths it refused answer again.",
      confirmLabel: 'Stop governing',
      tone: 'danger',
    });
    if (!yes || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      const data = await this.tools.delete<AdminSiteSettings>(`${this.base}/${page.id}`);
      this.adopt(data.pages, false);
      this.saved.emit({ data, said: `Page access: ${page.path} is no longer governed.`, close: false });
    } catch (error) {
      this.refusal.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.busy.set(false);
    }
  }

  /** Takes the rows the server answered with: a row's unsaved changes stay, unless `fresh` - only new rows get their saved values. */
  private adopt(pages: AdminPage[], fresh: boolean): void {
    const kept = fresh ? {} : this.draft();
    this.pages.set(pages);
    this.draft.set(Object.fromEntries(pages.map((page) => [page.id, kept[page.id] ?? draftOf(page)])));
    this.expanded.set(null);
  }

  private write(page: AdminPage, patch: Partial<PageDraft>): void {
    this.draft.update((draft) => ({ ...draft, [page.id]: { ...this.of(page), ...patch } }));
  }

  private differs(page: AdminPage): boolean {
    const draft = this.of(page);
    return draft.visibility !== page.visibility || draft.blocked !== page.blocked || draft.api_paths.join('\n') !== [...page.api_paths].sort().join('\n');
  }
}
