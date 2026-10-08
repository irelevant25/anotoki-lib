import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ANOTOKI_MIGRATIONS_CONFIG, SiteStatus, ɵdefaultFormatDate as defaultFormatDate, ɵmessageOf as messageOf } from '@anotoki/lib/migrations';
import { AlertComponent, BadgeComponent, BadgeTone, ButtonComponent, CardComponent, PageHeaderComponent, SpinnerComponent } from '@anotoki/lib/ui';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { firstValueFrom } from 'rxjs';

/** A file of a set, as the server names it. */
interface MigrationFile {
  set: string;
  name: string;
}

interface RecordedFile extends MigrationFile {
  applied_at: string | null;
}

interface PendingFile extends MigrationFile {
  ready: boolean;
  blocked: boolean;
}

/** GET {apiBase}: Migrator::status() on the server. */
interface MigrationsStatus {
  sets: string[];
  applied: RecordedFile[];
  pending: PendingFile[];
  missing: RecordedFile[];
}

/** POST {apiBase}/apply */
interface ApplyResult {
  applied: MigrationFile[];
  failed: MigrationFile | null;
  error: string | null;
  note: string | null;
}

/** What the last Apply did, in words. */
interface Outcome {
  tone: 'success' | 'info' | 'warning' | 'danger';
  heading: string | null;
  text: string;
  /** What the database said, kept as it is. */
  error: string | null;
  note: string | null;
}

type Badge = 'pending' | 'draft' | 'waits';

const BADGE_TONES: Record<Badge, BadgeTone> = { pending: 'warning', draft: 'neutral', waits: 'neutral' };

let nextId = 0;

/**
 * The administrators' Migrations page (English, as every admin panel is):
 * the files the database lacks and has, and "Apply pending" - which runs them
 * in order on the live database, each whole or not at all, stopping at the
 * first that fails. It works while an update waits, when nothing else of the
 * site does; once nothing is left to apply the site runs again
 * (SiteStatus.markReady(), and the site's onUpToDate).
 *
 * Drawn with the family's kit: a page header, cards, badges, an alert for
 * what an Apply did, and dialogs for the question before it and for a file's
 * SQL. Anybody who is not the site's ADMIN is told whose page it is, and
 * nothing is asked of the server.
 *
 * Its own entry point (@anotoki/lib/migrations/page), so a site's first load
 * never carries it: `loadComponent: () => import('@anotoki/lib/migrations/page').then((m) => m.MigrationsPageComponent)`.
 */
