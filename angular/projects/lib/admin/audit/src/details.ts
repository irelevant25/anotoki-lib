import { ChangeRow, ReadDetails } from './models';

/** How long a one-line summary of the details may run before it is cut. */
const SUMMARY_LENGTH = 90;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A value as one line of the page: text as it is, nothing as a dash, the rest as JSON. */
export function shown(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'string') {
    return value === '' ? '""' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function row(field: string, before: unknown, after: unknown): ChangeRow {
  const was = shown(before);
  const is = shown(after);
  return { field, before: was, after: is, changed: was !== is };
}

/** What a `{from, to}` change is of, from its action: feedback.status_changed -> status, user.roles_set -> roles. */
function fieldOf(action: string): string {
  const last = action.split('.').pop() ?? '';
  return last.replace(/_(changed|set|updated)$/, '').replace(/_/g, ' ') || 'value';
}

/**
 * An entry's details as a change where they say one, in the shapes the family
 * writes: genshin's row diff `{column: {old, new}}`, `{before, after}` (two
 * objects compared key by key, or two values), and `{from, to}` - and every
 * other part as a fact of its own. Details that say no change are facts alone.
 */
export function readDetails(details: unknown, action: string): ReadDetails {
  if (details === null || details === undefined) {
    return { changes: [], facts: [] };
  }
  if (!isObject(details)) {
    return { changes: [], facts: [{ name: 'details', value: shown(details) }] };
  }
  const entries = Object.entries(details);
  const facts = (except: string[]) => entries.filter(([name]) => !except.includes(name)).map(([name, value]) => ({ name, value: shown(value) }));

  // genshin's diff: every part a column with its old and new value.
  if (entries.length > 0 && entries.every(([, value]) => isObject(value) && ('old' in value || 'new' in value) && Object.keys(value).every((key) => key === 'old' || key === 'new'))) {
    return { changes: entries.map(([field, value]) => row(field, (value as Json)['old'], (value as Json)['new'])), facts: [] };
  }

  if ('before' in details && 'after' in details) {
    const before = details['before'];
    const after = details['after'];
    if (isObject(before) && isObject(after)) {
      const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
      return { changes: fields.map((field) => row(field, before[field], after[field])), facts: facts(['before', 'after']) };
    }
    return { changes: [row(fieldOf(action), before, after)], facts: facts(['before', 'after']) };
  }

  if ('from' in details && 'to' in details) {
    return { changes: [row(fieldOf(action), details['from'], details['to'])], facts: facts(['from', 'to']) };
  }

  return { changes: [], facts: facts([]) };
}

/** The details on one line, cut short - what a row shows before it is opened. */
export function summary(details: unknown): string {
  if (details === null || details === undefined || (isObject(details) && Object.keys(details).length === 0)) {
    return '';
  }
  const text = typeof details === 'string' ? details : JSON.stringify(details);
  return text.length > SUMMARY_LENGTH ? `${text.slice(0, SUMMARY_LENGTH - 1)}…` : text;
}

/** The details whole, as the server keeps them - indented. */
export function pretty(details: unknown): string {
  if (typeof details === 'string') {
    try {
      return JSON.stringify(JSON.parse(details), null, 2);
    } catch {
      return details;
    }
  }
  return JSON.stringify(details, null, 2) ?? '';
}
