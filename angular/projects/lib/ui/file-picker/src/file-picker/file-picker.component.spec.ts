import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { accepts, writtenSize } from '../files';
import { FilePickerComponent } from './file-picker.component';

@Component({
  selector: 'anotoki-test-file-pickers',
  imports: [FilePickerComponent],
  template: `
    <anotoki-file-picker id="export" label="Export" accept=".json,application/json" [maxSize]="1024" [(files)]="export" hint="A JSON file, 1 kB at most" [disabled]="disabled()" />
    <anotoki-file-picker id="pictures" label="Pictures" accept="image/*" multiple [(files)]="pictures" [error]="error()" />
  `,
})
class FilePickersPageComponent {
  readonly export = signal<readonly File[]>([]);
  readonly pictures = signal<readonly File[]>([]);
  readonly disabled = signal(false);
  readonly error = signal<string | null>(null);
}

const file = (name: string, size: number, type = '', lastModified = 1) => new File([new Uint8Array(size)], name, { type, lastModified });

describe('<anotoki-file-picker>: files chosen with a button or dropped, checked in the browser, never uploaded', () => {
  let host: HTMLElement;
  let page: FilePickersPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<FilePickersPageComponent>>>;

  async function setUp(config?: () => AnotokiUiConfig): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    fixture = await draw(FilePickersPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  }

  afterEach(() => host?.remove());

  const picker = (id = 'export') => host.querySelector<HTMLElement>('#' + id)!;
  const area = (id = 'export') => picker(id).querySelector<HTMLElement>('.anotoki-file-picker__area')!;
  const button = (id = 'export') => picker(id).querySelector<HTMLButtonElement>('.anotoki-file-picker__choose')!;
  const native = (id = 'export') => picker(id).querySelector<HTMLInputElement>('input[type="file"]')!;
  const removes = (id = 'export') => Array.from(picker(id).querySelectorAll<HTMLButtonElement>('.anotoki-file-picker__remove'));
  const listed = (id = 'export') => Array.from(picker(id).querySelectorAll('.anotoki-file-picker__file')).map((line) => words(line));
  const refused = (id = 'export') => Array.from(picker(id).querySelectorAll('.anotoki-file-picker__refused .anotoki-field__error')).map((line) => words(line));
  const told = (id = 'export') => words(picker(id).querySelector('[aria-live="polite"]'));

  /** The device's chooser answering with these files. */
  const choose = async (files: File[], id = 'export') => {
    Object.defineProperty(native(id), 'files', { value: files, configurable: true });
    native(id).dispatchEvent(new Event('change'));
    await settle(fixture);
  };
  /** A drag of these files over the area and its drop. */
  const drag = (type: string, files: File[] = [], id = 'export') => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } });
    area(id).dispatchEvent(event);
    return event;
  };

  it('reads `accept` as the browser does, and writes a size the page’s way', () => {
    expect(accepts(file('a.JSON', 1), '.json')).toBe(true);
    expect(accepts(file('a.txt', 1, 'application/json'), '.json, application/json')).toBe(true);
    expect(accepts(file('a.png', 1, 'image/png'), 'image/*')).toBe(true);
    expect(accepts(file('a.png', 1, 'image/png'), '.json,application/json')).toBe(false);
    expect(accepts(file('a.exe', 1), '')).toBe(true);
    expect(writtenSize(512, 'en')).toBe('512 bytes');
    expect(writtenSize(1536, 'en')).toBe('1.5 kB');
    expect(writtenSize(20 * 1024 * 1024, 'sk')).toBe('20 MB');
  });

  it('a named group round a real button that opens the device’s chooser (the kinds offered), its hint tied to the button', async () => {
    await setUp();
    expect(area().getAttribute('role')).toBe('group');
    expect(words(document.getElementById(area().getAttribute('aria-labelledby')!))).toBe('Export');
    expect(button().tagName).toBe('BUTTON');
    expect(button().getAttribute('type')).toBe('button');
    expect(words(button())).toBe('Choose a file');
    expect(words(document.getElementById(button().getAttribute('aria-describedby')!))).toBe('A JSON file, 1 kB at most');
    expect(words(area().querySelector('.anotoki-file-picker__drop'))).toBe('Drop a file here');
    expect(native().accept).toBe('.json,application/json');
    expect(native().multiple).toBe(false);
    expect(words(button('pictures'))).toBe('Choose files');
    expect(native('pictures').multiple).toBe(true);
    const opened = vi.spyOn(native(), 'click').mockImplementation(() => undefined);
    button().click();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(AnotokiIcons).has('upload')).toBe(true);
  });

  it('a file chosen: listed with its size and a remove button named with it, the screen reader told; the chooser emptied for the next', async () => {
    await setUp();
    const report = file('report.json', 300, 'application/json');
    await choose([report]);
    expect(page.export()).toEqual([report]);
    expect(listed()).toEqual(['report.json 300 bytes']);
    expect(removes()[0].getAttribute('aria-label')).toBe('Remove: report.json');
    expect(told()).toBe('Chosen: report.json');
    expect(native().value).toBe('');
    // One file at a time: another takes its place.
    const other = file('other.json', 10, 'application/json');
    await choose([other]);
    expect(page.export()).toEqual([other]);
  });

  it('the browser’s checks: a file of another kind or too large is not taken, and the picker says why (role="alert")', async () => {
    await setUp();
    await choose([file('photo.png', 10, 'image/png')]);
    expect(page.export()).toEqual([]);
    expect(refused()).toEqual(['photo.png is not a kind of file taken here (.json, application/json).']);
    expect(picker().querySelector('.anotoki-file-picker__refused')?.getAttribute('role')).toBe('alert');
    await choose([file('big.json', 4096, 'application/json')]);
    expect(page.export()).toEqual([]);
    expect(refused()).toEqual(['big.json is too large: 4 kB, at most 1 kB.']);
    await choose([file('fine.json', 100, 'application/json')]);
    expect(refused()).toEqual([]);
    expect(page.export().length).toBe(1);
  });

  it('dropped: the area marks a drag of files, takes the drop - several where it takes several, never the same twice', async () => {
    await setUp();
    const enter = drag('dragenter', [], 'pictures');
    expect(enter.defaultPrevented).toBe(true);
    await settle(fixture);
    expect(area('pictures').classList).toContain('anotoki-file-picker__area--over');
    expect(drag('dragover', [], 'pictures').defaultPrevented).toBe(true);
    const cat = file('cat.png', 10, 'image/png');
    const notes = file('notes.txt', 10, 'text/plain');
    const drop = drag('drop', [cat, notes], 'pictures');
    await settle(fixture);
    expect(drop.defaultPrevented).toBe(true);
    expect(area('pictures').classList).not.toContain('anotoki-file-picker__area--over');
    expect(page.pictures()).toEqual([cat]);
    expect(refused('pictures')).toEqual(['notes.txt is not a kind of file taken here (image/*).']);
    const dog = file('dog.png', 10, 'image/png');
    drag('drop', [dog, cat], 'pictures');
    await settle(fixture);
    expect(page.pictures()).toEqual([cat, dog]);
    expect(told('pictures')).toBe('Chosen: dog.png, cat.png');
    // Words dragged from the page are no files: the area does not take them.
    const words_ = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(words_, 'dataTransfer', { value: { types: ['text/plain'], files: [] } });
    area('pictures').dispatchEvent(words_);
    expect(words_.defaultPrevented).toBe(false);
  });

  it('several dropped where one is taken: none taken, and said', async () => {
    await setUp();
    drag('drop', [file('a.json', 1, 'application/json'), file('b.json', 1, 'application/json')]);
    await settle(fixture);
    expect(page.export()).toEqual([]);
    expect(refused()).toEqual(['Only one file can be chosen here.']);
  });

  it('removed: the focus goes on to the next file’s button, the one before at the end, the choose button last', async () => {
    await setUp();
    const [a, b, c] = [file('a.png', 1, 'image/png'), file('b.png', 1, 'image/png'), file('c.png', 1, 'image/png')];
    await choose([a, b, c], 'pictures');
    removes('pictures')[0].focus();
    removes('pictures')[0].click();
    await settle(fixture);
    expect(page.pictures()).toEqual([b, c]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove: b.png');
    removes('pictures')[1].click();
    await settle(fixture);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove: b.png');
    removes('pictures')[0].click();
    await settle(fixture);
    expect(page.pictures()).toEqual([]);
    expect(document.activeElement).toBe(button('pictures'));
  });

  it('disabled: neither way in, nothing taken away; the page’s error said', async () => {
    await setUp();
    await choose([file('a.json', 1, 'application/json')]);
    page.disabled.set(true);
    await settle(fixture);
    expect(button().disabled).toBe(true);
    expect(native().disabled).toBe(true);
    expect(removes()[0].disabled).toBe(true);
    expect(drag('dragover').defaultPrevented).toBe(false);
    drag('drop', [file('b.json', 1, 'application/json')]);
    await settle(fixture);
    expect(page.export().map((each) => each.name)).toEqual(['a.json']);
    page.error.set('Choose at least one picture.');
    await settle(fixture);
    const error = picker('pictures').querySelector('.anotoki-field__error[role="alert"]')!;
    expect(words(error)).toBe('Choose at least one picture.');
    expect(button('pictures').getAttribute('aria-describedby')).toBe(error.id);
  });

  it('in the page’s language - the site’s words first', async () => {
    await setUp(() => ({ language: () => 'sk', lookup: (key) => ((key as string) === 'filePicker.chooseFile' ? 'Nahrať súbor' : null) }));
    expect(words(button())).toBe('Nahrať súbor');
    expect(words(button('pictures'))).toBe('Vybrať súbory');
    expect(words(area('pictures').querySelector('.anotoki-file-picker__drop'))).toBe('Súbory sem stačí pretiahnuť');
    await choose([file('big.json', 2048, 'application/json')]);
    expect(refused()).toEqual(['Súbor big.json je príliš veľký: 2 kB, najviac 1 kB.']);
  });
});
