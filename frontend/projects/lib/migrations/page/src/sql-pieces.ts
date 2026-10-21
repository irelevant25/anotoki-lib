/*
 * A migration's SQL in pieces, for the Migrations page to colour (0.9.1): the library's own small highlighter, no
 * package - PostgreSQL as the family's migrations write it, and nothing it would have to guess at:
 *
 *   comments       -- to the end of the line; block comments, nested as PostgreSQL nests them
 *   strings        '...' ('' inside), E'...' (a backslash escapes too), B'...', X'...', N'...' and U&'...'
 *   dollar quotes  $$ ... $$ and $tag$ ... $tag$: their delimiters - the body between them is SQL again, so that a
 *                  DO $$ ... $$ gate's PL/pgSQL, and a function's AS $$ ... $$, is coloured as the rest of the file
 *   names          "..." ("" inside) and U&"...": a quoted identifier is a name, never a string
 *   numbers        42, 3.14, .5, 1e-3, 1_000, 0x1F
 *   keywords       a word of the list below written in capitals, as the family writes every keyword - a word in
 *                  small letters is a name (the family's columns key, type, language, action, ...); TRUE, FALSE and
 *                  NULL in any case, as they can be nothing else
 *   types          a type's name in any case (the academies write theirs small: integer, timestamptz, ::text)
 *   operators      =, <>, ||, ::, :=, ->>, ... - and punctuation: ( ) [ ] , ; . :
 *
 * A word right after a dot is a name, whatever it says: a column of a table, a field of a record (NEW.updated_at,
 * n.oid). Anything else is plain text.
 *
 * The pieces are the text's characters in order, every one of them in exactly one piece: joined, they are the text.
 * Neighbours of one kind are one piece, and white space joins the piece before it - it shows no colour - so that a
 * page draws as few pieces as it can: a comment's lines, NOT NULL, ); are one each.
 *
 * One pass, forwards only, a token at a time: a file of a few hundred kB takes milliseconds. A dollar quote's body is
 * read on its own, so that nothing in it - a string, a comment - runs past its end; where it ends (the next place its
 * delimiter stands, whatever stands around it) is looked up in an index of every delimiter in the text, built as the
 * first one opens, never searched for from each opening again.
 */

/** What a piece of the SQL is; a piece of none of these kinds is plain text (a name, white space, anything else). */
export type SqlKind = 'keyword' | 'type' | 'string' | 'dollar' | 'number' | 'comment' | 'name' | 'operator' | 'punctuation';

/** A run of the text's characters, of one kind. */
export interface SqlPiece {
  /** null: plain text. */
  readonly kind: SqlKind | null;
  /** Its characters, exactly as the text has them. */
  readonly text: string;
}

/** A list of words, as one string: smaller in the bundle than an array of them. */
function words(list: string): ReadonlySet<string> {
  return new Set(list.split(' '));
}

/**
 * The keywords: PostgreSQL's that a migration writes - for its tables, indexes, constraints, views, sequences,
 * triggers and functions, its queries and changes - and PL/pgSQL's, which the DO $$ ... $$ gates are written in. In
 * capitals alone (above).
 */
const KEYWORDS = /* @__PURE__ */ words(
  'ACTION ADD AFTER ALL ALTER ALWAYS AND ANY ARRAY AS ASC AT BEFORE BEGIN BETWEEN BY CASCADE CASE CAST CHECK COALESCE ' +
    'COLLATE COLUMN COMMENT COMMIT CONCURRENTLY CONFLICT CONSTANT CONSTRAINT CONTINUE CREATE CROSS CURRENT_DATE ' +
    'CURRENT_TIMESTAMP CURRENT_USER DECLARE DEFAULT DEFERRABLE DEFERRED DEFINER DELETE DESC DETAIL DIAGNOSTICS DISABLE ' +
    'DISTINCT DO DOMAIN DROP EACH ELSE ELSIF ENABLE END ERRCODE EXCEPT EXCEPTION EXCLUDED EXECUTE EXISTS EXIT EXTENSION ' +
    'FALSE FILTER FIRST FOR FOREACH FOREIGN FOUND FROM FULL FUNCTION GENERATED GET GRANT GREATEST GROUP HAVING HINT ' +
    'IDENTITY IF ILIKE IMMUTABLE IN INCLUDE INCREMENT INDEX INITIALLY INNER INSERT INTERSECT INTO IS JOIN KEY LANGUAGE ' +
    'LAST LATERAL LEAST LEFT LIKE LIMIT LOCALTIMESTAMP LOOP MATERIALIZED MAXVALUE MESSAGE MINVALUE NEW NO NOT NOTHING ' +
    'NOTICE NULL NULLIF NULLS OF OFFSET OLD ON ONLY OR ORDER ORDINALITY OUTER OVER OWNED PARALLEL PARTITION PERFORM ' +
    'PRIMARY PROCEDURE RAISE RECURSIVE REFERENCES RENAME REPLACE RESTRICT RETURN RETURNING RETURNS REVOKE RIGHT ROLLBACK ' +
    'ROW ROWS ROW_COUNT SAFE SCHEMA SECURITY SELECT SEQUENCE SET SOME SQLERRM SQLSTATE STABLE START STORED STRICT TABLE ' +
    'TEMP TEMPORARY THEN TO TRANSACTION TRIGGER TRUE TRUNCATE TYPE UNION UNIQUE UPDATE USING VALID VALIDATE VALUES VIEW ' +
    'VOLATILE WARNING WHEN WHERE WHILE WITH WITHOUT ZONE',
);

