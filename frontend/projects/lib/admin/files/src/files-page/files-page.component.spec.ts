import { HttpEventType } from '@angular/common/http';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnotokiAdminConfig } from '@anotoki/lib/admin';
import { AdminSite, adminProviders, adminSite, click, draw, press, refuse, settle, type, words } from '../../../parts/src/testing';
import { FileEntry, FileRootInfo, Listing, TrashItem } from '../models';
import { FilesPageComponent } from './files-page.component';

const BASE = '/api/admin/files';

const ASSETS: FileRootInfo = { name: 'assets', label: 'Assets', write: true, extensions: ['png', 'jpg', 'ogg', 'txt'], max_bytes: 1000, snapshot: true };
const LOGS: FileRootInfo = { name: 'logs', label: 'Old logs', write: false, extensions: [], max_bytes: 52_428_800, snapshot: false };

function file(name: string, overrides: Partial<FileEntry> = {}): FileEntry {
  const extension = name.split('.').pop() ?? '';
  const preview = ({ png: 'image', jpg: 'image', ogg: 'audio', mp4: 'video', txt: 'text' } as Record<string, FileEntry['preview']>)[extension] ?? 'download';
  const folder = overrides.folder ?? 'Characters';
  const path = folder ? `${folder}/${name}` : name;
  return { name, path, folder, extension, size: 2048, modified: '2026-10-09T10:00:00Z', preview, url: `${BASE}/raw?root=assets&path=${encodeURIComponent(path)}&exp=1&sig=abc`, ...overrides };
}

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    root: 'assets',
    path: '',
    search: '',
    mode: 'folder',
    folders: [
      { name: 'Characters', path: 'Characters', files: 3 },
      { name: 'Music', path: 'Music', files: 1 },
    ],
    files: [file('banner.png', { folder: '' }), file('notes.txt', { folder: '' }), file('map.pdf', { folder: '' })],
    total: 3,
    page: 1,
    pageSize: 120,
    status: { scanned_at: '2026-10-10T08:00:00Z', previous_scanned_at: '2026-10-01T08:00:00Z', total: 88_123, new_count: 3 },
    ...overrides,
  };
}

