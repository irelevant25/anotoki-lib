/*
 * @anotoki/lib/ui/piece-words - pieceWords(): how a piece of the kit that is an entry point of its own (the chips, the
 * progress bar, ...) reads its own words - the site's string for the library key first (the database's, through
 * provideAnotokiUi's `lookup`), then the piece's built-in words (@anotoki/lib/words/<namespace>). A small entry point
 * of its own: those pieces are lazy, and nothing of them belongs in a first load. Not re-exported by @anotoki/lib/ui.
 */

export type { PieceWord, PieceWordTable } from './src/piece-words';
export { pieceWords } from './src/piece-words';
