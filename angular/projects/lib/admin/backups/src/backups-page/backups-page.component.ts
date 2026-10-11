import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminFailure } from '@anotoki/lib/admin';
import { AdminTools, counted, formatBytes, formatCount, registerAdminIcons } from '@anotoki/lib/admin/parts';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { BadgeComponent, BadgeTone } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { ErrorStateComponent } from '@anotoki/lib/ui/error-state';
import { TextFieldComponent } from '@anotoki/lib/ui/forms';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { BackupInfo, BackupsAnswer, ProofKind, RestoreResult } from '../models';
import { BackupProofComponent, SIGN_IN_AGAIN, WRONG_PASSWORD } from '../proof/proof.component';
import { RestoreDialogComponent, RestoreLost } from '../restore-dialog/restore-dialog.component';

const KIND_WORDS: Readonly<Partial<Record<string, string>>> = {
  daily: 'Daily',
  manual: 'Made by hand',
  'before-migration': 'Before an update',
  'before-restore': 'Before a restore',
};
const KIND_TONES: Readonly<Partial<Record<string, BadgeTone>>> = { daily: 'neutral', manual: 'primary', 'before-migration': 'info', 'before-restore': 'warning' };
const DESCRIPTION_LIMIT = 200;

/** An action the site's proof guards: making a backup, deleting one, downloading one. */
type Guarded = { action: 'create' | 'delete' | 'download'; backup: BackupInfo | null };

/** What the page says of the last thing done. */
interface Outcome {
  tone: 'success' | 'info' | 'warning' | 'danger';
  heading: string;
  text: string;
  /** A sentence more, quieter: the way back, the site's own failure after a restore. */
  note?: string | null;
}

let nextId = 0;

/**
 * The administrators' backups (English): the whole database, table by table,
 * with the migrations that made it - made by the PHP half (Anotoki\Lib\Backups)
 * without pg_dump: every UTC day by itself (fourteen kept), before every update
 * (five), before every restore (five), and by hand (kept until deleted).
 *
 * The status says what this server can do: whether the folder can be written
 * and PHP can copy a table, the free space, the last daily one, whether the
 * backups are encrypted, and whether a restore can run here. "Back up now"
 * takes a description. Every backup made, downloaded, deleted or restored asks
 * the proof the site asks (GET {backups}/proof: the password, or a sign-in of
 * the last few minutes - "Sign in again" when it is older) and is audited.
 *
 * A download is a single-use ticket good for a minute (POST {id}/ticket): the
 * browser is handed the file's link and saves it - nothing passes through the
 * page. A restore asks everything the PHP half requires (RestoreDialogComponent):
 * what it would take away, the backup's name typed, the proof, a countdown.
 *
 * Where the site switched restoring off (the IAM: its backups encrypted, a
 * restore done offline), the page says so and offers no Restore.
 *
 * For the site's ADMIN alone (`isAdmin`); anybody else is told whose page it
 * is, and nothing is asked of the server. It works while an update waits:
 * a backup just before Apply is the point.
 */
@Component({
  selector: 'anotoki-backups-page',
  imports: [
    RouterLink,
    AlertComponent,
    BackupProofComponent,
    BadgeComponent,
    ButtonComponent,
    DialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    PageHeaderComponent,
    RestoreDialogComponent,
    SpinnerComponent,
    TextFieldComponent,
  ],
  templateUrl: './backups-page.component.html',
  styleUrl: './backups-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-backups-page', lang: 'en' },
})
export class BackupsPageComponent {
  protected readonly tools = inject(AdminTools);
  private readonly document = inject(DOCUMENT);
  protected readonly base = this.tools.base('backups');

  protected readonly id = `anotoki-backups-${++nextId}`;
  protected readonly kindWords = KIND_WORDS;
  protected readonly kindTones = KIND_TONES;
  protected readonly descriptionLimit = DESCRIPTION_LIMIT;
  protected readonly formatBytes = formatBytes;
  protected readonly formatCount = formatCount;
  protected readonly restoreOffText = this.tools.config?.restoreOffText ?? null;

