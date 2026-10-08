import { AdminLanguage, FALLBACK_LANGUAGE, TranslationChanges, TranslationGrid, TranslationGroup, TranslationKeyRow } from '@anotoki/lib/translations';

/*
 * What the Translations page works out from the grid the server sends
 * (GET {apiBase}/translations) - pure, so it is tried without a page: which
 * keys are one block (a plural family, a mail), what a search finds, which
 * cells changed, how a plural reads for a number, a language as a file.
 */

/** The largest file an import takes by default: the server's body limit. */
export const IMPORT_MAX_BYTES = 1024 * 1024;

/** The forms of a plural family, in the order the page shows them. */
export const PLURAL_FORMS = ['one', 'few', 'other'] as const;
export type PluralForm = (typeof PLURAL_FORMS)[number];

/** The numbers a plural family is shown filled in for: one of each of Slovak's forms. */
export const SAMPLE_COUNTS = [1, 3, 12] as const;

/** A language code as the database keeps it - only such a code is given to `Intl`. */
const LANGUAGE_CODE = /^[a-z]{2}(-[a-z]{2})?$/;
/** How far the numbers are looked at when saying which ones a form is for. */
const NUMBERS_UP_TO = 100;
/** How many runs of numbers a form's label names before it says "…". */
const NUMBERS_RUNS = 3;

/** One key of a block: which form of a plural it is, or which part of a group's block (a mail's subject). */
export interface BlockRow {
  key: TranslationKeyRow;
  form: PluralForm | null;
  part: string | null;
}

/**
 * What the page shows as one piece: a key on its own; a plural family - the
 * keys `name.one`, `name.few`, `name.other`, which the code asks for by `name`
 * with a number; or a block of a group the server alone reads (a mail: its
 * subject and its paragraphs, which the server puts together into one message).
 */
export interface KeyBlock {
  /** The key; for a family or a group's block, the name without the form or the part. */
  name: string;
  kind: 'key' | 'plural' | 'group';
  /** The group a block of it belongs to. */
  group: TranslationGroup | null;
  rows: BlockRow[];
}

/** Which form a key is, by its last segment - the three suffixes are kept for plural families. */
function formOf(name: string): PluralForm | null {
  const dot = name.lastIndexOf('.');
  const last = name.slice(dot + 1);
  return dot > 0 && (PLURAL_FORMS as readonly string[]).includes(last) ? (last as PluralForm) : null;
}

/** Where a name stands in a list that says the order; a name the list does not know comes after all it does. */
function placeIn(order: readonly string[] | undefined, name: string): number {
  const place = order?.indexOf(name) ?? -1;
  return place < 0 ? (order?.length ?? 0) : place;
}

/**
 * The keys as blocks. The groups' first, a part each in the order the groups
 * are given: a block per name without its last segment (`mail.reset` for
 * `mail.reset.subject`), in the group's order, its keys in the order of its
 * parts (one not named after those, where it came). Then every other key in
 * the order it came (by name): a plural family as one block where its first
 * form stood, its forms one, few, other - a family being two forms or more,
 * `.other` among them (a lone `x.other` is a key of its own).
 */
