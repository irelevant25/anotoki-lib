/*
 * JSON in pieces, to colour (0.9.2): the code editor's highlighter - keys apart from string values, numbers, true,
 * false and null, and punctuation - and anything else plain text, so that a text half typed still draws as it stands:
 *
 *   key           a string a colon follows, white space between them or not: "name" in "name": "Furina"
 *   string        "..." with its escapes; one not closed yet runs to its line's end and no further - JSON's strings
 *                 never cross a line - so the lines under it read as they are
 *   number        -12, 3.5, 1e-3
 *   literal       true, false, null, each a whole word: tru, True and undefined are plain
 *   punctuation   { } [ ] , :
 *
 * As the SQL's (@anotoki/lib/ui/code-sql): the pieces are the text's characters in order, every one of them in
 * exactly one piece - joined, they are the text; neighbours of one kind are one piece, and white space joins the piece
 * before it. One pass, forwards only.
 */

/** What a piece of the JSON is; a piece of none of these kinds is plain text (white space, anything else). */
export type JsonKind = 'key' | 'string' | 'number' | 'literal' | 'punctuation';

/** A run of the text's characters, of one kind. */
export interface JsonPiece {
  /** null: plain text. */
  readonly kind: JsonKind | null;
  /** Its characters, exactly as the text has them. */
  readonly text: string;
}

/**
 * A token where the scan stands - its group says what it is: 1 white space (JSON's, no other); 2 a string to its
 * closing quote, 3 (empty while it is not closed: then to its line's end); 4 a number; 5 a word; 6 punctuation.
 * None: any other character, plain.
 */
const TOKEN = /([ \t\n\r]+)|("[^"\\\n\r]*(?:\\[^\n\r]?[^"\\\n\r]*)*)("?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_$][\w$]*)|([{}[\],:])|[^]/y;

/** What makes a string a key: a colon after it, white space between them or not. */
const COLON = /[ \t\n\r]*:/y;

/** The JSON in pieces: joined, they are `json`, character for character. */
export function jsonPieces(json: string): JsonPiece[] {
  const kinds: (JsonKind | null)[] = [];
  const starts: number[] = [];
  /** Something of `kind` begins at `at`: a piece of its own, unless the piece before it is of its kind. */
  const piece = (kind: JsonKind | null, at: number) => {
    if (kinds.length === 0 || kinds[kinds.length - 1] !== kind) {
      kinds.push(kind);
      starts.push(at);
    }
  };

  for (let at = 0; at < json.length; ) {
    TOKEN.lastIndex = at;
    const token = TOKEN.exec(json)!;
    const start = at;
    at = TOKEN.lastIndex;

    if (token[1] !== undefined) {
      // White space joins the piece before it; only the text's first is a piece (plain) of its own.
      if (kinds.length === 0) {
        piece(null, start);
      }
    } else if (token[2] !== undefined) {
      COLON.lastIndex = at;
      piece(token[3] && COLON.test(json) ? 'key' : 'string', start);
    } else if (token[4] !== undefined) {
      piece('number', start);
    } else if (token[5] !== undefined) {
      piece(token[5] === 'true' || token[5] === 'false' || token[5] === 'null' ? 'literal' : null, start);
    } else {
      piece(token[6] !== undefined ? 'punctuation' : null, start);
    }
  }

  return kinds.map((kind, n) => ({ kind, text: json.slice(starts[n], starts[n + 1]) }));
}
