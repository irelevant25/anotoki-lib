import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AdminQuestionComponent, AdminTools, Questions, counted, formatBytes } from '@anotoki/lib/admin/parts';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { FileRootInfo, TrashItem } from '../models';

/**
 * A folder's trash: what was deleted, the last first - each put back where it
 * was (its folder made again if it went; never over a file of that name, never
 * a name a server could run), deleted for good, or all of it emptied, after a
 * question. Every one of these is audited by the PHP half.
 */
@Component({
  selector: 'anotoki-file-trash',
  imports: [AdminQuestionComponent, ButtonComponent, DialogComponent, EmptyStateComponent, IconComponent, SpinnerComponent],
  templateUrl: './trash-dialog.component.html',
  styleUrl: './trash-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-file-trash' },
})
export class TrashDialogComponent {
  protected readonly tools = inject(AdminTools);

  readonly root = input.required<FileRootInfo>();
  /** The root's routes: '/api/admin/files/assets'. */
  readonly base = input.required<string>();
  readonly dismissed = output<void>();
  /** A file came back: the folder's listing is read again. */
  readonly restored = output<string>();

  protected readonly formatBytes = formatBytes;
  protected readonly questions = new Questions();
  protected readonly items = signal<TrashItem[] | null>(null);
  protected readonly error = signal<string | null>(null);
  /** The item being put back or deleted ('*' for all of it). */
  protected readonly busy = signal<string | null>(null);
  protected readonly happened = signal('');
  protected readonly total = computed(() => (this.items() ?? []).reduce((sum, item) => sum + item.size, 0));

  constructor() {
    let asked = false;
    effect(() => {
      if (this.base() && !asked) {
        asked = true;
        untracked(() => void this.load());
      }
    });
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const answer = await this.tools.get<{ items?: TrashItem[] }>(`${this.base()}/trash`);
      this.items.set(answer?.items ?? []);
    } catch (error) {
      this.error.set(this.tools.say(this.tools.failure(error)));
    }
  }

  protected async putBack(item: TrashItem): Promise<void> {
    this.busy.set(item.trashed);
    this.error.set(null);
    try {
      const answer = await this.tools.post<{ path: string }>(`${this.base()}/trash/restore`, { trashed: item.trashed });
      this.items.update((items) => (items ?? []).filter((each) => each.trashed !== item.trashed));
      this.happened.set(`${item.name} is back in ${answer.path.includes('/') ? answer.path.slice(0, answer.path.lastIndexOf('/')) : 'the top folder'}.`);
      this.restored.emit(answer.path);
    } catch (error) {
      this.error.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.busy.set(null);
    }
  }

  protected async deleteForGood(item: TrashItem): Promise<void> {
    const yes = await this.questions.ask({
      title: `Delete ${item.name} for good?`,
      message: 'It goes from the trash, and from the disk - there is no undo.',
      confirmLabel: 'Delete for good',
      tone: 'danger',
    });
    if (!yes) {
      return;
    }
    await this.remove(item.trashed, () => this.items.update((items) => (items ?? []).filter((each) => each.trashed !== item.trashed)), `${item.name} is deleted for good.`);
  }

  protected async empty(): Promise<void> {
    const items = this.items() ?? [];
    const yes = await this.questions.ask({
      title: 'Empty the trash?',
      message: `${counted(items.length, 'file goes', 'files go')} for good (${formatBytes(this.total())}) - there is no undo.`,
      confirmLabel: 'Empty the trash',
      tone: 'danger',
    });
    if (!yes) {
      return;
    }
    await this.remove('*', () => void this.load(), null);
  }

  private async remove(trashed: string, after: () => void, said: string | null): Promise<void> {
    this.busy.set(trashed);
    this.error.set(null);
    try {
      const answer = await this.tools.delete<{ deleted: number; bytes: number; failed: number }>(`${this.base()}/trash`, { trashed: trashed === '*' ? null : trashed });
      after();
      this.happened.set(
        said ??
          (answer.failed > 0
            ? `${counted(answer.deleted, 'file', 'files')} deleted for good; ${answer.failed} could not be.`
            : `The trash is empty: ${counted(answer.deleted, 'file', 'files')}, ${formatBytes(answer.bytes)}.`),
      );
    } catch (error) {
      this.error.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.busy.set(null);
    }
  }
}