  protected readonly data = signal<BackupsAnswer | null>(null);
  protected readonly proofKind = signal<ProofKind | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly outcome = signal<Outcome | null>(null);

  /** The open dialog of a guarded action, and what it holds. */
  protected readonly guarded = signal<Guarded | null>(null);
  protected readonly description = signal('');
  protected readonly password = signal('');
  protected readonly passwordError = signal<string | null>(null);
  protected readonly signInNeeded = signal(false);
  protected readonly guardError = signal<string | null>(null);
  /** The action under way: 'create', or 'download:<id>' / 'delete:<id>'. */
  protected readonly busy = signal<string | null>(null);
  /** Seconds since "Back up now" was pressed. */
  protected readonly elapsed = signal(0);

  /** The backup whose restore dialog is open. */
  protected readonly restoring = signal<BackupInfo | null>(null);
  /** The backup whose tables are shown. */
  protected readonly opened = signal<string | null>(null);
  protected readonly tables = signal<Record<string, BackupInfo['tables']>>({});

  protected readonly status = computed(() => this.data()?.status ?? null);
  protected readonly backups = computed(() => this.data()?.backups ?? []);
  /** Nothing can be made here: the folder is not writable or PHP cannot copy a table. */
  protected readonly cannotMake = computed(() => {
    const status = this.status();
    return status !== null && (!status.directory_writable || !status.copy_available);
  });
  protected readonly descriptionError = computed(() =>
    [...this.description().trim()].length > DESCRIPTION_LIMIT ? `At most ${DESCRIPTION_LIMIT} characters - it has ${[...this.description().trim()].length}.` : null,
  );
  protected readonly canConfirm = computed(() => {
    const guarded = this.guarded();
    if (!guarded || this.busy() !== null || this.signInNeeded()) {
      return false;
    }
    if (guarded.action === 'create' && this.descriptionError() !== null) {
      return false;
    }
    return this.proofKind() !== 'password' || this.password() !== '';
  });

  private asked = 0;
  private started = false;
  private clock: ReturnType<typeof setInterval> | null = null;

  constructor() {
    registerAdminIcons(inject(AnotokiIcons));
    effect(() => {
      if (this.tools.isAdmin() && !this.started) {
        this.started = true;
        untracked(() => {
          void this.load();
          void this.loadProof();
        });
      }
    });
    inject(DestroyRef).onDestroy(() => this.stopClock());
  }

