import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, EnvironmentInjector, computed, effect, inject, runInInjectionContext, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ANOTOKI_PEOPLE_CONFIG, DEFAULT_PEOPLE_API, PeopleColumn, PeopleDeleteQuestion, PeopleDeleted, PeopleList, PeoplePerson, PeopleSyncRun } from '@anotoki/lib/people';
import { AlertComponent, AlertTone } from '@anotoki/lib/ui/alert';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { ErrorStateComponent } from '@anotoki/lib/ui/error-state';
import { TextFieldComponent } from '@anotoki/lib/ui/forms';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { PaginationComponent } from '@anotoki/lib/ui/pagination';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { firstValueFrom } from 'rxjs';
import { registerPageIcons } from '../icons';

/** What the page said of the last thing done on it: a delete, a check of the IAM's deleted accounts. */
interface Outcome {
  tone: AlertTone;
  text: string;
  note: string | null;
}

/** Why the list is not there: the server's sentence, and whether the database lacks the table (503). */
interface LoadProblem {
  message: string;
  unavailable: boolean;
}

// Marked pure: a site's build keeps a top-level `new` it is not told is pure, whether the page is used or not.
const DATE_FORMAT = /* @__PURE__ */ new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const DAY_FORMAT = /* @__PURE__ */ new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const COUNT_FORMAT = /* @__PURE__ */ new Intl.NumberFormat('en-GB');

/** How long typing rests before the list is searched. */
const SEARCH_PAUSE_MS = 400;

let nextId = 0;

/**
 * The administrators' People page (English, as every admin panel is): the
 * people who signed in to the site - its own `users` table, through the PHP
 * half's PeopleRoutes::admin() - the newest seen first, 50 a page.
 *
 * - A search by name (any case, anywhere in it) or IAM id, as the typing rests
 *   or at Enter; paging.
 * - Each person: the name ("you" on the reader's own row) with what can be
 *   done under it - "Open at the IAM", the account in the IAM's admin panel,
 *   for the IAM's administrators, and, where the site has its delete hook,
 *   Delete with a question in the site's words, its outcome said in the page -
 *   never off the screen, however many columns the site has; the IAM id, first
 *   and last seen (a time no person on the page has is not drawn: a site
 *   without a last-seen column), the site's own columns (counts, text, times).
 * - Accounts the IAM deleted are shown as such: muted, "Deleted at the IAM on
 *   {date}", under the IAM's placeholder name; the line about the scrub - when
 *   the IAM's deleted accounts were last checked, how many scrubbed here, or
 *   why the last check stopped - with "Check now".
 * - The site's visitors line; what the database still lacks, with a link to
 *   the Migrations page.
 *
 * A table, each row a small card of its own in a narrow page (the page answers
 * to the width it is given: a site's frame may have a side navigation). Its
 * questions in a dialog of its own - nothing in the site's root. Configured by
 * provideAnotokiPeople() (@anotoki/lib/people), or none: the defaults.
 */
@Component({
  selector: 'anotoki-people-page',
  imports: [
    RouterLink,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    DialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    PageHeaderComponent,
    PaginationComponent,
    SpinnerComponent,
    TextFieldComponent,
  ],
  templateUrl: './people-page.component.html',
  styleUrl: './people-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-people-page', lang: 'en' },
})
export class PeoplePageComponent {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(EnvironmentInjector);
  private readonly config = inject(ANOTOKI_PEOPLE_CONFIG, { optional: true }) ?? {};
  private readonly apiBase = this.config.apiBase ?? DEFAULT_PEOPLE_API;

  protected readonly id = `anotoki-people-${++nextId}`;
  protected readonly lead = this.config.lead ?? 'Everybody who has signed in here, the most recently seen first - and what the site keeps of them.';
  protected readonly migrationsRoute = this.config.migrationsRoute ?? null;
  protected readonly deleting = this.config.delete ?? null;
  protected readonly deleteLabel = this.config.delete?.label ?? 'Delete their data';

  protected readonly admin = computed(() => (this.config.isAdmin ? this.fromSite(this.config.isAdmin) : true));
  private readonly me = computed(() => (this.config.me ? this.fromSite(this.config.me) : null));

  protected readonly list = signal<PeopleList | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadProblem = signal<LoadProblem | null>(null);
  /** What is typed in the search box. */
  protected readonly query = signal('');
  /** The search the list shows. */
  protected readonly searched = signal('');
  protected readonly syncing = signal(false);
  /** The person whose data is being deleted now. */
  protected readonly removing = signal<string | null>(null);
  /** The person the delete question is open for. */
  protected readonly asking = signal<PeoplePerson | null>(null);
  protected readonly outcome = signal<Outcome | null>(null);