describe("<anotoki-files-page>: the site's folders - browsed, uploaded into, renamed, trashed and shown", () => {
  let site: AdminSite;
  let http: HttpTestingController;
  let fixture: ComponentFixture<FilesPageComponent>;
  let host: HTMLElement;

  function setUp(config: Partial<AnotokiAdminConfig> = {}): void {
    site = adminSite();
    TestBed.configureTestingModule({ providers: adminProviders(site, config) });
    http = TestBed.inject(HttpTestingController);
  }

  function listRequest(root = 'assets'): TestRequest {
    return http.expectOne((request) => request.method === 'GET' && request.url === `${BASE}/${root}`, `GET the folder of ${root}`);
  }

  async function open(roots: FileRootInfo[] = [ASSETS, LOGS], answer: Listing = listing()): Promise<TestRequest> {
    fixture = await draw(FilesPageComponent);
    host = fixture.nativeElement;
    http.expectOne(`${BASE}/roots`).flush({ roots });
    await settle(fixture);
    const request = listRequest(roots[0].name);
    request.flush(answer);
    await settle(fixture);
    return request;
  }

  /** The next listing, answered. */
  async function next(answer: Listing = listing(), root = 'assets'): Promise<TestRequest> {
    await settle(fixture);
    const request = listRequest(root);
    request.flush(answer);
    await settle(fixture);
    return request;
  }

  /** Opens a tile's menu and chooses an item. */
  async function choose(tile: Element, item: string): Promise<void> {
    click(tile.querySelector('[aria-label^="What to do with"]'));
    await settle(fixture);
    click(tile.querySelector(`anotoki-menu [${item}]`));
    await settle(fixture);
  }

  const tiles = () => Array.from(host.querySelectorAll<HTMLElement>('[data-grid] > li'));
  const tile = (path: string) => host.querySelector<HTMLElement>(`[data-grid] [data-file="${path}"], [data-grid] [data-folder="${path}"]`)!;
  const dialog = (name: string) => host.querySelector<HTMLDialogElement>(`anotoki-dialog[${name}] dialog`);
  const question = () => dialog('data-question');

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it('is for the ADMIN alone: anybody else is told whose it is, and nothing is asked', async () => {
    setUp();
    site.admin.set(false);
    fixture = await draw(FilesPageComponent);
    host = fixture.nativeElement;
    expect(words(host)).toBe('The files are for the administrators of the site.');
    http.expectNone(() => true);
  });

  it('shows the first folder: its folders, then its files - with the scan it is read from', async () => {
    setUp();
    const request = await open();

    expect(request.request.params.keys()).toEqual([]);
    expect(Array.from(host.querySelectorAll('[data-roots] [role="tab"]')).map((tab) => words(tab))).toEqual(['Assets', 'Old logs']);
    const panel = host.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(host.querySelector('[role="tab"][aria-selected="true"]')!.id);
    expect(words(host.querySelector('[data-scan]'))).toMatch(/^Scanned .+ 88,123 files$/);
    expect(tiles().map((each) => words(each.querySelector('button')))).toEqual(['Characters 3 files', 'Music 1 file', 'banner.png 2 KB', 'notes.txt 2 KB', 'map.pdf 2 KB']);
    expect(tile('banner.png').querySelector('img')?.getAttribute('src')).toBe(file('banner.png', { folder: '' }).url);
    expect(words(host.querySelector('[data-show-new]'))).toBe('3 new since the last scan');
    expect(words(host.querySelector('[data-crumbs]'))).toBe('Assets');
  });

  it('goes into a folder and back by its breadcrumbs, searches the names, and shows what is new', async () => {
    setUp();
    await open();

    click(tile('Characters').querySelector('[data-open-folder]'));
    let request = await next(listing({ path: 'Characters', folders: [], files: [file('amber.png')], total: 1 }));
    expect(request.request.params.get('path')).toBe('Characters');
    expect(words(host.querySelector('[data-crumbs]'))).toBe('Assets Characters');
    expect(host.querySelector('[data-crumbs] [aria-current="page"]')?.textContent?.trim()).toBe('Characters');

    type(host.querySelector('[data-search] input'), ' amb ');
    host.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit', { cancelable: true }));
    request = await next(listing({ path: 'Characters', search: 'amb', mode: 'search', folders: [], files: [file('amber.png')], total: 1 }));
    expect([request.request.params.get('path'), request.request.params.get('search')]).toEqual(['Characters', 'amb']);
    expect(words(host.querySelector('[data-search-meta]'))).toBe('1 name with "amb" Show the folder');

    click(host.querySelector('[data-crumbs] button'));
    request = await next();
    expect(request.request.params.keys()).toEqual([]);

    click(host.querySelector('[data-show-new]'));
    request = await next(listing({ mode: 'new', folders: [], files: [file('new.png', { folder: 'Weapons' })], total: 1 }));
    expect(request.request.params.get('mode')).toBe('new');
    expect(words(tile('Weapons/new.png').querySelector('button'))).toBe('new.png 2 KB · Weapons');
    click(host.querySelector('[data-back]'));
    await next();
  });

  it('switches between folders by their tabs, a read-only one offering nothing to write', async () => {
    setUp();
    await open();

    click(host.querySelectorAll<HTMLElement>('[data-roots] [role="tab"]')[1]);
    await next(
      listing({
        root: 'logs',
        folders: [],
        files: [file('2026-10-01.log', { folder: '', preview: 'download' })],
        total: 1,
        status: { scanned_at: null, previous_scanned_at: null, total: 0, new_count: 0 },
      }),
      'logs',
    );
    expect(host.querySelector('[data-read-only]')).not.toBeNull();
    expect(host.querySelector('[data-upload]')).toBeNull();
    expect(host.querySelector('[data-rescan]')).toBeNull();
    expect(host.querySelector('[data-open-trash]')).toBeNull();

    await choose(tile('2026-10-01.log'), 'data-show');
    expect(words(dialog('data-preview')!.querySelector('[data-no-preview]'))).toBe('.log files are not shown here: it is downloaded as it is.');
    click(dialog('data-preview')!.querySelector('[data-close]'));
    await settle(fixture);
    expect(dialog('data-preview')).toBeNull();
  });

  it('rescans a folder read from a scan', async () => {
    setUp();
    await open();

    click(host.querySelector('[data-rescan]'));
    await settle(fixture);
    http.expectOne(`${BASE}/assets/rescan`).flush({ scanned_at: '2026-10-11T08:00:00Z', previous_scanned_at: '2026-10-10T08:00:00Z', total: 88_130, new_count: 7 });
    await next();
    expect(words(host.querySelector('[data-happened]'))).toBe('Scanned: 88,130 files, 7 new since the scan before.');
  });

  it('uploads: what the folder cannot take refused here, the rest sent with its progress, each refusal said', async () => {
    setUp();
    await open();

    const input = host.querySelector<HTMLInputElement>('[data-file-input]')!;
    expect(input.getAttribute('accept')).toBe('.png,.jpg,.ogg,.txt');
    click(host.querySelector('[data-replace] input'));
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['png'], 'amber.png'), new File(['x'], 'setup.exe'), new File(['x'.repeat(2000)], 'huge.jpg'), new File(['png'], 'shell.php.png')],
    });
    input.dispatchEvent(new Event('change'));
    await settle(fixture);

    const request = http.expectOne(`${BASE}/assets/upload`);
    const form = request.request.body as FormData;
    expect([form.get('path'), form.get('replace')]).toEqual(['', '1']);
    expect(form.getAll('files[]').map((sent) => (sent as File).name)).toEqual(['amber.png', 'shell.php.png']);
    request.event({ type: HttpEventType.UploadProgress, loaded: 40, total: 100 });
    await settle(fixture);
    expect(words(host.querySelector('[data-progress]'))).toBe('Uploading 2 files… 40%');
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40');

    request.flush({
      uploaded: 1,
      refused: 1,
      files: [
        { name: 'amber.png', stored_as: 'amber.png', path: 'amber.png', status: 'replaced', size: 3 },
        {
          name: 'shell.php.png',
          stored_as: null,
          path: null,
          status: 'refused',
          code: 'name_runs_on_server',
          message: 'A part of that name could run as a script on the web server, so it is not taken.',
        },
      ],
    });
    await next();
    const result = host.querySelector('[data-upload-result]')!;
    expect(words(result.querySelector('.anotoki-alert__heading'))).toBe('1 uploaded, 3 refused');
    expect(Array.from(result.querySelectorAll('[data-refused] li')).map((item) => words(item))).toEqual([
      'setup.exe - This folder takes only png, jpg, ogg, txt files.',
      'huge.jpg - It is 2 KB; this folder takes files of 1000 B at most.',
      'shell.php.png - A part of that name could run as a script on the web server, so it is not taken.',
    ]);
    expect(host.querySelector('[data-progress]')).toBeNull();
  });

  it('takes files dropped on the folder', async () => {
    setUp();
    await open();

    const zone = host.querySelector<HTMLElement>('.anotoki-files-page__explorer')!;
    const over = new Event('dragover', { cancelable: true, bubbles: true });
    Object.defineProperty(over, 'dataTransfer', { value: { types: ['Files'], dropEffect: 'none' } });
    zone.dispatchEvent(over);
    await settle(fixture);
    expect(over.defaultPrevented).toBe(true);
    expect(zone.classList).toContain('anotoki-files-page__explorer--dragging');

    const drop = new Event('drop', { cancelable: true, bubbles: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [new File(['o'], 'theme.ogg')] } });
    zone.dispatchEvent(drop);
    await settle(fixture);
    const request = http.expectOne(`${BASE}/assets/upload`);
    expect((request.request.body as FormData).has('replace')).toBe(false);
    request.flush({ uploaded: 1, refused: 0, files: [{ name: 'theme.ogg', stored_as: 'theme.ogg', path: 'theme.ogg', status: 'uploaded', size: 1 }] });
    await next();
    expect(words(host.querySelector('[data-upload-result] .anotoki-alert__heading'))).toBe('1 uploaded');
    expect(zone.classList).not.toContain('anotoki-files-page__explorer--dragging');
  });

  it("renames or moves a file - the server's refusal beside the name", async () => {
    setUp();
    await open();

    await choose(tile('banner.png'), 'data-rename');
    expect(dialog('data-rename-dialog')?.open).toBe(true);
    expect(host.querySelector<HTMLInputElement>('[data-rename-name] input')!.value).toBe('banner.png');
    expect(document.activeElement).toBe(host.querySelector('[data-rename-name] input'));
    type(host.querySelector('[data-rename-name] input'), 'notes.txt');
    await settle(fixture);
    click(host.querySelector('[data-rename-save]'));
    await settle(fixture);
    let request = http.expectOne(`${BASE}/assets/move`);
    expect(request.request.body).toEqual({ from: 'banner.png', to: 'notes.txt' });
    refuse(request, 409, 'exists', 'Something of that name is there already.');
    await settle(fixture);
    expect(words(host.querySelector('[data-rename-name] .anotoki-field__error'))).toBe('Something of that name is there already.');

    type(host.querySelector('[data-rename-name] input'), 'banner-2026.png');
    type(host.querySelector('[data-rename-folder] input'), '/Banners/');
    await settle(fixture);
    click(host.querySelector('[data-rename-save]'));
    await settle(fixture);
    request = http.expectOne(`${BASE}/assets/move`);
    expect(request.request.body).toEqual({ from: 'banner.png', to: 'Banners/banner-2026.png' });
    request.flush({ from: 'banner.png', to: 'Banners/banner-2026.png', op: 'move' });
    await next();
    expect(dialog('data-rename-dialog')).toBeNull();
    expect(words(host.querySelector('[data-happened]'))).toBe('banner.png moved to Banners/banner-2026.png.');
  });

  it('moves a file to the trash after a question, and Undo puts it back', async () => {
    setUp();
    await open();

    await choose(tile('notes.txt'), 'data-delete');
    expect(words(question()!.querySelector('.anotoki-dialog__title'))).toBe('Move notes.txt to the trash?');
    expect(document.activeElement?.hasAttribute('data-question-no')).toBe(true);
    press(question()!, 'Escape');
    await settle(fixture);
    http.expectNone((r) => r.method === 'DELETE');

    await choose(tile('notes.txt'), 'data-delete');
    click(question()!.querySelector('[data-question-yes]'));
    await settle(fixture);
    const request = http.expectOne((r) => r.method === 'DELETE' && r.url === `${BASE}/assets`);
    expect(request.request.params.get('path')).toBe('notes.txt');
    request.flush({ path: 'notes.txt', trashed: '20261011-090000__notes.txt' });
    await next();
    expect(words(host.querySelector('[data-happened]'))).toBe('notes.txt is in the trash. Undo');

    click(host.querySelector('[data-undo]'));
    await settle(fixture);
    const undo = http.expectOne(`${BASE}/assets/trash/restore`);
    expect(undo.request.body).toEqual({ trashed: '20261011-090000__notes.txt' });
    undo.flush({ path: 'notes.txt' });
    await next();
    expect(words(host.querySelector('[data-happened]'))).toBe('notes.txt is back: notes.txt.');
  });

  it('says why a folder was not deleted, and makes a new one where it is', async () => {
    setUp();
    await open();

    await choose(tile('Music'), 'data-delete');
    click(question()!.querySelector('[data-question-yes]'));
    await settle(fixture);
    refuse(
      http.expectOne((r) => r.method === 'DELETE'),
      409,
      'folder_not_empty',
      'Only an empty folder is deleted: move or delete what it holds first.',
    );
    await settle(fixture);
    expect(words(host.querySelector('[data-action-error]'))).toBe('Music was not deleted: Only an empty folder is deleted: move or delete what it holds first.');

    click(host.querySelector('[data-new-folder]'));
    await settle(fixture);
    type(host.querySelector('[data-folder-name] input'), 'Banners');
    await settle(fixture);
    host.querySelector('anotoki-dialog[data-folder-dialog] form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
    const request = http.expectOne(`${BASE}/assets/folder`);
    expect(request.request.body).toEqual({ path: 'Banners' });
    request.flush({ path: 'Banners' }, { status: 201, statusText: 'Created' });
    await next();
    expect(words(host.querySelector('[data-happened]'))).toBe('The folder Banners is made.');
  });

  it('shows a picture, a sound and a text safely - only from a link that is a path of the site', async () => {
    setUp({ resolveUrl: (path) => `https://assets.example.test${path}` });
    await open(
      [ASSETS],
      listing({
        folders: [],
        files: [file('banner.png', { folder: '' }), file('theme.ogg', { folder: '' }), file('notes.txt', { folder: '' }), file('evil.png', { folder: '', url: 'javascript:alert(1)' })],
      }),
    );

    click(tile('banner.png').querySelector('[data-open-file]'));
    await settle(fixture);
    const image = dialog('data-preview')!.querySelector<HTMLImageElement>('[data-image]')!;
    expect(image.getAttribute('src')).toBe(`https://assets.example.test${file('banner.png', { folder: '' }).url}`);
    expect(words(dialog('data-preview')!.querySelector('[data-fit]'))).toBe('Its own size');
    click(dialog('data-preview')!.querySelector('[data-fit]'));
    await settle(fixture);
    expect(host.querySelector('[data-stage]')?.classList).toContain('anotoki-file-preview__stage--actual');
    press(dialog('data-preview')!, 'Escape');
    await settle(fixture);

    click(tile('theme.ogg').querySelector('[data-open-file]'));
    await settle(fixture);
    expect(dialog('data-preview')!.querySelector('[data-audio]')?.getAttribute('src')).toBe(`https://assets.example.test${file('theme.ogg', { folder: '' }).url}`);
    press(dialog('data-preview')!, 'Escape');
    await settle(fixture);

    click(tile('notes.txt').querySelector('[data-open-file]'));
    await settle(fixture);
    const text = http.expectOne(`https://assets.example.test${file('notes.txt', { folder: '' }).url}`);
    expect(text.request.responseType).toBe('text');
    text.flush('<b>not markup</b>\nline two');
    await settle(fixture);
    expect(dialog('data-preview')!.querySelector('[data-text]')?.textContent).toBe('<b>not markup</b>\nline two');
    expect(dialog('data-preview')!.querySelector('[data-text] b')).toBeNull();
    press(dialog('data-preview')!, 'Escape');
    await settle(fixture);

    expect(tile('evil.png').querySelector('img')).toBeNull();
    click(tile('evil.png').querySelector('[data-open-file]'));
    await settle(fixture);
    expect(words(dialog('data-preview')!.querySelector('[data-stage]'))).toBe('The server gave no link this page can open.');
    expect(dialog('data-preview')!.querySelector('[data-download]')).toBeNull();
  });

  it('keeps a trash: a file put back, one deleted for good, all of it emptied - each after a question', async () => {
    setUp();
    await open();
    const items: TrashItem[] = [
      { trashed: 'Characters/20261011-090000__amber.png', folder: 'Characters', name: 'amber.png', deleted_at: '2026-10-11T09:00:00Z', size: 2048 },
      { trashed: '20261010-080000__old.txt', folder: '', name: 'old.txt', deleted_at: '2026-10-10T08:00:00Z', size: 10 },
    ];

    click(host.querySelector('[data-open-trash]'));
    await settle(fixture);
    http.expectOne(`${BASE}/assets/trash`).flush({ items });
    await settle(fixture);
    const trash = () => dialog('data-trash')!;
    expect(Array.from(trash().querySelectorAll('[data-trash-items] li')).map((item) => words(item.querySelector('.anotoki-file-trash__what')))).toEqual([
      expect.stringMatching(/^amber\.png Characters · 2 KB · deleted /),
      expect.stringMatching(/^old\.txt the top folder · 10 B · deleted /),
    ]);

    click(trash().querySelector('[data-trashed="Characters/20261011-090000__amber.png"] [data-put-back]'));
    await settle(fixture);
    const back = http.expectOne(`${BASE}/assets/trash/restore`);
    expect(back.request.body).toEqual({ trashed: 'Characters/20261011-090000__amber.png' });
    back.flush({ path: 'Characters/amber.png' });
    await next();
    expect(words(trash().querySelector('[data-trash-happened]'))).toBe('amber.png is back in Characters.');
    expect(trash().querySelectorAll('[data-trash-items] li')).toHaveLength(1);
    expect(words(host.querySelector('[data-happened]'))).toBe('amber.png is back: Characters/amber.png.');

    click(trash().querySelector('[data-delete-for-good]'));
    await settle(fixture);
    expect(words(question()!.querySelector('.anotoki-dialog__title'))).toBe('Delete old.txt for good?');
    click(question()!.querySelector('[data-question-yes]'));
    await settle(fixture);
    const gone = http.expectOne((r) => r.method === 'DELETE' && r.url === `${BASE}/assets/trash`);
    expect(gone.request.params.get('trashed')).toBe('20261010-080000__old.txt');
    gone.flush({ deleted: 1, bytes: 10, failed: 0 });
    await settle(fixture);
    expect(words(trash().querySelector('[data-trash-empty]'))).toContain('The trash is empty');

    click(trash().querySelector('[data-trash-close]'));
    await settle(fixture);
    expect(dialog('data-trash')).toBeNull();
  });

  it('empties the whole trash after a question naming what goes', async () => {
    setUp();
    await open();
    click(host.querySelector('[data-open-trash]'));
    await settle(fixture);
    http.expectOne(`${BASE}/assets/trash`).flush({ items: [{ trashed: '20261010-080000__old.txt', folder: '', name: 'old.txt', deleted_at: null, size: 2048 }] });
    await settle(fixture);

    click(host.querySelector('[data-empty-trash]'));
    await settle(fixture);
    expect(words(question()!.querySelector('.anotoki-dialog__description'))).toBe('1 file goes for good (2 KB) - there is no undo.');
    click(question()!.querySelector('[data-question-yes]'));
    await settle(fixture);
    const request = http.expectOne((r) => r.method === 'DELETE' && r.url === `${BASE}/assets/trash`);
    expect(request.request.params.has('trashed')).toBe(false);
    request.flush({ deleted: 1, bytes: 2048, failed: 0 });
    await settle(fixture);
    http.expectOne(`${BASE}/assets/trash`).flush({ items: [] });
    await settle(fixture);
    expect(words(dialog('data-trash')!.querySelector('[data-trash-happened]'))).toBe('The trash is empty: 1 file, 2 KB.');
  });

  it('lists in a table on asking, and says why a folder could not be read', async () => {
    setUp();
    await open([ASSETS]);

    click(host.querySelector('[data-view] [data-value="list"]'));
    await settle(fixture);
    const rows = Array.from(host.querySelectorAll<HTMLTableRowElement>('[data-list] tbody tr'));
    expect(
      rows.map((row) =>
        Array.from(row.cells)
          .slice(0, 4)
          .map((cell) => words(cell)),
      ),
    ).toEqual([
      ['Characters', 'Folder', '-', '3 files'],
      ['Music', 'Folder', '-', '1 file'],
      ['banner.png', 'PNG', expect.any(String), '2 KB'],
      ['notes.txt', 'TXT', expect.any(String), '2 KB'],
      ['map.pdf', 'PDF', expect.any(String), '2 KB'],
    ]);

    click(rows[0].querySelector('[data-open-folder]'));
    await settle(fixture);
    refuse(listRequest(), 404, 'not_found', 'There is no such file or folder.');
    await settle(fixture);
    expect(words(host.querySelector('anotoki-error-state'))).toContain('There is no such file or folder.');
    click(host.querySelector('anotoki-error-state button'));
    await next();
    expect(host.querySelectorAll('[data-list] tbody tr')).toHaveLength(5);
  });
});
