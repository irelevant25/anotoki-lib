import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AdminFailure } from '@anotoki/lib/admin';
import { AdminTools, ago, counted, formatCount, mayStillRun } from '@anotoki/lib/admin/parts';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { TextFieldComponent } from '@anotoki/lib/ui/forms';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { BackupInfo, ProofKind, RestorePreview, RestoreResult } from '../models';
import { BackupProofComponent, SIGN_IN_AGAIN, WRONG_PASSWORD } from '../proof/proof.component';

/** How long the Restore button stays out of reach, in seconds. */
export const RESTORE_COUNTDOWN = 30;

/** What the page is told of a restore that may still be running when its answer did not come. */
export interface RestoreLost {
  backup: BackupInfo;
  failure: AdminFailure;
}

/**
 * The last thing between a click and the database replaced by a backup - the
 * PHP half's strong confirmation, all of it:
 *
 * - what is at stake, from the server (GET {backups}/{id}/preview): the rows
 *   in the database now against the backup's, the tables that would lose
 *   rows, those a restore never touches, and why it cannot be done here
 *   where it cannot (the schema changed since: then the button never unlocks);
 * - the backup's name typed: its last six characters, as the server checks;
 * - the proof the site asks for (the password, or a recent sign-in - "Sign
 *   in again" when the server says the sign-in is older);
 * - a countdown: the button unlocks after thirty seconds, never at once.
 *
 * Restoring answers what came back (the page says it, with the backup of what
 * was there made first: the way back). A connection that gave up before the
 * server's answer (a proxy's 524 after 100 seconds) is no failure: the
 * restore may still be running, and the page looks again.
 */
@Component({
  selector: 'anotoki-backup-restore-dialog',
  imports: [AlertComponent, BackupProofComponent, ButtonComponent, DialogComponent, IconComponent, SpinnerComponent, TextFieldComponent],
  templateUrl: './restore-dialog.component.html',
  styleUrl: './restore-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-backup-restore-dialog' },
})
export class RestoreDialogComponent {
  protected readonly tools = inject(AdminTools);

  readonly backup = input.required<BackupInfo>();
  readonly base = input.required<string>();
  readonly proofKind = input<ProofKind | null>(null);

  /** Restored: what the server answered. */
  readonly restored = output<RestoreResult>();
  /** The answer never came: it may still be running. */
  readonly lost = output<RestoreLost>();
  readonly dismissed = output<void>();

  protected readonly formatCount = formatCount;
  protected readonly preview = signal<RestorePreview | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly typed = signal('');
  protected readonly password = signal('');
  protected readonly passwordError = signal<string | null>(null);
  protected readonly signInNeeded = signal(false);
  protected readonly restoring = signal(false);
  protected readonly failure = signal<{ heading: string; text: string } | null>(null);
  protected readonly typedError = signal<string | null>(null);

  private readonly openedAt = Date.now();
  private readonly now = signal(Date.now());

  /** The seconds before Restore unlocks. */
  protected readonly remaining = computed(() => Math.max(0, Math.ceil((this.openedAt + RESTORE_COUNTDOWN * 1000 - this.now()) / 1000)));
  /** What is typed to confirm: the last six characters of the backup's name. */
  protected readonly word = computed(() => this.backup().id.slice(-6));
  protected readonly matches = computed(() => this.typed().trim() === this.word());
  protected readonly losses = computed(() => (this.preview()?.differences ?? []).filter((table) => table.delta > 0));
  protected readonly gains = computed(() => (this.preview()?.differences ?? []).filter((table) => table.delta < 0));
  protected readonly age = computed(() => ago(this.backup().created_at));
  protected readonly canRestore = computed(
    () => this.remaining() === 0 && this.matches() && !this.restoring() && !this.signInNeeded() && this.preview()?.restorable === true && (this.proofKind() !== 'password' || this.password() !== ''),
  );
  /** What stands between the person and Restore, said in the footer. */
  protected readonly waitingFor = computed(() => {
    if (this.preview() === null) {
      return this.previewError() ? 'It cannot be restored now.' : 'Reading what it would change…';
    }
    if (!this.preview()!.restorable) {
      return 'It cannot be restored here.';
    }
    if (this.signInNeeded()) {
      return 'Sign in again to go on.';
    }
    if (this.remaining() > 0) {
      return `Restore unlocks in ${this.remaining()} s`;
    }
    if (!this.matches()) {
      return `Type ${this.word()} to go on.`;
    }
    if (this.proofKind() === 'password' && this.password() === '') {
      return 'Type your password to go on.';
    }
    return null;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    // What is at stake, asked once the backup is known.
    let asked = false;
    effect(() => {
      if (this.backup() && !asked) {
        asked = true;
        untracked(() => void this.loadPreview());
      }
    });
  }

  protected async loadPreview(): Promise<void> {
    this.previewError.set(null);
    try {
      this.preview.set(await this.tools.get<RestorePreview>(`${this.base()}/${this.backup().id}/preview`));
    } catch (error) {
      this.previewError.set(this.tools.say(this.tools.failure(error)));
    }
  }

  protected setPassword(password: string): void {
    this.password.set(password);
    this.passwordError.set(null);
  }

  protected setTyped(text: string): void {
    this.typed.set(text);
    this.typedError.set(null);
  }

  protected dismiss(): void {
    if (!this.restoring()) {
      this.dismissed.emit();
    }
  }

  protected async restore(): Promise<void> {
    if (!this.canRestore()) {
      return;
    }
    this.restoring.set(true);
    this.failure.set(null);
    const body: Record<string, string> = { confirm: this.typed().trim() };
    if (this.proofKind() === 'password') {
      body['password'] = this.password();
    }
    try {
      const result = await this.tools.post<RestoreResult>(`${this.base()}/${this.backup().id}/restore`, body);
      this.restoring.set(false);
      this.restored.emit(result);
    } catch (error) {
      this.restoring.set(false);
      const failure = this.tools.failure(error);
      if (mayStillRun(failure)) {
        this.lost.emit({ backup: this.backup(), failure });
        return;
      }
      this.refused(failure);
    }
  }

  private refused(failure: AdminFailure): void {
    if (SIGN_IN_AGAIN.includes(failure.code)) {
      this.signInNeeded.set(true);
      return;
    }
    if (WRONG_PASSWORD.includes(failure.code)) {
      this.passwordError.set(this.tools.say(failure));
      return;
    }
    if (failure.code === 'confirm_mismatch') {
      this.typedError.set(this.tools.say(failure));
      return;
    }
    const heading =
      failure.code === 'restore_failed'
        ? 'The restore failed - nothing of it stayed'
        : failure.code === 'before_restore_failed'
          ? 'Nothing was restored'
          : failure.code === 'schema_differs'
            ? 'The schema has changed since this backup'
            : failure.code === 'busy'
              ? 'Something else is running'
              : 'It was not restored';
    this.failure.set({ heading, text: this.tools.say(failure) });
    if (failure.code === 'schema_differs') {
      void this.loadPreview();
    }
  }

  protected rows(count: number): string {
    return counted(count, 'row', 'rows');
  }
}