export function keyBlocks(keys: readonly TranslationKeyRow[], groups: readonly TranslationGroup[] = []): KeyBlock[] {
  const grouped = new Map<TranslationGroup, Map<string, KeyBlock>>(groups.map((group) => [group, new Map()]));
  const rest: TranslationKeyRow[] = [];
  for (const key of keys) {
    const group = groups.find((candidate) => key.name.startsWith(candidate.prefix));
    if (!group) {
      rest.push(key);
      continue;
    }
    const dot = key.name.lastIndexOf('.');
    const blockName = dot >= group.prefix.length ? key.name.slice(0, dot) : key.name;
    const part = dot >= group.prefix.length ? key.name.slice(dot + 1) : '';
    const blocks = grouped.get(group)!;
    let block = blocks.get(blockName);
    if (!block) {
      block = { name: blockName, kind: 'group', group, rows: [] };
      blocks.set(blockName, block);
    }
    block.rows.push({ key, form: null, part });
  }

  const forms = new Map<string, Set<PluralForm>>();
  for (const key of rest) {
    const form = formOf(key.name);
    if (form) {
      const family = key.name.slice(0, key.name.lastIndexOf('.'));
      forms.set(family, (forms.get(family) ?? new Set()).add(form));
    }
  }
  const isFamily = (family: string): boolean => {
    const found = forms.get(family);
    return !!found && found.size >= 2 && found.has('other');
  };

  const blocks: KeyBlock[] = [];
  for (const group of groups) {
    const ordered = [...grouped.get(group)!.values()].sort((a, b) => placeIn(group.order, a.name.slice(group.prefix.length)) - placeIn(group.order, b.name.slice(group.prefix.length)));
    for (const block of ordered) {
      // sort() is stable: parts the order does not know keep the order they came in.
      block.rows.sort((a, b) => placeIn(group.parts, a.part ?? '') - placeIn(group.parts, b.part ?? ''));
      blocks.push(block);
    }
  }
  const families = new Map<string, KeyBlock>();
  for (const key of rest) {
    const form = formOf(key.name);
    const family = form ? key.name.slice(0, key.name.lastIndexOf('.')) : null;
    if (!form || !family || !isFamily(family)) {
      blocks.push({ name: key.name, kind: 'key', group: null, rows: [{ key, form: null, part: null }] });
      continue;
    }
    let block = families.get(family);
    if (!block) {
      block = { name: family, kind: 'plural', group: null, rows: [] };
      families.set(family, block);
      blocks.push(block);
    }
    block.rows.push({ key, form, part: null });
  }
  for (const family of families.values()) {
    family.rows.sort((a, b) => PLURAL_FORMS.indexOf(a.form!) - PLURAL_FORMS.indexOf(b.form!));
  }
  return blocks;
}

/** Text as a search compares it: small letters, no diacritics - "prihlasenie" finds "Prihlásenie". */
export function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/** The string the site has for a key in a language ('' for none). */
export function storedValue(key: TranslationKeyRow, code: string): string {
  return Object.hasOwn(key.values, code) ? key.values[code] : '';
}

/** What is in a cell now: the change not saved yet, or the stored string. */
export function cellValue(edits: TranslationChanges, key: TranslationKeyRow, code: string): string {
  const mine = Object.hasOwn(edits, key.name) ? edits[key.name] : undefined;
  return mine && Object.hasOwn(mine, code) ? mine[code] : storedValue(key, code);
}

/**
 * Is there nothing in a box to see - as the server takes it when it is saved?
 * The twin of the server's Text::blank() after its clean(): nothing but white
 * space, separators, format characters (a zero-width space, a soft hyphen) and
 * the control characters the server drops is an empty string - no string of
 * its own in another language, refused for English. Never widened to trim():
 * "Hello " over a stored "Hello" is a change.
 */
export function blankText(value: string): boolean {
  return !/[^\s\p{Z}\p{Cf}\u0085\u0000-\u0008\u000E-\u001F\u007F]/u.test(value);
}

/** Does a box say what is stored? The same text - or, over no string at all, nothing to see. */
function sameAsStored(value: string, stored: string): boolean {
  return value === stored || (stored === '' && blankText(value));
}

/**
 * Does a search find this block? By a key's name, its description, or its
 * text in any language - stored, and as the box has it now: a row found by its
 * words does not leave while they are being rewritten. A block is found whole.
 */
export function blockMatches(block: KeyBlock, search: string, codes: readonly string[], edits: TranslationChanges): boolean {
  const needle = searchable(search.trim());
  if (needle === '') {
    return true;
  }
  return (
    searchable(block.name).includes(needle) ||
    block.rows.some(
      ({ key }) =>
        searchable(key.name).includes(needle) ||
        searchable(key.description ?? '').includes(needle) ||
        codes.some((code) => searchable(storedValue(key, code)).includes(needle) || searchable(cellValue(edits, key, code)).includes(needle)),
    )
  );
}

