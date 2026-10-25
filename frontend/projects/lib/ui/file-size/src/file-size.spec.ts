import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle } from '../../src/testing';
import { FileSizePipe } from './file-size.pipe';
import { writtenSize } from './file-size';

@Component({
  selector: 'anotoki-test-file-sizes',
  imports: [FileSizePipe],
  template: `<span id="a">{{ 300 | anotokiFileSize }}</span
    ><span id="b">{{ 1536 | anotokiFileSize }}</span
    ><span id="c">{{ size() | anotokiFileSize }}</span
    ><span id="d">{{ none | anotokiFileSize }}</span>`,
})
class FileSizesPageComponent {
  readonly size = signal<number | string>(20 * 1024 * 1024);
  readonly none: number | null = null;
}

describe("a file's size, written the page's way (ui/file-size)", () => {
  it('binary units, bytes in words, the rest short with at most one decimal - in English and in Slovak', () => {
    expect(writtenSize(0, 'en')).toBe('0 bytes');
    expect(writtenSize(1, 'en')).toBe('1 byte');
    expect(writtenSize(300, 'en')).toBe('300 bytes');
    expect(writtenSize(1536, 'en')).toBe('1.5 kB');
    expect(writtenSize(20 * 1024 * 1024, 'en')).toBe('20 MB');
    expect(writtenSize(3 * 1024 ** 3, 'en')).toBe('3 GB');
    expect(writtenSize(2.5 * 1024 ** 4, 'en')).toBe('2.5 TB');
    expect(writtenSize(300, 'sk')).toBe('300 bajtov');
    expect(writtenSize(1536, 'sk')).toBe('1,5 kB');
    expect(writtenSize(-5, 'en')).toBe('0 bytes');
    expect(writtenSize(Number.NaN, 'en')).toBe('0 bytes');
    // A language the browser does not know: English.
    expect(writtenSize(1536, 'not a language!')).toBe('1.5 kB');
  });

  it('the pipe writes it in the kit’s language, and follows a change of it; nothing writes nothing', async () => {
    const language = signal('en');
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language })) });
    const fixture = await draw(FileSizesPageComponent);
    const text = (id: string) => (fixture.nativeElement as HTMLElement).querySelector('#' + id)!.textContent;
    expect([text('a'), text('b'), text('c'), text('d')]).toEqual(['300 bytes', '1.5 kB', '20 MB', '']);
    language.set('sk');
    fixture.componentInstance.size.set('1536');
    await settle(fixture);
    expect([text('a'), text('b'), text('c'), text('d')]).toEqual(['300 bajtov', '1,5 kB', '1,5 kB', '']);
    fixture.componentInstance.size.set('lots');
    await settle(fixture);
    expect(text('c')).toBe('');
    (fixture.nativeElement as HTMLElement).remove();
  });
});
