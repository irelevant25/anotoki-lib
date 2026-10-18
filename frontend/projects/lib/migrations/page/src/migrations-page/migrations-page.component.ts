import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ANOTOKI_MIGRATIONS_CONFIG, SiteStatus } from '@anotoki/lib/migrations';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { BadgeComponent, BadgeTone } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { firstValueFrom } from 'rxjs';
import { defaultFormatDate, messageOf } from '../messages';

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

/** A piece of a sentence: its own words, or a file's name (drawn so that a line breaks only between the name's words). */
interface Piece {
  text: string;
  file: boolean;
}

/** What the last Apply did, in words. */
interface Outcome {
  tone: 'success' | 'info' | 'warning' | 'danger';
  heading: string | null;
  text: Piece[];
  /** What the database said, kept as it is. */
  error: string | null;
  note: string | null;
}

type Badge = 'pending' | 'draft' | 'waits';

const BADGE_TONES: Record<Badge, BadgeTone> = { pending: 'warning', draft: 'neutral', waits: 'neutral' };

/** A set the library ships: the names that begin with anotoki_ are theirs alone (the engine refuses a site's). */
function isLibrarySet(set: string): boolean {
  return set.startsWith('anotoki_');
}

/** A sentence that names no file. */
function said(text: string): Piece[] {
  return [{ text, file: false }];
}

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
  imports: [NgTemplateOutlet, AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DialogComponent, PageHeaderComponent, SpinnerComponent],
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
  /** The pending files in the order they will run, each with its badge - named as the Applied card names them. */
  protected readonly pending = computed(() => (this.data()?.pending ?? []).map((file) => ({ ...file, badge: (!file.ready ? 'draft' : file.blocked ? 'waits' : 'pending') as Badge })));

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

  /**
   * A file as the bookkeeping table records it - one name in every card and sentence of the page: the
   * site's one set's files by their names alone, as the engine records them; every other file with its
   * set - a library set's (`anotoki_translations/003_sign_in_words.sql`, as recorded where the table has
   * no folder column), each of a site's several sets (whose table keeps the set in that column), and the
   * record of a set the site no longer has. A record with no set (no set of the site's own to read it
   * under) is its name.
   */
  protected label(file: MigrationFile): string {
    const own = (this.data()?.sets ?? []).filter((set) => !isLibrarySet(set));
    return file.set === '' || (own.length === 1 && own[0] === file.set) ? file.name : `${file.set}/${file.name}`;
  }

  /** A name in the pieces a line may break after - its slash, and between its words (_ and -) - never inside a word. */
  protected parts(name: string): string[] {
    return name.split(/(?<=[/_-])/);
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
          ? { tone: 'warning', heading: null, text: said(messageOf(error)), error: null, note: null }
          : { tone: 'danger', heading: 'Nothing was applied.', text: said(messageOf(error)), error: null, note: null },
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
    /** "Applied: a, b." - the files by name, between the sentence's own words. */
    const naming = (lead: string, files: MigrationFile[], tail: string): Piece[] => [
      { text: lead, file: false },
      ...files.flatMap((file, index) => [...(index ? said(', ') : []), { text: this.label(file), file: true }]),
      { text: tail, file: false },
    ];
    const note = result.note || null;

    if (result.failed) {
      const rolledBack = ' The failed file was rolled back as a whole.';
      return {
        tone: 'danger',
        heading: `Stopped at ${this.label(result.failed)}`,
        text: result.applied.length ? naming('Applied first: ', result.applied, '.' + rolledBack) : said('Nothing was applied.' + rolledBack),
        error: result.error,
        note,
      };
    }
    if (result.error) {
      return { tone: 'danger', heading: 'Nothing was applied.', text: said(result.error), error: null, note };
    }
    if (result.applied.length) {
      return { tone: 'success', heading: 'Up to date', text: naming('Applied: ', result.applied, '.'), error: null, note };
    }
    return { tone: 'info', heading: null, text: said('There was nothing to apply.'), error: null, note };
  }
}
