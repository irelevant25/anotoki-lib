// Marked pure: a site's build keeps a top-level `new` it is not told is pure, whether a date is shown or not.
const DATE_FORMAT = /* @__PURE__ */ new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const SECONDS_FORMAT = /* @__PURE__ */ new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const DAY_FORMAT = /* @__PURE__ */ new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const NUMBER_FORMAT = /* @__PURE__ */ new Intl.NumberFormat('en-GB');

/** '2026-10-06T10:01:02Z' -> '6 Oct 2026, 10:01' (in the browser's time zone); with seconds, '6 Oct 2026, 10:01:02'. */
export function defaultFormatDate(iso: string, seconds = false): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : (seconds ? SECONDS_FORMAT : DATE_FORMAT).format(date);
}

/** A UTC day, '2026-10-06' -> '6 Oct'. */
export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : DAY_FORMAT.format(date);
}

/** 11523 -> '11,523'. */
export function formatCount(value: number): string {
  return NUMBER_FORMAT.format(value);
}

/** 1536 -> '1.5 KB', 52428800 -> '50 MB': the binary units a disk is measured in. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '-';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)} ${units[unit]}`;
}

/** '1 file', '3 files'. */
export function counted(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/** How long ago, as a person says it: 'less than an hour ago', '5 hours ago', '3 days ago'. */
export function ago(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const hours = Math.floor((now - then) / 3_600_000);
  if (hours < 1) {
    return 'less than an hour ago';
  }
  if (hours < 48) {
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}