/** Is this row one the language needs a string for? Every key; of a plural family, only the forms its numbers take. */
export function rowCounts(row: BlockRow, code: string): boolean {
  return row.form === null || formUsed(code, row.form);
}

/** Has the site no string of its own for some row of this block in the language? By what is saved: a row does not leave while it is filled in. */
export function blockMissing(block: KeyBlock, code: string): boolean {
  return block.rows.some((row) => rowCounts(row, code) && storedValue(row.key, code) === '');
}

/** How much of each language is written, by what is saved - of the rows it needs. */
export function coverage(blocks: readonly KeyBlock[], languages: readonly AdminLanguage[]): { language: AdminLanguage; done: number; total: number; percent: number }[] {
  const rows = blocks.flatMap((block) => block.rows);
  return languages.map((language) => {
    const needed = rows.filter((row) => rowCounts(row, language.code));
    const done = needed.filter((row) => storedValue(row.key, language.code) !== '').length;
    return { language, done, total: needed.length, percent: needed.length ? Math.round((100 * done) / needed.length) : 0 };
  });
}

/**
 * The edits with one cell set: a cell typed back to what is stored is no
 * change any more - unless `keep` holds it whatever it says, for typing while a
 * save or an import is on its way: what is stored is about to change, and
 * what was typed must not be lost to the answer. remainingEdits() lets such a
 * cell go once the fresh grid says the same.
 */
export function withEdit(edits: TranslationChanges, key: TranslationKeyRow, code: string, value: string, keep = false): TranslationChanges {
  const { [key.name]: before, ...others } = edits;
  const cells = { ...before };
  if (!keep && sameAsStored(value, storedValue(key, code))) {
    delete cells[code];
  } else {
    cells[code] = value;
  }
  return Object.keys(cells).length ? { ...others, [key.name]: cells } : others;
}

/** How many cells are changed and not saved. */
export function editCount(edits: TranslationChanges): number {
  return Object.values(edits).reduce((count, cells) => count + Object.keys(cells).length, 0);
}

/**
 * The edits that are still changes once a fresh grid has come: not the cells
 * `sent` and saved as they were sent (whatever the server made of them), not a
 * cell that now says what is stored, nothing for a key or a language that is
 * gone. What was typed while the save was on its way stays.
 */
export function remainingEdits(edits: TranslationChanges, grid: TranslationGrid, sent: TranslationChanges = {}): TranslationChanges {
  const keys = new Map(grid.keys.map((key) => [key.name, key]));
  const codes = new Set(grid.languages.map((language) => language.code));
  const remaining: TranslationChanges = {};
  for (const [name, cells] of Object.entries(edits)) {
    const key = keys.get(name);
    if (!key) {
      continue;
    }
    const kept: Record<string, string> = {};
    for (const [code, value] of Object.entries(cells)) {
      const saved = Object.hasOwn(sent, name) && Object.hasOwn(sent[name], code) && sent[name][code] === value;
      if (codes.has(code) && !saved && !sameAsStored(value, storedValue(key, code))) {
        kept[code] = value;
      }
    }
    if (Object.keys(kept).length) {
      remaining[name] = kept;
    }
  }
  return remaining;
}

// ── Plurals ──────────────────────────────────────────────────────────────────

const PLURAL_RULES = new Map<string, Intl.PluralRules>();
const FORMS_USED = new Map<string, boolean>();

function pluralRules(code: string): Intl.PluralRules {
  let rules = PLURAL_RULES.get(code);
  if (!rules) {
    rules = new Intl.PluralRules(LANGUAGE_CODE.test(code) ? code : FALLBACK_LANGUAGE);
    PLURAL_RULES.set(code, rules);
  }
  return rules;
}

/** The form a site reads for a number in a language: its category when it is one of the three, `other` for every other (many, two, zero). */
export function pluralForm(code: string, count: number): PluralForm {
  const category = pluralRules(code).select(count);
  return category === 'one' || category === 'few' ? category : 'other';
}

