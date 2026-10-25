/*
 * @anotoki/lib/ui/audio-player (0.11.0) - <anotoki-audio-player>: a sound - a character's voice line, a demo's music,
 * an uploaded file - with Play and Pause, Stop, a slider that says and moves where it is, and how long it is; on a real
 * <audio> element, so the formats and the buffering are the browser's. Genshin's player, for every site. Its words
 * (`anotoki.audioPlayer.*`) are @anotoki/lib/words/audio-player, read by the player itself.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export { AudioPlayerComponent, writtenDuration } from './src/audio-player/audio-player.component';