/** The types' names, in capitals: a word that is one of them in any case is a type. */
const TYPES = /* @__PURE__ */ words(
  'BIGINT BIGSERIAL BIT BOOL BOOLEAN BYTEA CHAR CHARACTER DATE DECIMAL DOUBLE FLOAT FLOAT4 FLOAT8 INET INT INT2 INT4 ' +
    'INT8 INTEGER INTERVAL JSON JSONB NUMERIC PRECISION REAL RECORD REGCLASS SERIAL SMALLINT SMALLSERIAL TEXT TIME ' +
    'TIMESTAMP TIMESTAMPTZ TIMETZ UUID VARCHAR VARYING VOID',
);

/**
 * A token where the scan stands - its group says what it is: 1 white space (PostgreSQL's: no other); 2 a comment to
 * the line's end; 3 a block comment's opening (where it ends is counted: they nest); 4 a string - E'' with a
 * backslash's escapes, before B'', X'', N'', U&'' and '' - unclosed, to the end; 5 a quoted name; 6 a dollar quote's
 * delimiter; 7 a parameter, $1; 8 a number, never into a `..`; 9 a word (a letter, _ or any character past ASCII,
 * then digits and $ too: a$b is one name, and so is DO$$, as PostgreSQL reads them); 10 operators - .., :: and :=,
 * or a run ending where a comment begins; 11 punctuation. None: any other character, plain.
 */