/**
 * Does a site ever read this form in the language? English's always - every
 * other language falls back to them. Another's only when some whole number
 * takes it: `few` in Slovak (2-4), never in German. A form not used needs no
 * string: it counts neither as missing nor towards how much is written.
 */
export function formUsed(code: string, form: PluralForm): boolean {
  if (code === FALLBACK_LANGUAGE) {
    return true;
  }
  const known = `${code} ${form}`;
  let used = FORMS_USED.get(known);
  if (used === undefined) {
    used = false;
    for (let count = 0; count <= NUMBERS_UP_TO && !used; count++) {
      used = pluralForm(code, count) === form;
    }
    FORMS_USED.set(known, used);
  }
  return used;
}

/** The numbers a form is for in a language, for the label over its box - Slovak: "1", "2-4", "0, 5 and more". */
export function pluralNumbers(code: string, form: PluralForm, languageName: string): string {
  if (code === FALLBACK_LANGUAGE) {
    return form === 'one' ? '1' : form === 'few' ? 'not used in English - the fallback for other languages' : 'everything else';
  }
  if (!formUsed(code, form)) {
    return `not used in ${languageName}`;
  }
  const runs: [number, number][] = [];
  for (let count = 0; count <= NUMBERS_UP_TO; count++) {
    if (pluralForm(code, count) !== form) {
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && last[1] === count - 1) {
      last[1] = count;
    } else {
      runs.push([count, count]);
    }
  }
  if (runs.length === 1 && runs[0][0] === 0 && runs[0][1] === NUMBERS_UP_TO) {
    return 'every number';
  }
  const words = runs.slice(0, NUMBERS_RUNS).map(([from, to]) => (to === NUMBERS_UP_TO ? `${from} and more` : from === to ? String(from) : `${from}-${to}`));
  return words.join(', ') + (runs.length > NUMBERS_RUNS ? ', …' : '');
}

/**
 * A plural family as the site would say it for 1, 3 and 12 in a language:
 * `text(form)` is that language's string for a form (English's when it has
 * none, as the site falls back), only {count} filled in. A form nobody has
 * written yet is a dash.
 */
export function pluralSamples(code: string, text: (form: PluralForm) => string): string[] {
  return SAMPLE_COUNTS.map((count) => {
    const value = text(pluralForm(code, count));
    return value === '' ? '–' : value.replace(/\{count\}/g, String(count));
  });
}

// ── A language as a file ─────────────────────────────────────────────────────

/** A language's strings as a file's text - one flat object, a key a line, as the server's export and the command line write it. */
export function translationFileText(values: Record<string, string>): string {
  return JSON.stringify(values, null, 4) + '\n';
}

/** What a file saved by Notepad starts with - a byte-order mark - written by its number: it cannot be seen in a source file. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** The strings a file holds - one flat {key: text} object - or null when it is anything else. */
export function stringsFromFile(text: string): Record<string, string> | null {
  let parsed: unknown;
  try {
    // JSON does not know the mark: it is taken off before the text is read.
    parsed = JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const entries = Object.entries(parsed);
  // fromEntries, so a key like "__proto__" stays a key - and is refused by the server like any other it does not know.
  return entries.every((entry): entry is [string, string] => typeof entry[1] === 'string') ? Object.fromEntries(entries) : null;
}

/** The file name a download's Content-Disposition gives (`attachment; filename="translations-sk.json"`), else the fallback. */
export function fileNameFrom(disposition: string | null, fallback: string): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  let name = match?.[1]?.trim() ?? '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // As it came.
  }
  // A name, never a path.
  name = name.split(/[\\/]/).pop() ?? '';
  return name === '' ? fallback : name;
}

/** The languages in the order a switcher shows them - the server's: by their place, then by name, then by code. */
export function inLanguageOrder(languages: readonly AdminLanguage[]): AdminLanguage[] {
  return [...languages].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'en') || a.code.localeCompare(b.code, 'en'));
}
