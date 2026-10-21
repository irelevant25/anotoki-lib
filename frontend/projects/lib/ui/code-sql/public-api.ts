/*
 * @anotoki/lib/ui/code-sql - sqlPieces(): a text of PostgreSQL in pieces of its kinds (keywords, types, strings, dollar
 * quotes, numbers, comments, quoted names, operators, punctuation), joined the text again - the kit's highlighter of
 * SQL, which the Migrations page (0.9.1) and the code editor (@anotoki/lib/ui/code-editor, 0.9.2) colour with. An entry
 * point of its own, importing nothing: each of them takes it, and neither takes the other.
 */

export type { SqlKind, SqlPiece } from './src/sql-pieces';
export { sqlPieces } from './src/sql-pieces';
