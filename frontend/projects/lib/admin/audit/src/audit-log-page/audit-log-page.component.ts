import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminTools, formatCount, registerAdminIcons } from '@anotoki/lib/admin/parts';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CopyButtonComponent } from '@anotoki/lib/ui/copy';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { ErrorStateComponent } from '@anotoki/lib/ui/error-state';
import { SelectComponent, SelectOption, TextFieldComponent } from '@anotoki/lib/ui/forms';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { PaginationComponent } from '@anotoki/lib/ui/pagination';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { pretty, readDetails, summary } from '../details';
import { AUDIT_FILTERS, AuditEntry, AuditFacets, AuditFilter, AuditFilterName, AuditPage } from '../models';

/** The server's word for "the table is not there yet". */
const UNAVAILABLE = 'feature_unavailable';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

let nextId = 0;

/**
 * The administrators' audit log (English): who did what to what, newest first,
 * fifty a page - read from the library's table (Anotoki\Lib\Audit) through its
 * routes. Read only: nothing here changes an entry.
 *
 * Narrowed by who acted, the action (or its family: `account.` finds every
 * account.*), what it was about, what that belongs to (genshin's "everything
 * on characters 42"), and a range of days - each filter a part of the page's
 * address, so a link can carry it (`/admin/audit?target_type=user&target_id=42`)
 * and Back goes back. A row opens to its details: what a change did, field by
 * field, before and after, where the details say one; every other part as it
 * was recorded; the whole as JSON.
 *
 * For the site's ADMIN alone (`isAdmin`); anybody else is told whose page it
 * is, and nothing is asked of the server. While the table waits for a
 * database update, the page says so and links to the site's Migrations page.
 */
@Component({
  selector: 'anotoki-audit-log-page',
  imports: [
    RouterLink,
    AlertComponent,
    ButtonComponent,
    CopyButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    PageHeaderComponent,
    PaginationComponent,
    SelectComponent,
    SpinnerComponent,
    TextFieldComponent,
  ],
  templateUrl: './audit-log-page.component.html',
  styleUrl: './audit-log-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-audit-log-page', lang: 'en' },
})
export class AuditLogPageComponent {
  protected readonly tools = inject(AdminTools);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly base = this.tools.base('audit');

  protected readonly id = `anotoki-audit-log-${++nextId}`;
  protected readonly formatCount = formatCount;
  protected readonly summary = summary;
  protected readonly pretty = pretty;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  /** The filters, as the page's address says them. */
  protected readonly filter = computed<AuditFilter>(() => {
    const params = this.params();
    return Object.fromEntries(AUDIT_FILTERS.map((name) => [name, (params.get(name) ?? '').trim()])) as AuditFilter;
  });
  protected readonly pageNumber = computed(() => {
    const page = Number(this.params().get('page'));
    return Number.isInteger(page) && page > 1 ? page : 1;
  });
  protected readonly filtered = computed(() => AUDIT_FILTERS.some((name) => this.filter()[name] !== ''));

  /** What is typed in the text filters, applied on Enter or as the focus leaves. */
  protected readonly targetIdText = signal('');

  protected readonly result = signal<AuditPage | null>(null);
  protected readonly facets = signal<AuditFacets | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly unavailable = signal(false);
  /** The open row, by id. */
  protected readonly open = signal<number | null>(null);

  protected readonly actorOptions = computed<SelectOption[]>(() => {
    const options = (this.facets()?.actors ?? []).map((actor) => ({ value: String(actor.id), label: actor.username ? `${actor.username} (${actor.id})` : `Person ${actor.id}` }));
    return withChosen(options, this.filter().actor);
  });

  /** Every action, each family of more than one first with its own choice: `account.*`. */
  protected readonly actionOptions = computed<SelectOption[]>(() => {
    const actions = [...(this.facets()?.actions ?? [])].sort();
    const families = new Map<string, number>();
    for (const action of actions) {
      const family = action.split('.')[0];
      families.set(family, (families.get(family) ?? 0) + 1);
    }
    const options: SelectOption[] = [];
    let last = '';
    for (const action of actions) {
      const family = action.split('.')[0];
      if (family !== last && (families.get(family) ?? 0) > 1) {
        options.push({ value: `${family}.`, label: `${family}.* (every one)` });
      }
      last = family;
      options.push({ value: action, label: action });
    }
    return withChosen(options, this.filter().action);
  });