  protected async load(): Promise<void> {
    const mine = ++this.asked;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const answer = await this.tools.get<BackupsAnswer>(this.base);
      if (mine === this.asked) {
        this.data.set({ backups: answer?.backups ?? [], status: answer.status });
      }
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

  private async loadProof(): Promise<void> {
    try {
      const answer = await this.tools.get<{ kind?: string }>(`${this.base}/proof`);
      this.proofKind.set(answer?.kind === 'password' ? 'password' : 'recent_sign_in');
    } catch {
      // Asked again with the first guarded action; meanwhile the server's refusal says what it needs.
      this.proofKind.set(null);
    }
  }

  // ── Guarded actions: made, deleted, downloaded ─────────────────────────────

  protected askToCreate(): void {
    this.description.set('');
    this.openGuarded({ action: 'create', backup: null });
  }

  protected askToDelete(backup: BackupInfo): void {
    this.openGuarded({ action: 'delete', backup });
  }

  /** A download: straight away with a recent sign-in; the password first where the site asks for it. */
  protected download(backup: BackupInfo): void {
    if (this.proofKind() === 'password') {
      this.openGuarded({ action: 'download', backup });
      return;
    }
    void this.fetchTicket(backup, null);
  }

  protected closeGuarded(): void {
    if (this.busy() === null) {
      this.guarded.set(null);
    }
  }

  protected setPassword(password: string): void {
    this.password.set(password);
    this.passwordError.set(null);
  }

  protected confirmGuarded(): void {
    const guarded = this.guarded();
    if (!guarded || !this.canConfirm()) {
      return;
    }
    const password = this.proofKind() === 'password' ? this.password() : null;
    if (guarded.action === 'create') {
      void this.create(password);
    } else if (guarded.action === 'delete' && guarded.backup) {
      void this.remove(guarded.backup, password);
    } else if (guarded.backup) {
      void this.fetchTicket(guarded.backup, password);
    }
  }

  private openGuarded(guarded: Guarded): void {
    this.password.set('');
    this.passwordError.set(null);
    this.signInNeeded.set(false);
    this.guardError.set(null);
    this.guarded.set(guarded);
    if (this.proofKind() === null) {
      void this.loadProof();
    }
  }

  private async create(password: string | null): Promise<void> {
    this.busy.set('create');
    this.guardError.set(null);
    this.startClock();
    const description = this.description().trim();
    try {
      const answer = await this.tools.post<{ backup: BackupInfo }>(this.base, { ...(description ? { description } : {}), ...(password !== null ? { password } : {}) });
      this.guarded.set(null);
      const backup = answer.backup;
      this.outcome.set({
        tone: 'success',
        heading: 'Backed up',
        text: `${backup.id}: ${formatBytes(backup.size)}${backup.table_count !== undefined ? `, ${counted(backup.table_count, 'table', 'tables')}` : ''}${backup.rows !== undefined ? `, ${counted(backup.rows, 'row', 'rows')}` : ''}.`,
      });
      await this.load();
    } catch (error) {
      this.refused(this.tools.failure(error));
    } finally {
      this.stopClock();
      this.busy.set(null);
    }
  }

  private async remove(backup: BackupInfo, password: string | null): Promise<void> {
    this.busy.set(`delete:${backup.id}`);
    this.guardError.set(null);
    try {
      await this.tools.delete(`${this.base}/${backup.id}`, {}, password !== null ? { password } : {});
      this.guarded.set(null);
      this.outcome.set({ tone: 'info', heading: 'Deleted', text: `The backup of ${this.tools.date(backup.created_at)} (${backup.id}) is gone.` });
      await this.load();
    } catch (error) {
      this.refused(this.tools.failure(error));
    } finally {
      this.busy.set(null);
    }
  }

  /** The single-use link, then the browser saves the file from it: nothing of it passes through the page. */
  private async fetchTicket(backup: BackupInfo, password: string | null): Promise<void> {
    this.busy.set(`download:${backup.id}`);
    this.guardError.set(null);
    try {
      const answer = await this.tools.post<{ url?: string; expires_in?: number }>(`${this.base}/${backup.id}/ticket`, password !== null ? { password } : {});
      const url = this.tools.url(answer?.url ?? '');
      if (url === null) {
        throw { status: 502, code: 'ticket_unusable', message: 'The server gave no link this page can open.' };
      }
      this.save(url);
      this.guarded.set(null);
      this.outcome.set({ tone: 'info', heading: 'Downloading', text: `The backup of ${this.tools.date(backup.created_at)} is on its way to your downloads. Its link worked once, and no more.` });
    } catch (error) {
      const failure = this.tools.failure(error);
      if (!this.guarded() && (SIGN_IN_AGAIN.includes(failure.code) || WRONG_PASSWORD.includes(failure.code))) {
        // Straight away failed for want of the proof: the dialog says what is needed.
        this.openGuarded({ action: 'download', backup });
      }
      if (this.guarded()) {
        this.refused(failure);
      } else {
        this.outcome.set({ tone: 'danger', heading: 'It was not downloaded', text: this.tools.say(failure) });
      }
    } finally {
      this.busy.set(null);
    }
  }

  /** A refusal of a guarded action, said in its dialog: beside the password, as "Sign in again", or under it all. */
  private refused(failure: AdminFailure): void {
    if (SIGN_IN_AGAIN.includes(failure.code)) {
      this.signInNeeded.set(true);
    } else if (WRONG_PASSWORD.includes(failure.code)) {
      this.passwordError.set(this.tools.say(failure));
    } else {
      this.guardError.set(this.tools.say(failure));
    }
  }

  /** Hands the browser the file's link: an attachment, so the page stays where it is. */
  private save(url: string): void {
    const link = this.document.createElement('a');
    link.href = url;
    link.download = '';
    link.rel = 'noopener noreferrer';
    link.hidden = true;
    this.document.body.appendChild(link);
    link.click();
    link.remove();
  }

  private startClock(): void {
    this.stopClock();
    const started = Date.now();
    this.elapsed.set(0);
    this.clock = setInterval(() => this.elapsed.set(Math.floor((Date.now() - started) / 1000)), 1000);
  }

  private stopClock(): void {
    if (this.clock !== null) {
      clearInterval(this.clock);
      this.clock = null;
    }
  }

  // ── Restoring ──────────────────────────────────────────────────────────────

  protected askToRestore(backup: BackupInfo): void {
    if (this.proofKind() === null) {
      void this.loadProof();
    }
    this.restoring.set(backup);
  }

  protected closeRestore(): void {
    this.restoring.set(null);
  }

  protected async restored(result: RestoreResult): Promise<void> {
    this.restoring.set(null);
    this.outcome.set({
      tone: result.after_restore_error ? 'warning' : 'success',
      heading: 'Restored',
      text: `${result.restored}: ${counted(result.rows, 'row', 'rows')} in ${counted(result.tables, 'table', 'tables')}, in ${(result.duration_ms / 1000).toFixed(1)} s. What was there before is kept as the backup ${result.before_restore}.`,
      note: result.after_restore_error ? `The restore stands, but the site's own work after it failed: ${result.after_restore_error}` : null,
    });
    await this.load();
  }

  /** The answer never came back: a restore may run longer than the connection waits. The list says more in a while. */
  protected async lost(lost: RestoreLost): Promise<void> {
    this.restoring.set(null);
    this.outcome.set({
      tone: 'warning',
      heading: 'No answer came - it may still be running',
      text: `The connection gave up before the server said how the restore of ${lost.backup.id} went. A backup "Before a restore" in the list, made a moment ago, says it began; the audit log says how it ended. Look again in a minute.`,
    });
    await this.load();
  }

  // ── The list ───────────────────────────────────────────────────────────────

  protected async toggleTables(backup: BackupInfo): Promise<void> {
    if (this.opened() === backup.id) {
      this.opened.set(null);
      return;
    }
    this.opened.set(backup.id);
    if (this.tables()[backup.id]) {
      return;
    }
    try {
      const answer = await this.tools.get<{ backup: BackupInfo }>(`${this.base}/${backup.id}`);
      this.tables.update((tables) => ({ ...tables, [backup.id]: answer.backup.tables ?? [] }));
    } catch (error) {
      this.outcome.set({ tone: 'danger', heading: 'Its tables could not be read', text: this.tools.say(this.tools.failure(error)) });
      this.opened.set(null);
    }
  }

  /** Who made it, as a person reads it. */
  protected madeBy(backup: BackupInfo): string {
    if (backup.created_by === null || backup.created_by === '') {
      return backup.kind === 'manual' ? 'Somebody' : 'By itself';
    }
    return backup.created_by_name || `Person ${backup.created_by}`;
  }

  /** Why Restore is greyed out for a backup the server says cannot be restored here. */
  protected whyNotRestorable(backup: BackupInfo): string | null {
    if (backup.restorable) {
      return null;
    }
    return backup.sealed === false ? 'Not made here, or changed since: it is restored offline' : 'The schema has changed since: it is restored offline';
  }

  protected isBusy(action: string, backup: BackupInfo): boolean {
    return this.busy() === `${action}:${backup.id}`;
  }

  protected guardedTitle(guarded: Guarded): string {
    switch (guarded.action) {
      case 'create':
        return 'Back up now';
      case 'delete':
        return 'Delete this backup?';
      default:
        return 'Download this backup';
    }
  }

  protected guardedText(guarded: Guarded): string {
    const backup = guarded.backup;
    switch (guarded.action) {
      case 'create':
        return 'The whole database, table by table, with the migrations that made it. It takes a few seconds; the site goes on meanwhile.';
      case 'delete':
        return backup ? `The backup of ${this.tools.date(backup.created_at)} (${formatBytes(backup.size)}) goes for good - there is no undo.` : '';
      default:
        return backup ? `${formatBytes(backup.size)}, ${backup.encrypted ? "encrypted - it opens with this site's key alone" : 'not encrypted - it holds everybody’s data: keep it safe'}.` : '';
    }
  }
}