@Component({
  selector: 'anotoki-migrations-page',
  imports: [AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DialogComponent, PageHeaderComponent, SpinnerComponent],
  templateUrl: './migrations-page.component.html',
  styleUrl: './migrations-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { lang: 'en' },
})
export class MigrationsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly siteStatus = inject(SiteStatus);
  private readonly config = inject(ANOTOKI_MIGRATIONS_CONFIG);

  protected readonly id = `anotoki-migrations-${++nextId}`;
  protected readonly formatDate = this.config.formatDate ?? defaultFormatDate;
  protected readonly admin = computed(() => this.config.isAdmin());
  protected readonly badgeTones = BADGE_TONES;

  protected readonly data = signal<MigrationsStatus | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly applying = signal(false);
  protected readonly outcome = signal<Outcome | null>(null);
  /** The question before an Apply is open. */
  protected readonly confirming = signal(false);
  protected readonly viewing = signal<{ file: MigrationFile; sql: string | null; error: string | null } | null>(null);
  protected readonly copied = signal<string | null>(null);

  /** The files Apply runs now: in order, up to the first draft. */
  protected readonly applicable = computed(() => this.data()?.pending.filter((file) => file.ready && !file.blocked) ?? []);
  protected readonly canApply = computed(() => !this.loading() && !this.applying() && this.applicable().length > 0);
  protected readonly confirmTitle = computed(() => {
    const count = this.applicable().length;
    return count === 1 ? 'Apply 1 pending migration?' : `Apply ${count} pending migrations?`;
  });
  protected readonly manySets = computed(() => (this.data()?.sets.length ?? 0) > 1);

  /** The pending files by set, in the order they will run, each with its badge. */
  protected readonly groups = computed(() => {
    const groups: { set: string; files: (PendingFile & { badge: Badge })[] }[] = [];
    for (const file of this.data()?.pending ?? []) {
      const badge: Badge = !file.ready ? 'draft' : file.blocked ? 'waits' : 'pending';
      const last = groups.at(-1);
      if (last && last.set === file.set) {
        last.files.push({ ...file, badge });
      } else {
        groups.push({ set: file.set, files: [{ ...file, badge }] });
      }
    }
    return groups;
  });

  protected readonly viewingSql = computed(() => this.viewing()?.sql ?? null);

  private readonly sqlText = viewChild<ElementRef<HTMLElement>>('sqlText');
  private started = false;

  constructor() {
    // Read once the person is known to be the site's ADMIN - never before, never for anybody else.
    effect(() => {
      if (this.admin() && !this.started) {
        this.started = true;
        untracked(() => void this.load());
      }
    });
  }

  /** A file as the page names it: with its set when the site has more than one. */
  protected label(file: MigrationFile): string {
    const sets = this.data()?.sets ?? [];
    return sets.length > 1 || (sets.length === 1 && sets[0] !== file.set) ? `${file.set}/${file.name}` : file.name;
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.data.set(await firstValueFrom(this.http.get<MigrationsStatus>(this.config.apiBase)));
    } catch (error) {
      this.loadError.set(messageOf(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** The safe answer first: an Apply is never one keypress away (the question's focus starts on Cancel). */
  protected askToApply(): void {
    if (this.canApply()) {
      this.confirming.set(true);
    }
  }

  protected cancelApply(): void {
    this.confirming.set(false);
  }

  protected async applyConfirmed(): Promise<void> {
    this.confirming.set(false);
    this.applying.set(true);
    this.outcome.set(null);
    try {
      this.outcome.set(this.describe(await firstValueFrom(this.http.post<ApplyResult>(`${this.config.apiBase}/apply`, {}))));
    } catch (error) {
      this.outcome.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? { tone: 'warning', heading: null, text: messageOf(error), error: null, note: null }
          : { tone: 'danger', heading: 'Nothing was applied.', text: messageOf(error), error: null, note: null },
      );
    } finally {
      this.applying.set(false);
    }

    await this.load();
    if (this.loadError() === null && this.data() !== null && this.applicable().length === 0) {
      this.config.onUpToDate?.();
      this.siteStatus.markReady();
    }
  }

  protected async view(file: MigrationFile): Promise<void> {
    const viewing = { file, sql: null, error: null };
    this.viewing.set(viewing);
    this.copied.set(null);

    let shown: { file: MigrationFile; sql: string | null; error: string | null };
    try {
      const answer = await firstValueFrom(
        this.http.get<{ set: string; name: string; sql: string }>(`${this.config.apiBase}/file`, {
          params: { set: file.set, name: file.name },
        }),
      );
      shown = { file, sql: answer.sql, error: null };
    } catch (error) {
      shown = { file, sql: null, error: messageOf(error) };
    }
    // Only if it is still this file the dialog shows.
    if (this.viewing() === viewing) {
      this.viewing.set(shown);
    }
  }

  /** The SQL dialog closes (Close, Escape, the backdrop): it shows nothing until it opens again. */
  protected closeSql(): void {
    this.viewing.set(null);
    this.copied.set(null);
  }

  protected async copy(): Promise<void> {
    const sql = this.viewingSql();
    if (sql === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(sql);
      this.copied.set('Copied.');
    } catch {
      // No clipboard here (a page not served over https, or no permission): the text is selected instead.
      const text = this.sqlText()?.nativeElement;
      const selection = this.document.getSelection();
      if (text && selection) {
        const range = this.document.createRange();
        range.selectNodeContents(text);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      this.copied.set('The text is selected: copy it with Ctrl+C.');
    }
  }

  private describe(result: ApplyResult): Outcome {
    const names = (files: MigrationFile[]) => files.map((file) => this.label(file)).join(', ');
    const note = result.note || null;

    if (result.failed) {
      return {
        tone: 'danger',
        heading: `Stopped at ${this.label(result.failed)}`,
        text: (result.applied.length ? `Applied first: ${names(result.applied)}.` : 'Nothing was applied.') + ' The failed file was rolled back as a whole.',
        error: result.error,
        note,
      };
    }
    if (result.error) {
      return { tone: 'danger', heading: 'Nothing was applied.', text: result.error, error: null, note };
    }
    if (result.applied.length) {
      return { tone: 'success', heading: 'Up to date', text: `Applied: ${names(result.applied)}.`, error: null, note };
    }
    return { tone: 'info', heading: null, text: 'There was nothing to apply.', error: null, note };
  }
}
