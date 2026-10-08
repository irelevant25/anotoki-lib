import { TranslationGroup } from '@anotoki/lib/translations';
import { CZECH, ENGLISH, SLOVAK, grid } from './testing';
import {
  blankText,
  blockMatches,
  blockMissing,
  cellValue,
  coverage,
  editCount,
  fileNameFrom,
  formUsed,
  inLanguageOrder,
  keyBlocks,
  pluralForm,
  pluralNumbers,
  pluralSamples,
  remainingEdits,
  stringsFromFile,
  translationFileText,
  withEdit,
} from './translation-grid';

const MAILS: TranslationGroup = {
  prefix: 'mail.',
  heading: 'Mails',
  order: ['confirm', 'reset'],
  parts: ['subject', 'greeting'],
  about: { 'mail.reset': { title: 'The password reset mail' } },
  icon: 'mail',
};

describe('the grid’s blocks', () => {
  it('make a plural family one block where its first form stood, its forms one, few, other - and a lone `.other` a key', () => {
    const blocks = keyBlocks(grid().keys);
    expect(blocks.map((block) => [block.name, block.kind])).toEqual([
      ['greeting.named', 'key'],
      ['mail.reset.greeting', 'key'],
      ['mail.reset.subject', 'key'],
      ['reviews.due', 'plural'],
      ['sessions.ended.other', 'key'],
      ['theme.label', 'key'],
    ]);
    expect(blocks[3].rows.map((row) => row.form)).toEqual(['one', 'few', 'other']);
  });

  it('put a group’s keys first, a block a name in the group’s order, its parts in theirs', () => {
    const keys = [
      ...grid().keys,
      { name: 'mail.confirm.subject', description: null, values: { en: 'Confirm' } },
      { name: 'mail.news.footer', description: null, values: { en: 'Unsubscribe' } },
      { name: 'mail.reset.extra', description: null, values: { en: 'P.S.' } },
    ];
    const blocks = keyBlocks(keys, [MAILS]);
    expect(blocks.slice(0, 3).map((block) => [block.name, block.kind])).toEqual([
      ['mail.confirm', 'group'],
      ['mail.reset', 'group'],
      ['mail.news', 'group'],
    ]);
    expect(blocks[1].rows.map((row) => row.part)).toEqual(['subject', 'greeting', 'extra']);
    expect(blocks[1].group).toBe(MAILS);
    expect(blocks.filter((block) => block.kind === 'group')).toHaveLength(3);
  });

  it('find a block by a key’s name, its description or its text in any language - stored or typed, diacritics and case aside', () => {
    const blocks = keyBlocks(grid().keys);
    const codes = ['en', 'sk'];
    const found = (search: string, edits = {}) => blocks.filter((block) => blockMatches(block, search, codes, edits)).map((block) => block.name);
    expect(found('')).toHaveLength(blocks.length);
    expect(found('VZHLAD')).toEqual(['theme.label']);
    expect(found('opakovani')).toEqual(['reviews.due']);
    expect(found('home page')).toEqual(['greeting.named', 'reviews.due']);
    expect(found('reviews.due')).toEqual(['reviews.due']);
    expect(found('farba', { 'theme.label': { sk: 'Farba' } })).toEqual(['theme.label']);
  });

  it('say a block misses a language’s string by what is saved - of a family, only the forms the language’s numbers take', () => {
    const blocks = keyBlocks(grid().keys);
    const missing = (code: string) => blocks.filter((block) => blockMissing(block, code)).map((block) => block.name);
    expect(missing('sk')).toEqual(['mail.reset.greeting', 'reviews.due']);
    expect(missing('en')).toEqual([]);
    // German never says `few`: a family German has `one` and `other` of is not missing.
    const german = keyBlocks([
      { name: 'x.one', description: null, values: { de: 'eins' } },
      { name: 'x.few', description: null, values: {} },
      { name: 'x.other', description: null, values: { de: 'viele' } },
    ]);
    expect(blockMissing(german[0], 'de')).toBe(false);
  });

  it('count how much of each language is written, of the rows it needs', () => {
    const counted = coverage(keyBlocks(grid().keys), [ENGLISH, SLOVAK]);
    expect(counted.map((item) => [item.language.code, item.done, item.total, item.percent])).toEqual([
      ['en', 8, 8, 100],
      ['sk', 6, 8, 75],
    ]);
  });
});

