import { JsonPiece, jsonPieces } from './json-pieces';

/** The pieces as `kind:text` (`_` for plain text): a test reads them whole, in order. */
function show(json: string): string[] {
  return jsonPieces(json).map((piece) => `${piece.kind ?? '_'}:${piece.text}`);
}

/** The pieces hold the text, all of it, in order - none empty, no two neighbours of one kind (they would be one piece). */
function expectWhole(json: string, pieces: JsonPiece[], what: string): void {
  expect(pieces.map((piece) => piece.text).join(''), what).toBe(json);
  expect(
    pieces.findIndex((piece, n) => piece.text === '' || (n > 0 && pieces[n - 1].kind === piece.kind)),
    `${what}: an empty piece, or neighbours of one kind`,
  ).toBe(-1);
}

describe('jsonPieces(): JSON in pieces to colour, the code editor’s - and a text half typed drawn as it stands', () => {
  it('keys apart from string values (a colon after them, white space between or not), numbers, true, false, null, punctuation', () => {
    expect(show('{"name": "Furina", "level": 3}')).toEqual([
      'punctuation:{',
      'key:"name"',
      'punctuation:: ',
      'string:"Furina"',
      'punctuation:, ',
      'key:"level"',
      'punctuation:: ',
      'number:3',
      'punctuation:}',
    ]);
    expect(show('{\n  "a" :\n  1\n}')).toEqual(['punctuation:{\n  ', 'key:"a" ', 'punctuation::\n  ', 'number:1\n', 'punctuation:}']);
    expect(show('[-12, 3.5, 1e-3, 2E+10, true, false, null]')).toEqual([
      'punctuation:[',
      'number:-12',
      'punctuation:, ',
      'number:3.5',
      'punctuation:, ',
      'number:1e-3',
      'punctuation:, ',
      'number:2E+10',
      'punctuation:, ',
      'literal:true',
      'punctuation:, ',
      'literal:false',
      'punctuation:, ',
      'literal:null',
      'punctuation:]',
    ]);
    // A string's escapes are its own: \" ends nothing.
    expect(show('{"quote": "a \\" b"}')).toEqual(['punctuation:{', 'key:"quote"', 'punctuation:: ', 'string:"a \\" b"', 'punctuation:}']);
  });

  it('anything invalid is plain text - a word not true, false or null, a sign or a dot alone, characters JSON has no use for', () => {
    expect(show('{a: tru, "x": undefined, "y": True}')).toEqual([
      'punctuation:{',
      '_:a',
      'punctuation:: ',
      '_:tru',
      'punctuation:, ',
      'key:"x"',
      'punctuation:: ',
      '_:undefined',
      'punctuation:, ',
      'key:"y"',
      'punctuation:: ',
      '_:True',
      'punctuation:}',
    ]);
    expect(show('1. - 1e + @ é')).toEqual(['number:1', '_:. - ', 'number:1', '_:e + @ é']);
  });

  it('half typed: a string not closed runs to its line’s end - never a key - and the lines under it read as they are', () => {
    expect(show('{"name": "Ka')).toEqual(['punctuation:{', 'key:"name"', 'punctuation:: ', 'string:"Ka']);
    expect(show('{"na')).toEqual(['punctuation:{', 'string:"na']);
    expect(show('{"a\n  "b": 1}')).toEqual(['punctuation:{', 'string:"a\n  ', 'key:"b"', 'punctuation:: ', 'number:1', 'punctuation:}']);
    expect(show('"abc\\')).toEqual(['string:"abc\\']);
    expect(jsonPieces('')).toEqual([]);
    expect(show('  \n ')).toEqual(['_:  \n ']);
  });

  it('markup and a template’s braces are characters like any other: <script>, </span>, {{ }}', () => {
    const json = '{"<script>": "</span><b>x</b>", "{{ 1 + 1 }}": 2}';
    expect(show(json)).toEqual(['punctuation:{', 'key:"<script>"', 'punctuation:: ', 'string:"</span><b>x</b>"', 'punctuation:, ', 'key:"{{ 1 + 1 }}"', 'punctuation:: ', 'number:2', 'punctuation:}']);
    expectWhole(json, jsonPieces(json), 'markup');
  });

  it('anything at all: joined, the pieces are the text - 2000 texts of JSON’s awkward characters, and a large one quickly', () => {
    // A small fixed generator (mulberry32): the same texts on every run.
    let seed = 2026;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const parts = `{ } [ ] , : " \\ \\" "a" "a": 1 -2.5 1e5 - . e true false null tru x é \u{1F600}`.split(' ').concat(['\n', '\r\n', ' ', '\t']);
    for (let n = 0; n < 2000; n++) {
      const json = Array.from({ length: Math.floor(random() * 40) }, () => parts[Math.floor(random() * parts.length)]).join('');
      expectWhole(json, jsonPieces(json), JSON.stringify(json));
    }

    const large = JSON.stringify(
      Array.from({ length: 2000 }, (_, n) => ({ id: n, name: `Character ${n}`, rarity: n % 5, weights: [1.5, -2, 3e2], active: n % 3 === 0, note: null })),
      null,
      2,
    );
    const started = performance.now();
    const pieces = jsonPieces(large);
    expect(performance.now() - started, `${Math.round(large.length / 1024)} kB`).toBeLessThan(1000);
    expectWhole(large, pieces, 'the large text');
  });
});
