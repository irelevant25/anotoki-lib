import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { AdminQuestionComponent, AdminTools, Questions, formatCount, registerAdminIcons } from '@anotoki/lib/admin/parts';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { BadgeComponent, BadgeTone } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { ErrorStateComponent } from '@anotoki/lib/ui/error-state';
import { SelectComponent, SelectOption, TextFieldComponent } from '@anotoki/lib/ui/forms';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { PaginationComponent } from '@anotoki/lib/ui/pagination';
import { SegmentedComponent, SegmentedOption } from '@anotoki/lib/ui/segmented';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { FeedbackFacets, FeedbackList, FeedbackMessage, FeedbackStatus } from '../models';

/** The server's word for "the table is not there yet". */
const UNAVAILABLE = 'feature_unavailable';
const STATUSES: FeedbackStatus[] = ['new', 'read', 'resolved', 'spam'];
const STATUS_TONES: Record<FeedbackStatus, BadgeTone> = { new: 'primary', read: 'neutral', resolved: 'success', spam: 'warning' };
/** How much of a message a row shows before it is opened. */
const EXCERPT = 180;

interface Filter {
  status: string;
  kind: string;
  section: string;
  search: string;
}

const NO_FILTER: Filter = { status: '', kind: '', section: '', search: '' };

/** A word of the site's (a kind, a field's name) as a heading says it: bug_report -> Bug report. */
function wordOf(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

/**
 * A mail link to the address a visitor gave - the address and nothing more:
 * every character a mailto: link would read as its own (? & = % # - "?bcc="
 * would add a recipient) is percent-encoded, the @ left as it is. The server
 * refuses such addresses now; a message kept before is shown safely all the
 * same.
 */
function mailLink(address: string): string {
  return 'mailto:' + encodeURIComponent(address).replace(/%40/g, '@');
}

let nextId = 0;

/**
 * The administrators' feedback (English): what visitors sent through the
 * site's feedback form (@anotoki/lib/feedback), newest first, 25 a page -
 * from the library's table (Anotoki\Lib\Feedback) through its routes. The
 * words are the sender's: nothing here edits them; a message's status moves
 * (new, read, resolved, spam) and a message can be deleted.
 *
 * Narrowed by status (with how many each has), kind, the site's sections and
 * a search. Opening a message shows it whole - its subject, its words, the
 * site's extra fields, who sent it (a signed-in person's name, the address
 * they gave, or nobody), the page, the language and the browser - and marks a
 * new one read; its status is set there (saved at once), and it is deleted
 * after a question. The unread count (FeedbackUnread, the admin navigation's
 * badge) follows.
 *
 * Spam is deleted by itself after 30 days, a resolved message after a year
 * (the PHP half's prune).
 *
 * For the site's ADMIN alone (`isAdmin`); anybody else is told whose page it
 * is, and nothing is asked of the server. While the table waits for a
 * database update, the page says so and links to the site's Migrations page.
 */
@Component({
  selector: 'anotoki-feedback-page',
  imports: [
    RouterLink,
    AdminQuestionComponent,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    DialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    PageHeaderComponent,
    PaginationComponent,
    SegmentedComponent,
    SelectComponent,
    SpinnerComponent,
    TextFieldComponent,
  ],
  templateUrl: './feedback-page.component.html',
  styleUrl: './feedback-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-feedback-page', lang: 'en' },
})
export class FeedbackPageComponent {
  protected readonly tools = inject(AdminTools);
  private readonly unread = inject(FeedbackUnread);
  private readonly base = this.tools.base('feedback');

  protected readonly id = `anotoki-feedback-${++nextId}`;
  protected readonly statusTones = STATUS_TONES;
  protected readonly statuses = STATUSES;
  protected readonly formatCount = formatCount;
  protected readonly wordOf = wordOf;
  protected readonly mailLink = mailLink;
  protected readonly questions = new Questions();
  /** The statuses a message can be marked with, as the control in its dialog names them. */
  protected readonly markOptions: SegmentedOption[] = STATUSES.map((status) => ({ value: status, label: wordOf(status) }));

