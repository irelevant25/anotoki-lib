/*
 * The file picker's checks, as the browser's own `accept` reads its list, and a size written the page's way. A
 * convenience for the person - a file refused at once, with its reason - never a defence: the server checks every
 * file it is sent again.
 */

import { writtenSize } from '@anotoki/lib/ui/file-size';

// A size written the page's way: an entry point of its own since 0.11.0 (ui/file-size), named here as before.
export { writtenSize };

/** Whether a file is of a kind the `accept` list takes: '.json' (its name's end), 'image/*' (its type's family), 'application/pdf'. An empty list takes any. */
export function accepts(file: File, accept: string): boolean {
  const kinds = accept
    .split(',')
    .map((kind) => kind.trim().toLowerCase())
    .filter(Boolean);
  if (kinds.length === 0) {
    return true;
  }
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return kinds.some((kind) => (kind.startsWith('.') ? name.endsWith(kind) : kind.endsWith('/*') ? type.startsWith(kind.slice(0, -1)) : type === kind));
}

/** The same file chosen twice: its name, size and time of change. */
export function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}
