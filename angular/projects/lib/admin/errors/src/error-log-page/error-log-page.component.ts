import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminTools, counted, formatCount, formatDay, registerAdminIcons } from '@anotoki/lib/admin/parts';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { BadgeComponent, BadgeTone } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CopyButtonComponent } from '@anotoki/lib/ui/copy';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { ErrorStateComponent } from '@anotoki/lib/ui/error-state';
import { RadioGroupComponent, RadioOption, SelectComponent, SelectOption, TextFieldComponent } from '@anotoki/lib/ui/forms';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { PaginationComponent } from '@anotoki/lib/ui/pagination';
import { SegmentedComponent, SegmentedOption } from '@anotoki/lib/ui/segmented';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { ErrorLogEntry, ErrorLogGroup, ErrorLogReport } from '../models';

/** The rows a page shows. */
const PAGE_SIZE = 20;
/** The occurrences a row opens to at most - the newest. */
const OCCURRENCES_SHOWN = 200;

const RANGES: SegmentedOption[] = [
  { value: '1', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

const LEVELS: SelectOption[] = [
  { value: 'error', label: 'Errors' },
  { value: 'warning', label: 'Warnings' },
  { value: 'notice', label: 'Notices' },
];

const LEVEL_TONES: Readonly<Partial<Record<string, BadgeTone>>> = { error: 'danger', warning: 'warning', notice: 'info' };

type ClearChoice = 'today' | 'week' | 'all';

const CLEAR_CHOICES: RadioOption[] = [
  { value: 'today', label: 'Everything before today', hint: "Today's failures stay, so what still goes wrong stands out." },
  { value: 'week', label: 'Everything older than a week', hint: 'The last seven days stay.' },
  { value: 'all', label: 'Everything', hint: 'Every file of the log, today’s too.' },
];

/** The filters the server reads. */
interface Filter {
  days: number;
  level: string;
  status: string;
  search: string;
}

const DEFAULT_FILTER: Filter = { days: 7, level: '', status: '', search: '' };

/** One day's column of the chart. */
interface DayBar {
  day: string;
  label: string;
  /** Shown under its column: every day in a short range, every fifth in a long one. */
  showLabel: boolean;
  total: number;
  errors: number;
  warnings: number;
  notices: number;
  /** Each part's height, in per cent of the busiest day. */
  errorHeight: number;
  warningHeight: number;
  noticeHeight: number;
  /** What it says to a screen reader. */
  text: string;
}

let nextId = 0;

/**
 * The administrators' error log (English): every request the server could not
 * answer, and every PHP warning and fatal - read from the files the PHP half
 * writes under the site's storage (Anotoki\Lib\ErrorLog), so it works while
 * the database is down or an update waits. What is written there is redacted
 * already: no address, no query string, no body, no call's arguments.
 *
 * Repeats arrive grouped by fingerprint, loudest first: one row, one count. A
 * row opens to its newest occurrence in full - the request, the route, where
 * it was thrown, who was signed in, the trace - and, asked, every occurrence.
 * The range, the level, the status and a search (in the message, the path,
 * the route, the type) narrow it; "Clear the log" takes the old days away (or
 * every day), after a question.
 *
 * For the site's ADMIN alone (`isAdmin`); anybody else is told whose page it
 * is, and nothing is asked of the server.
 */
@Component({
  selector: 'anotoki-error-log-page',
  imports: [
    RouterLink,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    CopyButtonComponent,
    DialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    PageHeaderComponent,
    PaginationComponent,
    RadioGroupComponent,
    SegmentedComponent,
    SelectComponent,
    SpinnerComponent,
    TextFieldComponent,
  ],
  templateUrl: './error-log-page.component.html',
  styleUrl: './error-log-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-error-log-page', lang: 'en' },
})
export class ErrorLogPageComponent {
  protected readonly tools = inject(AdminTools);
  private readonly base = this.tools.base('errors');

  protected readonly id = `anotoki-error-log-${++nextId}`;
  protected readonly ranges = RANGES;
  protected readonly levels = LEVELS;
  protected readonly levelTones = LEVEL_TONES;
  protected readonly clearChoices = CLEAR_CHOICES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly formatCount = formatCount;

  /** The filters the shown report was read with. */
  protected readonly filter = signal<Filter>(DEFAULT_FILTER);
  /** What is typed in the search, applied on Enter or with Search. */
  protected readonly searchText = signal('');

  protected readonly report = signal<ErrorLogReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly page = signal(1);
  /** The open row, by fingerprint. */
  protected readonly open = signal<string | null>(null);
  /** Every occurrence of the open row, once asked for. */
  protected readonly occurrences = signal<{ fingerprint: string; entries: ErrorLogEntry[] } | null>(null);
  protected readonly occurrencesLoading = signal(false);
  protected readonly occurrencesError = signal<string | null>(null);

  protected readonly clearing = signal(false);
  protected readonly clearChoice = signal<ClearChoice>('today');
  protected readonly clearBusy = signal(false);
  protected readonly clearError = signal<string | null>(null);
  /** What the last action did, read out. */
  protected readonly happened = signal('');

  protected readonly filtered = computed(() => {
    const filter = this.filter();
    return filter.level !== '' || filter.status !== '' || filter.search !== '' || filter.days !== DEFAULT_FILTER.days;
  });

  /** Nothing has gone wrong in the range, and nothing narrows it: the good case. */
  protected readonly quiet = computed(() => {
    const report = this.report();
    return report !== null && report.total === 0 && !this.filtered();
  });

  protected readonly statusOptions = computed<SelectOption[]>(() => {
    const options = (this.report()?.statuses ?? []).map((tally) => ({
      value: tally.key,
      label: `${tally.key === '0' ? 'No status' : tally.key} (${formatCount(tally.errors + tally.warnings + tally.notices)})`,
    }));
    // The status filtered by stays a choice, whatever the report counted.
    const status = this.filter().status;
    return status !== '' && !options.some((option) => option.value === status) ? [{ value: status, label: status }, ...options] : options;
  });

  protected readonly groups = computed(() => this.report()?.groups ?? []);
  protected readonly shownGroups = computed(() => this.groups().slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE));

  protected readonly bars = computed<DayBar[]>(() => {
    const daily = this.report()?.daily ?? [];
    const peak = Math.max(1, ...daily.map((day) => day.errors + day.warnings + day.notices));
    const every = daily.length > 14 ? 5 : 1;
    return daily.map((day, index) => {
      const total = day.errors + day.warnings + day.notices;
      const label = formatDay(day.key);
      return {
        day: day.key,
        label,
        showLabel: every === 1 || index % every === 0 || index === daily.length - 1,
        total,
        errors: day.errors,
        warnings: day.warnings,
        notices: day.notices,
        errorHeight: (day.errors / peak) * 100,
        warningHeight: (day.warnings / peak) * 100,
        noticeHeight: (day.notices / peak) * 100,
        text: `${label}: ${counted(day.errors, 'error', 'errors')}, ${counted(day.warnings, 'warning', 'warnings')}, ${counted(day.notices, 'notice', 'notices')}`,
      };
    });
  });

  /** The days some lines were only counted (the log was full, or a kind had its lines), newest first: "6 Oct: 12 lines". */
  protected readonly dropped = computed(() =>
    Object.entries(this.report()?.dropped ?? {})
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, lines]) => `${formatDay(day)}: ${counted(lines, 'line', 'lines')}`),
  );

  /** Every request is the latest one's: an answer to an earlier one is dropped. */
  private asked = 0;
  private started = false;

  constructor() {
    registerAdminIcons(inject(AnotokiIcons));
    // Read once the person is known to be the site's ADMIN - never before, never for anybody else.
    effect(() => {
      if (this.tools.isAdmin() && !this.started) {
        this.started = true;
        untracked(() => void this.load());
      }
    });
  }

  protected async load(filter: Filter = this.filter()): Promise<void> {
    const mine = ++this.asked;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const report = await this.tools.get<ErrorLogReport>(this.base, { days: filter.days, level: filter.level, status: filter.status, search: filter.search });
      if (mine !== this.asked) {
        return;
      }
      this.filter.set(filter);
      this.report.set(report);
      this.page.set(1);
      if (this.open() !== null && !report.groups.some((group) => group.fingerprint === this.open())) {
        this.open.set(null);
      }
      this.occurrences.set(null);
    } catch (error) {
      if (mine === this.asked) {
        this.loadError.set(this.tools.say(this.tools.failure(error)));
      }
    } finally {
      if (mine === this.asked) {
        this.loading.set(false);
      }
    }
  }

  protected setRange(value: string): void {
    void this.load({ ...this.filter(), days: Number(value) || DEFAULT_FILTER.days });
  }

  protected setLevel(level: string): void {
    void this.load({ ...this.filter(), level });
  }

  protected setStatus(status: string): void {
    void this.load({ ...this.filter(), status });
  }

  protected applySearch(): void {
    const search = this.searchText().trim();
    if (search !== this.filter().search) {
      void this.load({ ...this.filter(), search });
    }
  }

  /** A path the row came through, as the search. */
  protected searchFor(path: string): void {
    this.searchText.set(path);
    void this.load({ ...this.filter(), search: path });
  }

  protected reset(): void {
    this.searchText.set('');
    void this.load(DEFAULT_FILTER);
  }

  protected toggle(group: ErrorLogGroup): void {
    this.open.update((fingerprint) => (fingerprint === group.fingerprint ? null : group.fingerprint));
    this.occurrences.set(null);
    this.occurrencesError.set(null);
  }

  protected async showOccurrences(group: ErrorLogGroup): Promise<void> {
    this.occurrencesLoading.set(true);
    this.occurrencesError.set(null);
    const filter = this.filter();
    try {
      const entries = await this.tools.get<ErrorLogEntry[]>(`${this.base}/${group.fingerprint}`, { days: filter.days, level: filter.level, status: filter.status, search: filter.search });
      if (this.open() === group.fingerprint) {
        this.occurrences.set({ fingerprint: group.fingerprint, entries: entries.slice(0, OCCURRENCES_SHOWN) });
      }
    } catch (error) {
      if (this.open() === group.fingerprint) {
        this.occurrencesError.set(this.tools.say(this.tools.failure(error)));
      }
    } finally {
      this.occurrencesLoading.set(false);
    }
  }

  protected setPage(page: number): void {
    this.page.set(page);
    this.open.set(null);
  }

  protected askToClear(): void {
    this.clearChoice.set('today');
    this.clearError.set(null);
    this.clearing.set(true);
  }

  protected cancelClear(): void {
    if (!this.clearBusy()) {
      this.clearing.set(false);
    }
  }

  protected async clear(): Promise<void> {
    const choice = this.clearChoice();
    const before = choice === 'all' ? null : utcDay(choice === 'today' ? 0 : 6);
    this.clearBusy.set(true);
    this.clearError.set(null);
    try {
      const answer = await this.tools.delete<{ deleted?: number }>(this.base, { before });
      const deleted = answer?.deleted ?? 0;
      this.clearing.set(false);
      this.happened.set(deleted > 0 ? `Cleared ${counted(deleted, 'file', 'files')} of the log.` : 'There was nothing to clear.');
      await this.load();
    } catch (error) {
      this.clearError.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.clearBusy.set(false);
    }
  }

  // ── How a row is said ──────────────────────────────────────────────────────

  /** `Slim\Exception\HttpNotFoundException` is one useful word and a lot of namespace. */
  protected shortType(type: string): string {
    return type.split('\\').pop() || type;
  }

  /** The status, or where the line came from when there was none (a PHP warning). */
  protected statusOf(group: { status: number; source: string }): string {
    return group.status > 0 ? String(group.status) : group.source === 'php' ? 'PHP' : group.source === 'client' ? 'Page' : '-';
  }

  /** Where it went wrong, as a person looks for it: the request's route, else its path. */
  protected whereOf(group: ErrorLogGroup): string {
    const request = group.route || group.latest.path || group.paths[0] || '';
    const method = group.latest.method;
    return request ? (method ? `${method} ${request}` : request) : '';
  }

  protected thrownAt(entry: { file: string | null; line: number | null }): string | null {
    if (!entry.file) {
      return null;
    }
    return entry.line ? `${entry.file}:${entry.line}` : entry.file;
  }

  protected traceText(entry: ErrorLogEntry): string {
    return (entry.trace ?? []).join('\n');
  }

  protected sourceOf(source: string): string {
    switch (source) {
      case 'php':
        return 'PHP itself (a warning or a fatal error)';
      case 'client':
        return "A page, in somebody's browser";
      default:
        return 'An answer of the server';
    }
  }
}

/** The UTC date `daysAgo` days back, as the log's files are named. */
function utcDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}
