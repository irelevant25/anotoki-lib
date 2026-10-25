import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { FilePickerComponent } from './file-picker.component';

@Component({
  selector: 'anotoki-test-folder-picker',
  imports: [FilePickerComponent],
  template: `<anotoki-file-picker id="voice" label="Voice lines" folder accept=".ogg,audio/*" [(files)]="files" />`,
})
class FolderPickerPageComponent {
  readonly files = signal<readonly File[]>([]);
}

/** A file of a folder chosen in the device's folder chooser: its path in the folder with it. */
const inFolder = (path: string, size: number, type = 'audio/ogg') => {
  const file = new File([new Uint8Array(size)], path.split('/').pop()!, { type });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
};

describe('<anotoki-file-picker folder> (0.11.0): a whole folder, from the device’s folder chooser', () => {
  const language = signal('en');
  let host: HTMLElement;
  let page: FolderPickerPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<FolderPickerPageComponent>>>;

  beforeEach(async () => {
    language.set('en');
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language })) });
    fixture = await draw(FolderPickerPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const native = () => host.querySelector<HTMLInputElement>('input[type="file"]')!;
  const button = () => host.querySelector<HTMLButtonElement>('.anotoki-file-picker__choose')!;
  const area = () => host.querySelector<HTMLElement>('.anotoki-file-picker__area')!;
  const choose = async (files: File[]) => {
    Object.defineProperty(native(), 'files', { value: files, configurable: true });
    native().dispatchEvent(new Event('change'));
    await settle(fixture);
  };

  it('the button opens the folder chooser; no words of a drop, as a drop is never taken', () => {
    expect(words(button())).toBe('Choose a folder');
    expect(native().hasAttribute('webkitdirectory')).toBe(true);
    expect(native().multiple).toBe(true);
    expect(host.querySelector('.anotoki-file-picker__drop')).toBeNull();
  });

  it('every file of the folder, with its path; one line for the folder, how many files and their size', async () => {
    const files = [inFolder('voice/hello.ogg', 1024), inFolder('voice/greetings/hi.ogg', 2048), inFolder('voice/notes.txt', 10, 'text/plain')];
    await choose(files);
    expect(page.files().map((file) => (file as File & { webkitRelativePath: string }).webkitRelativePath)).toEqual(['voice/hello.ogg', 'voice/greetings/hi.ogg']);
    expect(Array.from(host.querySelectorAll('.anotoki-file-picker__file')).map((line) => words(line))).toEqual(['voice (files: 2) 3 kB']);
    expect(words(host.querySelector('[aria-live="polite"]'))).toBe('Chosen: voice (files: 2)');
    expect(words(host.querySelector('.anotoki-file-picker__refused'))).toBe('notes.txt is not a kind of file taken here (.ogg, audio/*).');
  });

  it('a new folder takes the place of the one there; its remove button takes it all away, the focus back on the button', async () => {
    await choose([inFolder('voice/a.ogg', 5)]);
    await choose([inFolder('music/b.ogg', 5), inFolder('music/c.ogg', 5)]);
    expect(page.files().map((file) => file.name)).toEqual(['b.ogg', 'c.ogg']);
    const remove = host.querySelector<HTMLButtonElement>('.anotoki-file-picker__remove')!;
    expect(remove.getAttribute('aria-label')).toBe('Remove: music');
    remove.click();
    await settle(fixture);
    expect(page.files()).toEqual([]);
    expect(document.activeElement).toBe(button());
  });

  it('a drop on it is kept from the page and taken by nothing', () => {
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [inFolder('x/y.ogg', 1)] } });
    area().dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(page.files()).toEqual([]);
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    const transfer = { types: ['Files'], dropEffect: 'copy' };
    Object.defineProperty(over, 'dataTransfer', { value: transfer });
    area().dispatchEvent(over);
    expect(transfer.dropEffect).toBe('none');
  });

  it('in Slovak', async () => {
    language.set('sk');
    await settle(fixture);
    expect(words(button())).toBe('Vybrať priečinok');
    await choose([inFolder('hlasy/a.ogg', 5)]);
    expect(words(host.querySelector('.anotoki-file-picker__name'))).toBe('hlasy (súbory: 1)');
  });
});
