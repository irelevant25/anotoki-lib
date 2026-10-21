/*
 * @anotoki/lib/ui/code-json - jsonPieces(): a JSON text in pieces of its kinds (keys, strings, numbers, true / false /
 * null, punctuation; anything else plain, so a text half typed still draws), joined the text again - the kit's
 * highlighter of JSON, which the code editor (@anotoki/lib/ui/code-editor, 0.9.2) colours with. An entry point of its
 * own, importing nothing.
 */

export type { JsonKind, JsonPiece } from './src/json-pieces';
export { jsonPieces } from './src/json-pieces';
