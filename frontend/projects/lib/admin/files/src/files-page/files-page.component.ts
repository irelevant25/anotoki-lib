import { HttpClient, HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { AdminQuestionComponent, AdminTools, Questions, counted, formatBytes, formatCount, registerAdminIcons } from '@anotoki/lib/admin/parts';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { ErrorStateComponent } from '@anotoki/lib/ui/error-state';
import { CheckboxComponent, TextFieldComponent } from '@anotoki/lib/ui/forms';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { MenuComponent, MenuItemComponent, MenuTriggerDirective } from '@anotoki/lib/ui/menu';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { PaginationComponent } from '@anotoki/lib/ui/pagination';
import { SegmentedComponent, SegmentedOption } from '@anotoki/lib/ui/segmented';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { TabItem, TabsComponent } from '@anotoki/lib/ui/tabs';
import { FilePreviewComponent } from '../file-preview/file-preview.component';
import { FileEntry, FileRootInfo, FolderEntry, Listing, UploadResult, UploadedFile } from '../models';
import { TrashDialogComponent } from '../trash-dialog/trash-dialog.component';

type View = 'grid' | 'list';

/** A file or a folder being renamed or moved. */
interface Renaming {
  path: string;
  name: string;
  folder: string;
  isFolder: boolean;
}

/**
 * A preview's link is signed for five minutes: a listing older than four is read again before one is opened.
 * (A number as it is: a site's build keeps a top-level sum it is not told is pure.)
 */
const FRESH_MS = 240_000;

const ICONS: Record<string, string> = { image: 'image', audio: 'music', video: 'film', text: 'fileText' };

let nextId = 0;

/**
 * The administrators' file explorer (English): the folders the site names
 * (Anotoki\Lib\Files\FileRoot), as they are on the disk - one tab a folder
 * where there are more; breadcrumbs, a search of the names under the folder,
 * tiles or a list, a page of 120 at a time; "new since the last scan" and
 * Rescan for a folder read from a scan (genshin's 88,000 assets).
 *
 * Where the site lets files be written: upload (the button, or files dropped
 * on the list) - each file checked here first against the folder's
 * extensions and size, then by the server (the name, every part of it; the
 * bytes against the extension), each refusal said beside its file; a new
 * folder; rename or move; delete - a file to the trash, with Undo, a folder
 * only when empty. The trash puts a file back or deletes it for good.
 *
 * A preview shows a file safely (FilePreviewComponent): pictures, sound and
 * video from their signed link, a short text as text; anything else is a
 * download.
 *
 * For the site's ADMIN alone (`isAdmin`); anybody else is told whose page it
 * is, and nothing is asked of the server.
 */
@Component({
  selector: 'anotoki-files-page',
  imports: [
    AdminQuestionComponent,
    AlertComponent,
    ButtonComponent,
    CheckboxComponent,
    DialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    FilePreviewComponent,
    IconComponent,
    MenuComponent,
    MenuItemComponent,
    MenuTriggerDirective,
    PageHeaderComponent,
    PaginationComponent,
    SegmentedComponent,
    SpinnerComponent,
    TabsComponent,
    TextFieldComponent,
    TrashDialogComponent,
  ],
  templateUrl: './files-page.component.html',
  styleUrl: './files-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-files-page', lang: 'en' },
})
export class FilesPageComponent {
  protected readonly tools = inject(AdminTools);
  private readonly http = inject(HttpClient);
  private readonly base = this.tools.base('files');

  protected readonly id = `anotoki-files-${++nextId}`;
  protected readonly formatBytes = formatBytes;
  protected readonly formatCount = formatCount;
  protected readonly questions = new Questions();
  protected readonly views: SegmentedOption[] = [
    { value: 'grid', label: 'Tiles', icon: 'grid' },
    { value: 'list', label: 'List', icon: 'listBullets' },
  ];

  protected readonly roots = signal<FileRootInfo[] | null>(null);
  protected readonly rootsError = signal<string | null>(null);
  /** The folder shown, by its name. */
  protected readonly active = signal('');
  protected readonly root = computed(() => this.roots()?.find((root) => root.name === this.active()) ?? null);
  protected readonly tabs = computed<TabItem[]>(() => (this.roots() ?? []).map((root) => ({ id: root.name, label: root.label })));

  protected readonly path = signal('');
  protected readonly mode = signal<'folder' | 'new'>('folder');
  /** The search applied; what is typed is applied on Enter. */
  protected readonly search = signal('');
  protected readonly searchText = signal('');
  protected readonly page = signal(1);
  protected readonly view = signal<View>('grid');

