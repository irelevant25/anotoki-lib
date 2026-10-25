/*
 * A file's size, written the page's way: the file picker's since 0.6.0, an entry point of its own since 0.11.0 - for
 * every page that shows one (genshin's Files page, its uploads) without the picker.
 */

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/** Intl's writers of a size, by language and unit: made once each. Marked pure: a site's build keeps a top-level `new` it is not told is pure. */
const WRITERS = /* @__PURE__ */ new Map<string, Intl.NumberFormat>();

/**
 * A size in the binary units a disk is measured in (1 kB is 1024 bytes), written the page's way: "300 bytes", "1.5 kB",
 * "20 MB" - "300 bajtov", "1,5 kB" in Slovak. Bytes in words (Intl's short "byte" reads as one in English), the rest as
 * their short units with at most one decimal; English where the browser does not know the language. A size that is
 * no number, or below nought, is nought.
 */
export function writtenSize(bytes: number, language: string): string {
  let value = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return writer(language, unit).format(value);
}

function writer(language: string, unit: number): Intl.NumberFormat {
  const key = `${language}|${unit}`;
  let found = WRITERS.get(key);
  if (!found) {
    const options: Intl.NumberFormatOptions = { style: 'unit', unit: UNITS[unit], unitDisplay: unit === 0 ? 'long' : 'short', maximumFractionDigits: unit === 0 ? 0 : 1 };
    try {
      found = new Intl.NumberFormat(language, options);
    } catch {
      found = new Intl.NumberFormat('en', options);
    }
    WRITERS.set(key, found);
  }
  return found;
}