  protected readonly targetOptions = computed<SelectOption[]>(() =>
    withChosen(
      (this.facets()?.target_types ?? []).map((type) => ({ value: type, label: type })),
      this.filter().target_type,
    ),
  );

  protected readonly entries = computed(() => this.result()?.items ?? []);

  private asked = 0;
  private facetsAsked = false;

  constructor() {
    registerAdminIcons(inject(AnotokiIcons));
    // The address is the filters: every change of it reads the page again - for the site's ADMIN alone.
    effect(() => {
      const filter = this.filter();
      const page = this.pageNumber();
      if (!this.tools.isAdmin()) {
        return;
      }
      untracked(() => {
        this.targetIdText.set(filter.target_id);
        void this.load(filter, page);
        if (!this.facetsAsked) {
          this.facetsAsked = true;
          void this.loadFacets();
        }
      });
    });
  }

  protected reload(): void {
    void this.load(this.filter(), this.pageNumber());
    if (this.facets() === null) {
      void this.loadFacets();
    }
  }

  private async load(filter: AuditFilter, page: number): Promise<void> {
    const mine = ++this.asked;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const result = await this.tools.get<AuditPage>(this.base, { ...filter, page: page > 1 ? page : null });
      if (mine === this.asked) {
        this.result.set(result);
        this.unavailable.set(false);
        this.open.set(null);
      }
    } catch (error) {
      if (mine === this.asked) {
        const failure = this.tools.failure(error);
        this.unavailable.set(failure.code === UNAVAILABLE);
        this.loadError.set(failure.code === UNAVAILABLE ? null : this.tools.say(failure));
        this.result.set(null);
      }
    } finally {
      if (mine === this.asked) {
        this.loading.set(false);
      }
    }
  }

  private async loadFacets(): Promise<void> {
    try {
      this.facets.set(await this.tools.get<AuditFacets>(`${this.base}/facets`));
    } catch {
      // The filters keep their text fields; the lists come with the next reading.
      this.facetsAsked = false;
    }
  }

  /** One filter changed: the address says it, and the page goes back to its first. */
  protected setFilter(name: AuditFilterName, value: string): void {
    const clean = value.trim();
    if (clean === this.filter()[name]) {
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [name]: clean || null, page: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** A date as the browser's date field gives it: whole, or nothing. */
  protected setDate(name: 'from' | 'to', value: string): void {
    if (value === '' || DATE.test(value)) {
      this.setFilter(name, value);
    }
  }

  /** Everything about one thing: its type and id as the filters. */
  protected about(entry: AuditEntry): void {
    if (entry.target_type && entry.target_id) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { target_type: entry.target_type, target_id: entry.target_id, page: null }, queryParamsHandling: 'merge' });
    }
  }

  /** Everything filed under what the entry belongs to. */
  protected within(entry: AuditEntry): void {
    if (entry.scope_type && entry.scope_id) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { scope_type: entry.scope_type, scope_id: entry.scope_id, page: null }, queryParamsHandling: 'merge' });
    }
  }

  protected clearScope(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { scope_type: null, scope_id: null, page: null }, queryParamsHandling: 'merge' });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: Object.fromEntries([...AUDIT_FILTERS, 'page'].map((name) => [name, null])), queryParamsHandling: 'merge' });
  }

  protected setPage(page: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page: page > 1 ? page : null }, queryParamsHandling: 'merge' });
  }

  protected toggle(entry: AuditEntry): void {
    this.open.update((id) => (id === entry.id ? null : entry.id));
  }

  protected details(entry: AuditEntry) {
    return readDetails(entry.details, entry.action);
  }

  protected hasDetails(entry: AuditEntry): boolean {
    return summary(entry.details) !== '';
  }

  /** Who acted, as a person reads it. */
  protected actorName(entry: AuditEntry): string {
    if (entry.actor_id === null) {
      return 'The system';
    }
    return entry.actor_username ?? `Person ${entry.actor_id}`;
  }
}

/**
 * The value chosen stays a choice, whatever the lists say (an address that names one no entry has yet) - an
 * action's family named as one: `account.` is "account.* (every one)".
 */
function withChosen(options: SelectOption[], chosen: string): SelectOption[] {
  if (chosen === '' || options.some((option) => option.value === chosen)) {
    return options;
  }
  return [{ value: chosen, label: chosen.endsWith('.') ? `${chosen}* (every one)` : chosen }, ...options];
}
