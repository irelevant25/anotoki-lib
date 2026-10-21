import { SqlPiece, sqlPieces } from './sql-pieces';

/** The pieces as `kind:text` (`_` for plain text): a test reads them whole, in order. */
function show(sql: string): string[] {
  return sqlPieces(sql).map((piece) => `${piece.kind ?? '_'}:${piece.text}`);
}

/**
 * The pieces hold the text, all of it, in order - none empty, none beginning inside a character (the second half of
 * one past the BMP), no two neighbours of one kind (they would be one piece).
 */
function expectWhole(sql: string, pieces: SqlPiece[], what: string): void {
  expect(pieces.map((piece) => piece.text).join(''), what).toBe(sql);
  expect(
    pieces.findIndex((piece) => piece.text === ''),
    `${what}: an empty piece`,
  ).toBe(-1);
  expect(
    pieces.findIndex((piece) => /^[\uDC00-\uDFFF]/.test(piece.text)),
    `${what}: a character parted`,
  ).toBe(-1);
  expect(
    pieces.findIndex((piece, n) => n > 0 && pieces[n - 1].kind === piece.kind),
    `${what}: neighbours of one kind`,
  ).toBe(-1);
}

/** The few calls of Node's that this spec makes: the specs run on Node (Vitest), and the package's types know no Node. */
interface NodeFiles {
  existsSync(path: string): boolean;
  readdirSync(path: string, options: { recursive: true }): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

/** Node's own module `name`, by a name the build leaves alone. */
function nodeModule<T>(name: string): Promise<T> {
  return import(/* @vite-ignore */ `node:${name}`) as Promise<T>;
}

/** Every migration file of the library, by its path under backend/migrations: the SQL the family writes. */
async function libraryMigrations(): Promise<Map<string, string>> {
  const fs = await nodeModule<NodeFiles>('fs');
  const { cwd } = await nodeModule<{ cwd(): string }>('process');
  // The tests run in frontend/ (bun run test); backend/ is beside it.
  const root = ['../backend/migrations', 'backend/migrations'].map((path) => `${cwd()}/${path}`).find((path) => fs.existsSync(path));
  expect(root, 'backend/migrations, from the folder the tests run in').toBeDefined();
  const files = fs
    .readdirSync(root!, { recursive: true })
    .map((path) => path.replace(/\\/g, '/'))
    .filter((path) => path.endsWith('.sql'))
    .sort();
  return new Map(files.map((path) => [path, fs.readFileSync(`${root}/${path}`, 'utf8')]));
}

describe('sqlPieces(): a migration’s SQL in pieces for the Migrations page’s colours - PostgreSQL as the family writes it', () => {
  it('comments: -- to the end of the line, and block comments - nested, as PostgreSQL nests them - whatever they hold', () => {
    expect(show("-- SELECT 'it' $$\nSELECT 1")).toEqual(["comment:-- SELECT 'it' $$\n", 'keyword:SELECT ', 'number:1']);
    expect(show('/* a /* nested */ still a comment */ x')).toEqual(['comment:/* a /* nested */ still a comment */ ', '_:x']);
    // Not closed: to the end.
    expect(show('x /* to the end')).toEqual(['_:x ', 'comment:/* to the end']);
    // One begins inside a run of operator characters, as PostgreSQL begins it.
    expect(show('a+--b')).toEqual(['_:a', 'operator:+', 'comment:--b']);
  });

  it("strings: '...' with '' inside; E'...' with a backslash's escapes too, and a backslash in the others as it stands; B'', X'', N'', U&''", () => {
    expect(show("'it''s' x")).toEqual(["string:'it''s' ", '_:x']);
    expect(show("E'it\\'s' x")).toEqual(["string:E'it\\'s' ", '_:x']);
    expect(show("e'\\\\' x")).toEqual(["string:e'\\\\' ", '_:x']);
    expect(show("'C:\\' x")).toEqual(["string:'C:\\' ", '_:x']);
    expect(show("B'101', X'1F', N'x', U&'d\\0061t'")).toEqual(["string:B'101'", 'punctuation:, ', "string:X'1F'", 'punctuation:, ', "string:N'x'", 'punctuation:, ', "string:U&'d\\0061t'"]);
    // A longer word before a quote is a name, the quote another string's.
    expect(show("type'x'")).toEqual(['_:type', "string:'x'"]);
    // Not closed: to the end.
    expect(show("SELECT 'to the end")).toEqual(['keyword:SELECT ', "string:'to the end"]);
  });

  it('dollar quotes: $$ and $tag$ - the body between them SQL again, so a DO $$ gate’s PL/pgSQL is coloured as the rest', () => {
    expect(show("DO $$\nBEGIN\n    RAISE NOTICE 'x';\nEND $$;")).toEqual([
      'keyword:DO ',
      'dollar:$$\n',
      'keyword:BEGIN\n    RAISE NOTICE ',
      "string:'x'",
      'punctuation:;\n',
      'keyword:END ',
      'dollar:$$',
      'punctuation:;',
    ]);
    // A tag, and another inside it.
    expect(show('AS $f$ BEGIN EXECUTE $q$ SELECT 1 $q$; END $f$')).toEqual([
      'keyword:AS ',
      'dollar:$f$ ',
      'keyword:BEGIN EXECUTE ',
      'dollar:$q$ ',
      'keyword:SELECT ',
      'number:1 ',
      'dollar:$q$',
      'punctuation:; ',
      'keyword:END ',
      'dollar:$f$',
    ]);
    // Not closed: the body runs to the end.
    expect(show('DO $$ BEGIN')).toEqual(['keyword:DO ', 'dollar:$$ ', 'keyword:BEGIN']);
  });

  it('a body ends where its delimiter next stands - in what would be a comment or a string, as PostgreSQL ends it; outside a body, $$ in a string or a comment is theirs', () => {
    expect(show('DO $$ BEGIN -- $$ x')).toEqual(['keyword:DO ', 'dollar:$$ ', 'keyword:BEGIN ', 'comment:-- ', 'dollar:$$ ', '_:x']);
    expect(show("DO $$ SELECT 'a$$' $$")).toEqual(['keyword:DO ', 'dollar:$$ ', 'keyword:SELECT ', "string:'a", 'dollar:$$', "string:' $$"]);
    expect(show("SELECT '$$', 1 -- $$")).toEqual(['keyword:SELECT ', "string:'$$'", 'punctuation:, ', 'number:1 ', 'comment:-- $$']);
    // $1 (a parameter), a $ alone, a$b and DO$$ (names, as PostgreSQL reads them) are plain.
    expect(show('SELECT $1, $ x, a$b, DO$$')).toEqual(['keyword:SELECT ', '_:$1', 'punctuation:, ', '_:$ x', 'punctuation:, ', '_:a$b', 'punctuation:, ', '_:DO$$']);
  });

  it('quoted names: "..." with "" inside, and U&"..." - a name, never a string or a keyword', () => {
    expect(show('"SELECT", "it\'s", "a""b", U&"d"')).toEqual(['name:"SELECT"', 'punctuation:, ', 'name:"it\'s"', 'punctuation:, ', 'name:"a""b"', 'punctuation:, ', 'name:U&"d"']);
  });

  it('numbers: 42, 3.14, .5, 1., 1e-3, 2E+10, 1_000, 0x1F - an e with no digits is not one’s, and 1..10 is two', () => {
    expect(show('42, 3.14, .5, 1., 1e-3, 2E+10, 1_000, 0x1F, 1e')).toEqual([
      'number:42',
      'punctuation:, ',
      'number:3.14',
      'punctuation:, ',
      'number:.5',
      'punctuation:, ',
      'number:1.',
      'punctuation:, ',
      'number:1e-3',
      'punctuation:, ',
      'number:2E+10',
      'punctuation:, ',
      'number:1_000',
      'punctuation:, ',
      'number:0x1F',
      'punctuation:, ',
      'number:1',
      '_:e',
    ]);
    expect(show('FOR i IN 1..10 LOOP')).toEqual(['keyword:FOR ', '_:i ', 'keyword:IN ', 'number:1', 'operator:..', 'number:10 ', 'keyword:LOOP']);
  });

  it('keywords in capitals, as the family writes them: a word in small letters is a name - its columns key, type, language, action', () => {
    expect(show('SELECT select Select')).toEqual(['keyword:SELECT ', '_:select Select']);
    expect(show('CREATE TABLE t (key TEXT, type TEXT, language TEXT, action TEXT)')).toEqual([
      'keyword:CREATE TABLE ',
      '_:t ',
      'punctuation:(',
      '_:key ',
      'type:TEXT',
      'punctuation:, ',
      '_:type ',
      'type:TEXT',
      'punctuation:, ',
      '_:language ',
      'type:TEXT',
      'punctuation:, ',
      '_:action ',
      'type:TEXT',
      'punctuation:)',
    ]);
    // TRUE, FALSE and NULL in any case: they can be nothing else.
    expect(show('true False NULL null')).toEqual(['keyword:true False NULL null']);
    // After a dot, a word is a name - a column, a record's field - in capitals too.
    expect(show('NEW.updated_at := NEW.TYPE')).toEqual(['keyword:NEW', 'punctuation:.', '_:updated_at ', 'operator::= ', 'keyword:NEW', 'punctuation:.', '_:TYPE']);
  });

  it('the PL/pgSQL of a gate: its keywords, types, strings and operators, its names plain', () => {
    const gate =
      "DO $$\nDECLARE\n    problems TEXT[] := ARRAY[]::TEXT[];\nBEGIN\n    IF NOT FOUND THEN\n        RAISE EXCEPTION 'anotoki 001: %.', array_to_string(problems, '; ');\n    END IF;\nEND $$;";
    expect(show(gate)).toEqual([
      'keyword:DO ',
      'dollar:$$\n',
      'keyword:DECLARE\n    ',
      '_:problems ',
      'type:TEXT',
      'punctuation:[] ',
      'operator::= ',
      'keyword:ARRAY',
      'punctuation:[]',
      'operator:::',
      'type:TEXT',
      'punctuation:[];\n',
      'keyword:BEGIN\n    IF NOT FOUND THEN\n        RAISE EXCEPTION ',
      "string:'anotoki 001: %.'",
      'punctuation:, ',
      '_:array_to_string',
      'punctuation:(',
      '_:problems',
      'punctuation:, ',
      "string:'; '",
      'punctuation:);\n    ',
      'keyword:END IF',
      'punctuation:;\n',
      'keyword:END ',
      'dollar:$$',
      'punctuation:;',
    ]);
  });

  it('types in any case - VARCHAR(100), timestamptz, ::text, TEXT[], DOUBLE PRECISION - but after a dot a name (n.oid)', () => {
    expect(show('VARCHAR(100) timestamptz x::text TEXT[] DOUBLE PRECISION n.oid')).toEqual([
      'type:VARCHAR',
      'punctuation:(',
      'number:100',
      'punctuation:) ',
      'type:timestamptz ',
      '_:x',
      'operator:::',
      'type:text TEXT',
      'punctuation:[] ',
      'type:DOUBLE PRECISION ',
      '_:n',
      'punctuation:.',
      '_:oid',
    ]);
  });

  it('operators and punctuation: <>, ||, ::, :=, ->>, !~* and ( ) [ ] , ; . : - anything else plain, as it stands', () => {
    expect(show('a <> b || c::d := e->>f !~* g')).toEqual([
      '_:a ',
      'operator:<> ',
      '_:b ',
      'operator:|| ',
      '_:c',
      'operator:::',
      '_:d ',
      'operator::= ',
      '_:e',
      'operator:->>',
      '_:f ',
      'operator:!~* ',
      '_:g',
    ]);
    expect(show('( ) [ ] , ; . :')).toEqual(['punctuation:( ) [ ] , ; . :']);
    expect(show('{ } \\ é')).toEqual(['_:{ } \\ é']);
  });

  it('neighbours of one kind are one piece, white space joining the piece before it - as few as a page can draw', () => {
    expect(show('  NOT NULL);\n-- a\n-- b\n')).toEqual(['_:  ', 'keyword:NOT NULL', 'punctuation:);\n', 'comment:-- a\n-- b\n']);
    expect(show(' \n ')).toEqual(['_: \n ']);
    expect(sqlPieces('')).toEqual([]);
  });

  it('markup and a template’s braces are characters like any other: <script>, </span>, {{ }}', () => {
    const sql = '<script>alert(1)</script></span>{{ 1 + 1 }}';
    expect(show(sql)).toEqual([
      'operator:<',
      '_:script',
      'operator:>',
      '_:alert',
      'punctuation:(',
      'number:1',
      'punctuation:)',
      'operator:</',
      '_:script',
      'operator:></',
      '_:span',
      'operator:>',
      '_:{{ ',
      'number:1 ',
      'operator:+ ',
      'number:1 ',
      '_:}}',
    ]);
    expectWhole(sql, sqlPieces(sql), 'markup');
  });

  it('every migration file of the library: the pieces, joined, are the file - character for character', async () => {
    const files = await libraryMigrations();
    expect(files.size).toBeGreaterThanOrEqual(16);
    for (const [path, sql] of files) {
      const pieces = sqlPieces(sql);
      expectWhole(sql, pieces, path);
      expect(
        pieces.some((piece) => piece.kind === 'keyword'),
        `${path}: its keywords`,
      ).toBe(true);
      // Each DO $$ gate opens a dollar quote, and every one closes: the gates' PL/pgSQL between them is coloured as code.
      const delimiters = new Set<number>();
      let at = 0;
      for (const piece of pieces) {
        if (piece.kind === 'dollar') {
          for (const match of piece.text.matchAll(/\$\$/g)) {
            delimiters.add(at + match.index);
          }
        }
        at += piece.text.length;
      }
      for (const gate of sql.matchAll(/^DO \$\$/gm)) {
        expect(delimiters.has(gate.index + 3), `${path}: the gate at ${gate.index}`).toBe(true);
      }
      expect(delimiters.size % 2, `${path}: every dollar quote closed`).toBe(0);
    }
  });

  it('anything at all: the pieces are the text, character for character - 3000 texts of SQL’s awkward characters', () => {
    // A small fixed generator (mulberry32): the same texts on every run.
    let seed = 2026;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Quotes of every kind, dollar signs, comments' marks, a backslash, dots, colons, white space, words, a letter past
    // ASCII and one past the BMP (two UTF-16 units, never parted).
    const parts = `$ $$ $a$ $1 ' '' " E' U&' U&" \\ -- /* */ . .. : :: = - * / ( ) ; 1 2.5 e x DO SELECT select text NULL é \u{1F600}`.split(' ').concat(['\n', '\r\n', ' ', '\t']);
    for (let n = 0; n < 3000; n++) {
      const sql = Array.from({ length: Math.floor(random() * 60) }, () => parts[Math.floor(random() * parts.length)]).join('');
      expectWhole(sql, sqlPieces(sql), JSON.stringify(sql));
    }
  });

  it('is quick: a few hundred kB in well under a second, the awkward too (dollar quotes never closed, comments never closed)', async () => {
    const files = await libraryMigrations();
    const big = [...files.values()].join('\n').repeat(3);
    const awkward = [Array.from({ length: 50_000 }, (_, n) => `$t${n}$ x`).join(' '), "$$'".repeat(100_000), '/*'.repeat(150_000), "'".repeat(300_000)];
    for (const sql of [big, ...awkward]) {
      const started = performance.now();
      const pieces = sqlPieces(sql);
      const took = performance.now() - started;
      expect(sql.length).toBeGreaterThan(290_000);
      expect(took, `${Math.round(sql.length / 1024)} kB took ${Math.round(took)} ms`).toBeLessThan(1000);
      expect(pieces.map((piece) => piece.text).join('') === sql).toBe(true);
    }
  });
});