const TOKEN =
  /([ \t\n\r\f\v]+)|(--[^\n]*)|(\/\*)|([Ee]'[^'\\]*(?:(?:\\[^]?|'')[^'\\]*)*'?|(?:[BbXxNn]|[Uu]&)?'[^']*(?:''[^']*)*'?)|((?:[Uu]&)?"[^"]*(?:""[^"]*)*"?)|(\$(?:[A-Za-z_\x80-\uffff][\w\x80-\uffff]*)?\$)|(\$\d+)|(0[XxOoBb][\dA-Fa-f_]+|(?:\d[\d_]*(?:\.(?!\.)[\d_]*)?|\.\d[\d_]*)(?:[Ee][+-]?\d+)?)|([A-Za-z_\x80-\uffff][\w$\x80-\uffff]*)|(\.\.|::|:=|(?:[+*<>=~!@#%^&|`?]|-(?!-)|\/(?!\*))+)|([()[\],;.:])|[^]/y;

/** The kind of each of TOKEN's groups that is a kind as it stands (the others are read on). */
const KINDS: readonly (SqlKind | null)[] = [null, null, 'comment', null, 'string', 'name', null, null, 'number', null, 'operator', 'punctuation'];

/** A block comment's marks, the opening and the closing. */
const COMMENT_MARKS = /\/\*|\*\//g;

/** Every dollar quote's delimiter in a text, overlapping ones too ($a$b$ holds $a$ and $b$): all but its closing $. */
const DELIMITERS = /\$(?:[A-Za-z_\x80-\uffff][\w\x80-\uffff]*)?(?=\$)/g;

/** The SQL in pieces: joined, they are `sql`, character for character. */
export function sqlPieces(sql: string): SqlPiece[] {
  const kinds: (SqlKind | null)[] = [];
  const starts: number[] = [];
  /** Something of `kind` begins at `at`: a piece of its own, unless the piece before it is of its kind. */
  const piece = (kind: SqlKind | null, at: number) => {
    if (kinds.length === 0 || kinds[kinds.length - 1] !== kind) {
      kinds.push(kind);
      starts.push(at);
    }
  };

  // What the scan reads - the whole text, or a dollar quote's body - where that begins in `sql`, where the scan stands
  // in it, and where the delimiter that closes it ends (its own end: none); the bodies' outer texts, innermost last.
  let text = sql;
  let base = 0;
  let at = 0;
  let close = sql.length;
  const outer: { text: string; base: number; close: number }[] = [];
  /** Where each delimiter stands, by its text (indexed as the first dollar quote opens), and how far each is used. */
  let delimiters: Map<string, number[]> | null = null;
  const used = new Map<string, number>();

  for (;;) {
    if (at >= text.length) {
      // What the scan read ends: a body's closing delimiter - unless the text, or the body around it, ended first.
      const end = base + text.length;
      if (close > end) {
        piece('dollar', end);
      }
      const around = outer.pop();
      if (!around) {
        break;
      }
      at = close - around.base;
      ({ text, base, close } = around);
      continue;
    }

    TOKEN.lastIndex = at;
    const token = TOKEN.exec(text)!;
    const start = base + at;
    at = TOKEN.lastIndex;
    const group = token.findIndex((value, n) => n > 0 && value !== undefined);

    if (group === 1) {
      // White space joins the piece before it; only the text's first is a piece (plain) of its own.
      if (kinds.length === 0) {
        piece(null, start);
      }
    } else if (group === 3) {
      at = commentEnd(text, at);
      piece('comment', start);
    } else if (group === 6) {
      // A dollar quote: its body is read on its own, to the next place its delimiter stands - PostgreSQL's end of it.
      const delimiter = token[6];
      const open = base + at;
      delimiters ??= indexDelimiters(sql);
      const places = delimiters.get(delimiter)!;
      let n = used.get(delimiter) ?? 0;
      while (n < places.length && places[n] < open) n++;
      used.set(delimiter, n);
      const closed = n < places.length && places[n] + delimiter.length <= base + text.length;
      const end = closed ? places[n] : base + text.length;
      piece('dollar', start);
      outer.push({ text, base, close });
      close = closed ? end + delimiter.length : end;
      text = sql.slice(open, end);
      base = open;
      at = 0;
    } else if (group === 9) {
      piece(wordKind(token[9], sql.charCodeAt(start - 1) === 46), start);
    } else {
      piece(KINDS[group] ?? null, start);
    }
  }

  return kinds.map((kind, n) => ({ kind, text: sql.slice(starts[n], starts[n + 1]) }));
}

/** What a word is: a keyword in capitals, a type in any case, or - after a dot, or none of them - a name. */
function wordKind(word: string, afterDot: boolean): SqlKind | null {
  if (afterDot) {
    return null;
  }
  if (KEYWORDS.has(word)) {
    return 'keyword';
  }
  const upper = word.toUpperCase();
  if (TYPES.has(upper)) {
    return 'type';
  }
  return upper === 'NULL' || upper === 'TRUE' || upper === 'FALSE' ? 'keyword' : null;
}

/** Where a block comment opened before `from` ends in `text`: past the star and slash that close it - those of the comments nested in it first - or at the end. */
function commentEnd(text: string, from: number): number {
  let depth = 1;
  COMMENT_MARKS.lastIndex = from;
  for (let mark = COMMENT_MARKS.exec(text); mark; mark = COMMENT_MARKS.exec(text)) {
    depth += mark[0] === '/*' ? 1 : -1;
    if (depth === 0) {
      return COMMENT_MARKS.lastIndex;
    }
  }
  return text.length;
}

/** Every place a dollar quote's delimiter stands in `sql`, by its text - those inside strings, comments and names too: a body ends wherever its delimiter next stands. */
function indexDelimiters(sql: string): Map<string, number[]> {
  const places = new Map<string, number[]>();
  DELIMITERS.lastIndex = 0;
  for (let found = DELIMITERS.exec(sql); found; found = DELIMITERS.exec(sql)) {
    const delimiter = found[0] + '$';
    let list = places.get(delimiter);
    if (!list) {
      places.set(delimiter, (list = []));
    }
    list.push(found.index);
  }
  return places;
}