  /** How many people the site has - said while no search narrows the list. */
  protected readonly everybody = computed(() => {
    const list = this.list();
    return list !== null && this.searched() === '' ? { count: list.total } : null;
  });
  protected readonly people = computed(() => this.list()?.people ?? []);
  protected readonly columns = computed(() => this.list()?.columns ?? []);
  protected readonly showsFirstSeen = computed(() => this.people().some((person) => person.first_seen_at !== null));
  protected readonly showsLastSeen = computed(() => this.people().some((person) => person.last_seen_at !== null));
  protected readonly question = computed(() => {
    const person = this.asking();
    return person === null ? null : this.questionFor(person);
  });
  protected readonly visitorsLine = computed(() => {
    const visitors = this.list()?.visitors;
    if (!visitors) {
      return null;
    }
    if (this.config.visitorsLine) {
      return this.fromSite(() => this.config.visitorsLine?.(visitors) ?? null);
    }
    const count = Number(visitors.count) || 0;
    return count === 0 ? 'No visitors: nobody uses the site without signing in now.' : `${this.count(count)} ${count === 1 ? 'visitor' : 'visitors'} - people using the site without signing in.`;
  });

  private readonly tableTop = viewChild<ElementRef<HTMLElement>>('tableTop');
  private request = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  constructor() {
    registerPageIcons(inject(AnotokiIcons));

    // Read once the reader is known to be the site's ADMIN - never before, never for anybody else.
    effect(() => {
      if (this.admin() && !this.started) {
        this.started = true;
        untracked(() => void this.load(1, ''));
      }
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  /** One page of the list, for a search; an answer that a later request has overtaken is dropped. */
  protected async load(page = this.list()?.page ?? 1, search = this.searched()): Promise<void> {
    const mine = ++this.request;
    this.loading.set(true);
    try {
      const params: Record<string, string> = { page: String(page) };
      if (search !== '') {
        params['q'] = search;
      }
      const answer = await firstValueFrom(this.http.get<PeopleList>(this.apiBase, { params }));
      if (mine !== this.request) {
        return;
      }
      this.list.set(answer);
      this.searched.set(search);
      this.loadProblem.set(null);
    } catch (error) {
      if (mine !== this.request) {
        return;
      }
      this.loadProblem.set({ message: messageOf(error), unavailable: error instanceof HttpErrorResponse && error.status === 503 });
    } finally {
      if (mine === this.request) {
        this.loading.set(false);
      }
    }
  }

  protected typed(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search(), SEARCH_PAUSE_MS);
  }

  /** The list for what is typed, from its first page - at Enter, or as the typing rests. */
  protected search(event?: Event): void {
    event?.preventDefault();
    clearTimeout(this.searchTimer);
    const search = this.query().trim();
    if (search !== this.searched() || this.loadProblem() !== null) {
      void this.load(1, search);
    }
  }

  protected clearSearch(): void {
    this.query.set('');
    this.search();
  }

  protected async goTo(page: number): Promise<void> {
    await this.load(page);
    const top = this.tableTop()?.nativeElement;
    if (top && typeof top.scrollIntoView === 'function' && top.getBoundingClientRect().top < 0) {
      top.scrollIntoView({ block: 'start' });
    }
  }

  // ── the person ──────────────────────────────────────────────────────────────

  protected isMe(person: PeoplePerson): boolean {
    const me = this.me();
    return me !== null && me !== '' && String(me) === person.sub;
  }

  /** The name, or what stands for it when the site never learned one. */
  protected nameOf(person: PeoplePerson): string {
    return person.name !== null && person.name.trim() !== '' ? person.name : `the person with IAM id ${person.sub}`;
  }

  /** The name for a button's name: the person's, or their IAM id. */
  protected shortName(person: PeoplePerson): string {
    return person.name !== null && person.name.trim() !== '' ? person.name : `IAM id ${person.sub}`;
  }

  /** "Open at the IAM" with whom, and where it goes (WCAG 2.5.3: the words shown come first). */
  protected iamLabel(person: PeoplePerson): string {
    return `Open at the IAM: ${this.shortName(person)} (the IAM's admin panel, in a new tab)`;
  }

  protected date(iso: string | null): string {
    return iso === null ? '' : (this.config.formatDate ?? defaultFormatDate)(iso);
  }

  protected day(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : DAY_FORMAT.format(date);
  }

  protected count(value: unknown): string {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? COUNT_FORMAT.format(number) : '0';
  }

  /** A value of the site's columns as the page shows it; null for none. */
  protected cell(person: PeoplePerson, column: PeopleColumn): string | null {
    const value = person[column.key];
    if (column.kind === 'count') {
      // A count the site has no row for is none of it.
      return this.count(value ?? 0);
    }
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return column.kind === 'time' ? this.date(String(value)) : String(value);
  }

  protected deletable(person: PeoplePerson): boolean {
    const allowed = this.deleting?.allowed;
    return allowed ? this.fromSite(() => allowed(person)) : true;
  }

  // ── the scrub of the IAM's deleted accounts ─────────────────────────────────

  protected async checkNow(): Promise<void> {
    this.syncing.set(true);
    this.outcome.set(null);
    try {
      const answer = await firstValueFrom(this.http.post<PeopleSyncRun>(`${this.apiBase}/sync`, {}));
      this.outcome.set(this.describeRun(answer.run));
    } catch (error) {
      this.outcome.set({ tone: 'danger', text: `The check could not run. ${messageOf(error)}`, note: null });
    } finally {
      this.syncing.set(false);
    }
    // The names a check scrubbed, and where the scrub stands now.
    await this.load();
  }

  private describeRun(run: PeopleSyncRun['run']): Outcome {
    const scrubbed = run.scrubbed === 1 ? '1 person' : `${this.count(run.scrubbed)} people`;
    switch (run.state) {
      case 'done':
        return {
          tone: 'success',
          text:
            run.scrubbed > 0
              ? `Checked: ${scrubbed} scrubbed here - their names are the IAM's placeholders now.`
              : run.handled > 0
                ? 'Checked: none of the accounts the IAM deleted since the last check had anything here.'
                : 'Checked: the IAM has deleted no account since the last check.',
          note: null,
        };
      case 'more':
        return { tone: 'info', text: `Checked part of the list: ${scrubbed} scrubbed here. The rest comes with the next check.`, note: null };
      case 'stopped':
        return { tone: 'danger', text: `The check stopped at an account it could not scrub: ${run.error ?? 'no reason given'}. It is tried again with the next check.`, note: null };
      case 'unreachable':
        return { tone: 'warning', text: `The IAM could not be asked: ${run.error ?? 'no answer'}. The next check tries again.`, note: null };
      case 'busy':
        return { tone: 'info', text: 'Another check is running just now. Look again in a moment.', note: null };
      default:
        return { tone: 'warning', text: `The check cannot run yet. ${run.problems.join(' ')}`.trim(), note: null };
    }
  }

  // ── deleting a person's data ────────────────────────────────────────────────

  protected ask(person: PeoplePerson): void {
    if (this.deleting && this.removing() === null) {
      this.asking.set(person);
    }
  }

  protected cancelDelete(): void {
    this.asking.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const person = this.asking();
    if (person === null) {
      return;
    }
    this.asking.set(null);
    this.removing.set(person.sub);
    this.outcome.set(null);
    try {
      const answer = await firstValueFrom(this.http.delete<PeopleDeleted>(`${this.apiBase}/${encodeURIComponent(person.sub)}`));
      this.outcome.set({ tone: 'success', text: this.deletedText(person, answer), note: typeof answer.note === 'string' && answer.note !== '' ? answer.note : null });
      const done = this.deleting?.done;
      if (done) {
        this.fromSite(() => done(person, answer));
      }
    } catch (error) {
      this.outcome.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? { tone: 'info', text: `${capitalized(this.nameOf(person))} is not here any more: nothing was deleted.`, note: null }
          : { tone: 'danger', text: `Nothing was deleted. ${messageOf(error)}`, note: null },
      );
    } finally {
      this.removing.set(null);
    }

    await this.load();
    // A last page the delete emptied: the one before it.
    const list = this.list();
    if (list !== null && list.people.length === 0 && list.page > 1) {
      await this.load(list.page - 1);
    }
  }

  private questionFor(person: PeoplePerson): PeopleDeleteQuestion & { confirm: string } {
    const own = this.deleting?.question;
    if (own) {
      const asked = this.fromSite(() => own(person, this.columns()));
      return { ...asked, confirm: asked.confirm || 'Delete' };
    }
    const name = this.nameOf(person);
    const counts = this.columns()
      .filter((column) => column.kind === 'count')
      .map((column) => `${column.label}: ${this.cell(person, column)}`)
      .join(', ');
    return {
      title: `Delete what the site keeps of ${name}?`,
      message:
        (counts ? `It all goes (${counts}), and cannot be brought back. ` : 'Everything the site keeps of them goes, and cannot be brought back. ') +
        'Their anotoki account stays: signing in again, they start afresh here.' +
        (this.isMe(person) ? ' This is you.' : ''),
      confirm: 'Delete',
    };
  }

  private deletedText(person: PeoplePerson, answer: PeopleDeleted): string {
    const taken = Object.entries(answer.deleted ?? {})
      .map(([label, count]) => `${label}: ${this.count(count)}`)
      .join(', ');
    return `Deleted what the site kept of ${this.nameOf(person)}${taken ? ` - ${taken}` : ''}.`;
  }

  /** Runs a function the site gave in the configuration - which may inject its own services. */
  private fromSite<T>(run: () => T): T {
    return runInInjectionContext(this.injector, run);
  }
}

/** '2026-10-06T10:01:02Z' -> '6 Oct 2026, 10:01' (in the browser's time zone). */
function defaultFormatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What to tell an administrator about a request that failed: the server's sentence when it gave one. */
function messageOf(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object') {
      const said = (body as Record<string, unknown>)['message'] ?? (body as Record<string, unknown>)['error'];
      if (typeof said === 'string' && said.trim() !== '') {
        return said;
      }
    }
    if (error.status === 0) {
      return 'The server could not be reached.';
    }
    return `The server answered ${error.status}${error.statusText ? ' ' + error.statusText : ''}.`;
  }
  return error instanceof Error ? error.message : String(error);
}