describe('the edits', () => {
  const key = grid().keys[5];

  it('hold a cell that differs from what is stored, and let go of one typed back to it', () => {
    let edits = withEdit({}, key, 'sk', 'X');
    expect(edits).toEqual({ 'reviews.due.other': { sk: 'X' } });
    expect(cellValue(edits, key, 'sk')).toBe('X');
    expect(editCount(edits)).toBe(1);
    edits = withEdit(edits, key, 'sk', '{count} opakovaní');
    expect(edits).toEqual({});
    expect(cellValue(edits, key, 'sk')).toBe('{count} opakovaní');
  });

  it('take a box of nothing to see over no string for no change - and over a string for taking it away', () => {
    const one = grid().keys[4];
    expect(withEdit({}, one, 'sk', ' ​ ')).toEqual({});
    expect(withEdit({}, key, 'sk', '')).toEqual({ 'reviews.due.other': { sk: '' } });
    expect(withEdit({}, key, 'sk', '{count} opakovaní ')).toEqual({ 'reviews.due.other': { sk: '{count} opakovaní ' } });
  });

  it('hold a cell whatever it says while a save is on its way, and measure it against the answer', () => {
    const held = withEdit({}, key, 'sk', '{count} opakovaní', true);
    expect(held).toEqual({ 'reviews.due.other': { sk: '{count} opakovaní' } });
    expect(remainingEdits(held, grid())).toEqual({});
  });

  it('keep after a fresh grid only what still differs - not what was sent and saved, nothing of a key or language that is gone', () => {
    const edits = { 'reviews.due.other': { sk: 'Sent' }, 'theme.label': { sk: 'Typed meanwhile' }, 'gone.key': { sk: 'x' }, 'greeting.named': { de: 'Hallo' } };
    const fresh = grid();
    fresh.keys[5] = { ...fresh.keys[5], values: { ...fresh.keys[5].values, sk: 'Sent' } };
    expect(remainingEdits(edits, fresh, { 'reviews.due.other': { sk: 'Sent' } })).toEqual({ 'theme.label': { sk: 'Typed meanwhile' } });
  });

  it('see nothing to see as the server does: spaces, separators, format characters and the controls it drops', () => {
    expect(['', ' ', ' ', '​⁠', '­', '\u0007', '\n\t'].map(blankText)).toEqual([true, true, true, true, true, true, true]);
    expect(['a', '.', '{count}'].map(blankText)).toEqual([false, false, false]);
  });
});

describe('plurals on the page', () => {
  it('take the form a site reads: Slovak one, few, other; English never few', () => {
    expect([1, 2, 4, 5, 0].map((count) => pluralForm('sk', count))).toEqual(['one', 'few', 'few', 'other', 'other']);
    expect([1, 2].map((count) => pluralForm('en', count))).toEqual(['one', 'other']);
    expect(formUsed('en', 'few')).toBe(true);
    expect(formUsed('de', 'few')).toBe(false);
    expect(formUsed('sk', 'few')).toBe(true);
  });

  it('say which numbers a form is for', () => {
    expect(pluralNumbers('sk', 'one', 'Slovak')).toBe('1');
    expect(pluralNumbers('sk', 'few', 'Slovak')).toBe('2-4');
    expect(pluralNumbers('sk', 'other', 'Slovak')).toBe('0, 5 and more');
    expect(pluralNumbers('de', 'few', 'German')).toBe('not used in German');
    expect(pluralNumbers('en', 'few', 'English')).toBe('not used in English - the fallback for other languages');
    expect(pluralNumbers('ja', 'other', 'Japanese')).toBe('every number');
  });

  it('show a family as the site says it for 1, 3 and 12 - a dash for a form nobody wrote', () => {
    const texts: Record<string, string> = { one: '{count} opakovanie', few: '{count} opakovania', other: '' };
    expect(pluralSamples('sk', (form) => texts[form])).toEqual(['1 opakovanie', '3 opakovania', '–']);
  });
});

describe('a language as a file', () => {
  it('is one flat object, a key a line, with a newline at the end', () => {
    expect(translationFileText({ a: 'A', b: 'B' })).toBe('{\n    "a": "A",\n    "b": "B"\n}\n');
  });

  it('reads a file of strings - with Notepad’s byte-order mark - and nothing else', () => {
    expect(stringsFromFile('﻿{"a": "A"}')).toEqual({ a: 'A' });
    expect(stringsFromFile('{"__proto__": "x"}')).toEqual(Object.fromEntries([['__proto__', 'x']]));
    for (const text of ['', '[]', '"a"', '{"a": 1}', '{"a": {"b": "c"}}', '{']) {
      expect(stringsFromFile(text), text).toBeNull();
    }
  });

  it('is saved under the name the server gives it - a name, never a path', () => {
    expect(fileNameFrom('attachment; filename="translations-sk.json"', 'x.json')).toBe('translations-sk.json');
    expect(fileNameFrom("attachment; filename*=UTF-8''iam%20words.json", 'x.json')).toBe('iam words.json');
    expect(fileNameFrom('attachment; filename="../../etc/passwd"', 'x.json')).toBe('passwd');
    expect(fileNameFrom(null, 'translations-sk.json')).toBe('translations-sk.json');
  });
});

it('the languages go in the server’s order: their place, then their name, then their code', () => {
  expect(inLanguageOrder([CZECH, { ...SLOVAK, sort_order: 1 }, ENGLISH]).map((language) => language.code)).toEqual(['en', 'sk', 'cs']);
});
