/*
 * The file picker's checks, as the browser's own `accept` reads its list, and a size written the page's way. A
 * convenience for the person - a file refused at once, with its reason - never a defence: the server checks every
 * file it is sent again.
 */

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

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

/** A size in the binary units a disk is measured in, written the page's way: "300 bytes", "1.5 kB", "20 MB" ("300 bajtov", "1,5 kB"). */
export function writtenSize(bytes: number, language: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  // Bytes in words (Intl's short "byte" reads as one in English), the rest as their short units.
  const options: Intl.NumberFormatOptions = { style: 'unit', unit: UNITS[unit], unitDisplay: unit === 0 ? 'long' : 'short', maximumFractionDigits: unit === 0 ? 0 : 1 };
  try {
    return new Intl.NumberFormat(language, options).format(value);
  } catch {
    return new Intl.NumberFormat('en', options).format(value);
  }
}

/** The same file chosen twice: its name, size and time of change. */
export function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}