  protected readonly listing = signal<Listing | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly rescanning = signal(false);
  /** What the last action did, read out - with the way back from a deletion. */
  protected readonly happened = signal('');
  protected readonly undo = signal<{ trashed: string; name: string } | null>(null);
  /** Why the last action on a file was refused (one with no dialog of its own: a deletion, Undo). */
  protected readonly actionError = signal<string | null>(null);

  /** An upload under way: how far, in per cent. */
  protected readonly uploading = signal<number | null>(null);
  protected readonly uploadCount = signal(0);
  protected readonly uploadResult = signal<{ kept: UploadedFile[]; refused: UploadedFile[] } | null>(null);
  protected readonly replace = signal(false);
  protected readonly dragging = signal(false);

  protected readonly previewing = signal<FileEntry | null>(null);
  protected readonly renaming = signal<Renaming | null>(null);
  protected readonly renameName = signal('');
  protected readonly renameFolder = signal('');
  protected readonly renameError = signal<string | null>(null);
  protected readonly renameBusy = signal(false);
  protected readonly makingFolder = signal(false);
  protected readonly folderName = signal('');
  protected readonly folderError = signal<string | null>(null);
  protected readonly folderBusy = signal(false);
  protected readonly trashOpen = signal(false);

  protected readonly crumbs = computed(() => {
    const path = this.path();
    if (path === '') {
      return [] as { name: string; path: string }[];
    }
    const parts = path.split('/');
    return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }));
  });
  protected readonly folders = computed(() => this.listing()?.folders ?? []);
  protected readonly files = computed(() => this.listing()?.files ?? []);
  protected readonly status = computed(() => this.listing()?.status ?? null);
  protected readonly searching = computed(() => this.search() !== '');
  protected readonly writable = computed(() => this.root()?.write === true && this.mode() === 'folder' && !this.searching());

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  /** The folders' tabs, whose ids the panel answers to. */
  protected readonly rootTabs = viewChild(TabsComponent);
  private asked = 0;
  private started = false;
  private listedAt = 0;

  constructor() {
    registerAdminIcons(inject(AnotokiIcons));
    effect(() => {
      if (this.tools.isAdmin() && !this.started) {
        this.started = true;
        untracked(() => void this.loadRoots());
      }
    });
  }

  protected async loadRoots(): Promise<void> {
    this.rootsError.set(null);
    try {
      const answer = await this.tools.get<{ roots?: FileRootInfo[] }>(`${this.base}/roots`);
      const roots = answer?.roots ?? [];
      this.roots.set(roots);
      if (roots.length > 0) {
        this.active.set(roots[0].name);
        await this.load();
      }
    } catch (error) {
      this.rootsError.set(this.tools.say(this.tools.failure(error)));
    }
  }

  protected async load(): Promise<void> {
    const root = this.root();
    if (!root) {
      return;
    }
    const mine = ++this.asked;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const listing = await this.tools.get<Listing>(`${this.base}/${root.name}`, {
        path: this.mode() === 'new' ? null : this.path(),
        search: this.search(),
        page: this.page() > 1 ? this.page() : null,
        mode: this.mode() === 'new' ? 'new' : null,
      });
      if (mine === this.asked) {
        this.listing.set(listing);
        this.listedAt = Date.now();
      }
    } catch (error) {
      if (mine === this.asked) {
        this.loadError.set(this.tools.say(this.tools.failure(error)));
        this.listing.set(null);
      }
    } finally {
      if (mine === this.asked) {
        this.loading.set(false);
      }
    }
  }

  // ── Where ──────────────────────────────────────────────────────────────────

  protected setRoot(name: string): void {
    if (name === this.active()) {
      return;
    }
    this.active.set(name);
    this.go('', 'folder');
  }

  protected openFolder(folder: FolderEntry): void {
    this.go(folder.path, 'folder');
  }

  protected goTo(path: string): void {
    this.go(path, 'folder');
  }

  protected showNew(): void {
    this.go('', 'new');
  }

  protected applySearch(): void {
    const search = this.searchText().trim();
    if (search !== this.search()) {
      this.search.set(search);
      this.page.set(1);
      void this.load();
    }
  }

  protected clearSearch(): void {
    this.searchText.set('');
    this.search.set('');
    this.page.set(1);
    void this.load();
  }

  protected setPage(page: number): void {
    this.page.set(page);
    void this.load();
  }

  private go(path: string, mode: 'folder' | 'new'): void {
    this.actionError.set(null);
    this.path.set(path);
    this.mode.set(mode);
    this.search.set('');
    this.searchText.set('');
    this.page.set(1);
    this.uploadResult.set(null);
    void this.load();
  }

  protected async rescan(): Promise<void> {
    const root = this.root();
    if (!root) {
      return;
    }
    this.rescanning.set(true);
    try {
      const status = await this.tools.post<{ total: number; new_count: number }>(`${this.base}/${root.name}/rescan`);
      this.happened.set(`Scanned: ${counted(status.total, 'file', 'files')}, ${formatCount(status.new_count)} new since the scan before.`);
      this.undo.set(null);
      await this.load();
    } catch (error) {
      this.happened.set('');
      this.loadError.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.rescanning.set(false);
    }
  }

  // ── Showing a file ─────────────────────────────────────────────────────────

  /** A file's preview - from a listing fresh enough that its link is still good. */
  protected async show(file: FileEntry): Promise<void> {
    if (Date.now() - this.listedAt > FRESH_MS) {
      await this.load();
      file = this.files().find((each) => each.path === file.path) ?? file;
    }
    this.previewing.set(file);
  }

  protected iconOf(file: FileEntry): string {
    return ICONS[file.preview] ?? 'file';
  }

  protected link(file: FileEntry): string | null {
    return this.tools.url(file.url);
  }

  // ── Uploading ──────────────────────────────────────────────────────────────

  protected chooseFiles(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void this.upload(files);
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.writable() || !event.dataTransfer?.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    const zone = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node) || !zone.contains(event.relatedTarget)) {
      this.dragging.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    this.dragging.set(false);
    if (!this.writable()) {
      return;
    }
    event.preventDefault();
    void this.upload(Array.from(event.dataTransfer?.files ?? []));
  }

  /**
   * The files into the folder shown: each checked here first (the folder's
   * extensions and its largest size - no bytes sent that would be refused),
   * the rest sent in one request with its progress, each refusal said beside
   * its file in the server's words.
   */
  protected async upload(files: File[]): Promise<void> {
    const root = this.root();
    if (!root || files.length === 0 || this.uploading() !== null) {
      return;
    }
    const refused: UploadedFile[] = [];
    const sent: File[] = [];
    for (const file of files) {
      const refusal = this.refusalOf(file, root);
      if (refusal) {
        refused.push({ name: file.name, stored_as: null, path: null, status: 'refused', code: refusal.code, message: refusal.message });
      } else {
        sent.push(file);
      }
    }
    this.undo.set(null);
    this.happened.set('');
    if (sent.length === 0) {
      this.uploadResult.set({ kept: [], refused });
      return;
    }

    const form = new FormData();
    form.append('path', this.path());
    if (this.replace()) {
      form.append('replace', '1');
    }
    for (const file of sent) {
      form.append('files[]', file, file.name);
    }
    this.uploadCount.set(sent.length);
    this.uploading.set(0);
    try {
      const result = await new Promise<UploadResult>((resolve, reject) => {
        this.http.post<UploadResult>(`${this.base}/${root.name}/upload`, form, { reportProgress: true, observe: 'events' }).subscribe({
          next: (event) => {
            if (event.type === HttpEventType.UploadProgress && event.total) {
              this.uploading.set(Math.min(99, Math.round((event.loaded / event.total) * 100)));
            } else if (event.type === HttpEventType.Response) {
              resolve(event.body ?? { uploaded: 0, refused: 0, files: [] });
            }
          },
          error: reject,
        });
      });
      const kept = result.files.filter((file) => file.status !== 'refused');
      this.uploadResult.set({ kept, refused: [...refused, ...result.files.filter((file) => file.status === 'refused')] });
      await this.load();
    } catch (error) {
      const failure = this.tools.failure(error);
      this.uploadResult.set({
        kept: [],
        refused: [...refused, ...sent.map((file) => ({ name: file.name, stored_as: null, path: null, status: 'refused' as const, code: failure.code, message: this.tools.say(failure) }))],
      });
    } finally {
      this.uploading.set(null);
    }
  }

  /** What the server would refuse anyway, known before a byte is sent. */
  private refusalOf(file: File, root: FileRootInfo): { code: string; message: string } | null {
    const dot = file.name.lastIndexOf('.');
    const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
    if (!root.extensions.includes(extension)) {
      return { code: 'extension_not_allowed', message: `This folder takes only ${root.extensions.join(', ')} files.` };
    }
    if (file.size > root.max_bytes) {
      return { code: 'too_large', message: `It is ${formatBytes(file.size)}; this folder takes files of ${formatBytes(root.max_bytes)} at most.` };
    }
    return null;
  }

  // ── Writing ────────────────────────────────────────────────────────────────

  protected askToRename(entry: FileEntry | FolderEntry, isFolder: boolean): void {
    const folder = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    this.renameName.set(entry.name);
    this.renameFolder.set(folder);
    this.renameError.set(null);
    this.renaming.set({ path: entry.path, name: entry.name, folder, isFolder });
  }

  protected closeRename(): void {
    if (!this.renameBusy()) {
      this.renaming.set(null);
    }
  }

  protected async rename(): Promise<void> {
    const renaming = this.renaming();
    const root = this.root();
    const name = this.renameName().trim();
    const folder = this.renameFolder()
      .trim()
      .replace(/^\/+|\/+$/g, '');
    if (!renaming || !root || name === '') {
      return;
    }
    const to = folder ? `${folder}/${name}` : name;
    if (to === renaming.path) {
      this.renaming.set(null);
      return;
    }
    this.renameBusy.set(true);
    this.renameError.set(null);
    try {
      const answer = await this.tools.post<{ from: string; to: string; op: string }>(`${this.base}/${root.name}/move`, { from: renaming.path, to });
      this.renaming.set(null);
      this.undo.set(null);
      this.happened.set(answer.op === 'rename' ? `${renaming.name} is ${answer.to.split('/').pop()} now.` : `${renaming.name} moved to ${answer.to}.`);
      await this.load();
    } catch (error) {
      this.renameError.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.renameBusy.set(false);
    }
  }

  protected askForFolder(): void {
    this.folderName.set('');
    this.folderError.set(null);
    this.makingFolder.set(true);
  }

  protected closeFolder(): void {
    if (!this.folderBusy()) {
      this.makingFolder.set(false);
    }
  }

  protected async makeFolder(): Promise<void> {
    const root = this.root();
    const name = this.folderName().trim();
    if (!root || name === '') {
      return;
    }
    this.folderBusy.set(true);
    this.folderError.set(null);
    try {
      const answer = await this.tools.post<{ path: string }>(`${this.base}/${root.name}/folder`, { path: this.path() ? `${this.path()}/${name}` : name });
      this.makingFolder.set(false);
      this.undo.set(null);
      this.happened.set(`The folder ${answer.path} is made.`);
      await this.load();
    } catch (error) {
      this.folderError.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.folderBusy.set(false);
    }
  }

  protected async askToDelete(entry: FileEntry | FolderEntry, isFolder: boolean): Promise<void> {
    const root = this.root();
    if (!root) {
      return;
    }
    this.actionError.set(null);
    const yes = await this.questions.ask(
      isFolder
        ? { title: `Delete the folder ${entry.name}?`, message: 'Only an empty folder is deleted: move or delete what it holds first.', confirmLabel: 'Delete the folder', tone: 'danger' }
        : { title: `Move ${entry.name} to the trash?`, message: 'It is gone from the site at once; from the trash it can be put back.', confirmLabel: 'Move to the trash', tone: 'danger' },
    );
    if (!yes) {
      return;
    }
    try {
      const answer = await this.tools.delete<{ path: string; trashed: string | null }>(`${this.base}/${root.name}`, { path: entry.path });
      this.undo.set(answer.trashed ? { trashed: answer.trashed, name: entry.name } : null);
      this.happened.set(answer.trashed ? `${entry.name} is in the trash.` : `The folder ${entry.name} is deleted.`);
      await this.load();
    } catch (error) {
      this.undo.set(null);
      this.happened.set('');
      this.actionError.set(`${entry.name} was not deleted: ${this.tools.say(this.tools.failure(error))}`);
    }
  }

  /** The last file deleted, back where it was. */
  protected async undoDelete(): Promise<void> {
    const undo = this.undo();
    const root = this.root();
    if (!undo || !root) {
      return;
    }
    try {
      const answer = await this.tools.post<{ path: string }>(`${this.base}/${root.name}/trash/restore`, { trashed: undo.trashed });
      this.undo.set(null);
      this.happened.set(`${undo.name} is back: ${answer.path}.`);
      await this.load();
    } catch (error) {
      this.undo.set(null);
      this.happened.set('');
      this.actionError.set(`${undo.name} could not be put back: ${this.tools.say(this.tools.failure(error))}`);
    }
  }

  protected onRestored(path: string): void {
    this.undo.set(null);
    this.happened.set(`${path.split('/').pop()} is back: ${path}.`);
    void this.load();
  }

  protected trashBase(): string {
    return `${this.base}/${this.root()?.name ?? ''}`;
  }
}