  protected readonly filter = signal<Filter>(NO_FILTER);
  protected readonly searchText = signal('');
  protected readonly page = signal(1);

  protected readonly list = signal<FeedbackList | null>(null);
  protected readonly facets = signal<FeedbackFacets | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly unavailable = signal(false);
  /** What the last action did, read out. */
  protected readonly happened = signal('');

  /** The open message, and how its status and its deletion are going. */
  protected readonly viewing = signal<FeedbackMessage | null>(null);
  protected readonly viewLoading = signal(false);
  protected readonly viewError = signal<string | null>(null);
  protected readonly savingStatus = signal(false);
  protected readonly deleting = signal(false);

  protected readonly filtered = computed(() => {
    const filter = this.filter();
    return filter.status !== '' || filter.kind !== '' || filter.section !== '' || filter.search !== '';
  });

  protected readonly statusOptions = computed<SegmentedOption[]>(() => {
    const counts = this.facets()?.byStatus ?? {};
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return [{ value: '', label: `All ${formatCount(total)}` }, ...STATUSES.map((status) => ({ value: status, label: `${wordOf(status)} ${formatCount(counts[status] ?? 0)}` }))];
  });

  protected readonly kindOptions = computed<SelectOption[]>(() => {
    const facets = this.facets();
    return (facets?.kinds ?? []).map((kind) => ({ value: kind, label: `${wordOf(kind)} (${formatCount(facets?.byKind[kind] ?? 0)})` }));
  });

  protected readonly sectionOptions = computed<SelectOption[]>(() => (this.facets()?.sections ?? []).map((section) => ({ value: section, label: section })));
  protected readonly newCount = computed(() => this.facets()?.byStatus['new'] ?? 0);
  protected readonly items = computed(() => this.list()?.items ?? []);

  /** The open message's extra fields, each named as the site names it. */
  protected readonly viewingFields = computed(() => {
    const message = this.viewing();
    const names = this.tools.config?.feedbackFields ?? {};
    return Object.entries(message?.details ?? {})
      .filter(([, value]) => typeof value === 'string' && value.trim() !== '')
      .map(([name, value]) => ({ name, label: names[name] || wordOf(name), value }));
  });

  private asked = 0;
  private started = false;

  constructor() {
    registerAdminIcons(inject(AnotokiIcons));
    effect(() => {
      if (this.tools.isAdmin() && !this.started) {
        this.started = true;
        untracked(() => void this.load());
      }
    });
  }

