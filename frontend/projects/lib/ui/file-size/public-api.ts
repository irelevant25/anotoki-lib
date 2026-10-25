/*
 * @anotoki/lib/ui/file-size (0.11.0) - a file's size written the page's way: writtenSize(bytes, language) - "300
 * bytes", "1.5 kB", "20 MB" ("300 bajtov", "1,5 kB") - and the pipe `anotokiFileSize`, which writes it in the page's
 * language (the kit's). The file picker's sizes, for every page that shows a file's. No words of its own: Intl writes
 * the units.
 */

export { writtenSize } from './src/file-size';
export { FileSizePipe } from './src/file-size.pipe';
