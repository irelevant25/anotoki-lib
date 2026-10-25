import { Pipe, PipeTransform, inject } from '@angular/core';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { writtenSize } from './file-size';

/**
 * A file's size, written the page's way: `{{ file.size | anotokiFileSize }}` - "1.5 kB", "20 MB", "300 bytes" in
 * English, "1,5 kB", "300 bajtov" in Slovak (writtenSize(), in the kit's language). Nothing - null, undefined, a text
 * that is no number - writes nothing.
 *
 * Impure, as the translate pipe is: the page's language changes under the same size.
 */
@Pipe({ name: 'anotokiFileSize', pure: false })
export class FileSizePipe implements PipeTransform {
  private readonly words = inject(AnotokiWords);

  transform(bytes: number | string | null | undefined): string {
    const value = typeof bytes === 'string' && bytes.trim() !== '' ? Number(bytes) : bytes;
    return typeof value === 'number' && Number.isFinite(value) ? writtenSize(value, this.words.language()) : '';
  }
}