  /** The list and the counts, with the filters as they are. */
  protected async load(filter: Filter = this.filter(), page = this.page()): Promise<void> {
    const mine = ++this.asked;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [list, facets] = await Promise.all([
        this.tools.get<FeedbackList>(this.base, { status: filter.status, kind: filter.kind, section: filter.section, search: filter.search, page: page > 1 ? page : null }),
        this.tools.get<FeedbackFacets>(`${this.base}/facets`),
      ]);
      if (mine !== this.asked) {
        return;
      }
      this.filter.set(filter);
      this.page.set(list.page || page);
      this.list.set(list);
      this.facets.set(facets);
      this.unavailable.set(false);
      this.unread.set(facets.byStatus['new'] ?? 0);
    } catch (error) {
      if (mine === this.asked) {
        const failure = this.tools.failure(error);
        this.unavailable.set(failure.code === UNAVAILABLE);
        this.loadError.set(failure.code === UNAVAILABLE ? null : this.tools.say(failure));
        this.list.set(null);
      }
    } finally {
      if (mine === this.asked) {
        this.loading.set(false);
      }
    }
  }

  protected setStatusFilter(status: string): void {
    void this.load({ ...this.filter(), status }, 1);
  }

  protected setKind(kind: string): void {
    void this.load({ ...this.filter(), kind }, 1);
  }

  protected setSection(section: string): void {
    void this.load({ ...this.filter(), section }, 1);
  }

  protected applySearch(): void {
    const search = this.searchText().trim();
    if (search !== this.filter().search) {
      void this.load({ ...this.filter(), search }, 1);
    }
  }

  protected reset(): void {
    this.searchText.set('');
    void this.load(NO_FILTER, 1);
  }

  protected setPage(page: number): void {
    void this.load(this.filter(), page);
  }

  // ── One message ────────────────────────────────────────────────────────────

  /** Opens a message - asking the server for it, which marks a new one read. */
  protected async view(message: FeedbackMessage): Promise<void> {
    this.viewing.set(message);
    this.viewError.set(null);
    this.viewLoading.set(true);
    try {
      const answer = await this.tools.get<{ message: FeedbackMessage }>(`${this.base}/${message.id}`);
      if (this.viewing()?.id === message.id) {
        this.viewing.set(answer.message);
      }
      this.replace(answer.message);
      if (message.status === 'new') {
        this.countChanged(message.status, answer.message.status);
      }
    } catch (error) {
      if (this.viewing()?.id === message.id) {
        this.viewError.set(this.tools.say(this.tools.failure(error)));
      }
    } finally {
      this.viewLoading.set(false);
    }
  }

  protected closeView(): void {
    if (!this.deleting()) {
      this.viewing.set(null);
    }
  }

  /** A status chosen: saved at once; on a refusal the control shows what is true again. */
  protected async setStatus(status: string): Promise<void> {
    const message = this.viewing();
    if (!message || message.status === status || this.savingStatus()) {
      return;
    }
    this.savingStatus.set(true);
    this.viewError.set(null);
    try {
      const answer = await this.tools.put<{ message: FeedbackMessage }>(`${this.base}/${message.id}/status`, { status });
      this.viewing.set(answer.message);
      this.replace(answer.message);
      this.countChanged(message.status, answer.message.status);
      this.happened.set(`"${this.titleOf(answer.message)}" is ${answer.message.status} now.`);
    } catch (error) {
      this.viewError.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.savingStatus.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const message = this.viewing();
    if (!message) {
      return;
    }
    const yes = await this.questions.ask({
      title: 'Delete this message?',
      message: `"${this.titleOf(message)}" goes for good - there is no undo. Marking it spam or resolved keeps it for a while instead.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!yes) {
      return;
    }
    this.deleting.set(true);
    this.viewError.set(null);
    try {
      await this.tools.delete(`${this.base}/${message.id}`);
      this.deleting.set(false);
      this.viewing.set(null);
      this.happened.set(`"${this.titleOf(message)}" is deleted.`);
      await this.load();
    } catch (error) {
      this.viewError.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.deleting.set(false);
    }
  }

  // ── How a message is said ──────────────────────────────────────────────────

  /** Its subject, or the start of its words. */
  protected titleOf(message: FeedbackMessage): string {
    if (message.subject) {
      return message.subject;
    }
    const first = message.message.split('\n')[0].trim();
    return first.length > 70 ? `${first.slice(0, 69)}…` : first || `A message (${message.kind})`;
  }

  protected excerptOf(message: FeedbackMessage): string {
    const words = message.message.replace(/\s+/g, ' ').trim();
    return words.length > EXCERPT ? `${words.slice(0, EXCERPT - 1)}…` : words;
  }

  /** Who sent it, as a person reads it. */
  protected senderOf(message: FeedbackMessage): string {
    if (message.user_name) {
      return message.user_name;
    }
    if (message.user_id !== null) {
      return `Person ${message.user_id}`;
    }
    return message.contact_email ?? 'Anonymous';
  }

  /** The list's row and the counts follow a message that changed. */
  private replace(message: FeedbackMessage): void {
    this.list.update((list) => (list ? { ...list, items: list.items.map((item) => (item.id === message.id ? message : item)) } : list));
  }

  private countChanged(from: FeedbackStatus, to: FeedbackStatus): void {
    if (from === to) {
      return;
    }
    this.facets.update((facets) => {
      if (!facets) {
        return facets;
      }
      const byStatus = { ...facets.byStatus, [from]: Math.max(0, (facets.byStatus[from] ?? 0) - 1), [to]: (facets.byStatus[to] ?? 0) + 1 };
      return { ...facets, byStatus };
    });
    this.unread.set(this.facets()?.byStatus['new'] ?? 0);
  }
}
