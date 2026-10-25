/*
 * @anotoki/lib/words/audio-player - the anotoki library's own words of `anotoki.audioPlayer.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's audio player
 * (@anotoki/lib/ui/audio-player), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the audio player alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.audioPlayer.player': 'Audio player',
  'anotoki.audioPlayer.play': 'Play',
  'anotoki.audioPlayer.pause': 'Pause',
  'anotoki.audioPlayer.stop': 'Stop',
  'anotoki.audioPlayer.position': 'Position',
  'anotoki.audioPlayer.positionText': '{elapsed} of {total}',
  'anotoki.audioPlayer.failed': 'This file could not be played.',
} as const;

/** A key of these words. */
export type AudioPlayerLibraryKey = keyof typeof EN;

const SK: Readonly<Record<AudioPlayerLibraryKey, string>> = {
  'anotoki.audioPlayer.player': 'Prehrávač zvuku',
  'anotoki.audioPlayer.play': 'Prehrať',
  'anotoki.audioPlayer.pause': 'Pozastaviť',
  'anotoki.audioPlayer.stop': 'Zastaviť',
  'anotoki.audioPlayer.position': 'Pozícia',
  'anotoki.audioPlayer.positionText': '{elapsed} z {total}',
  'anotoki.audioPlayer.failed': 'Tento súbor sa nepodarilo prehrať.',
};

/** These words, per language: English and Slovak, each with every key. */
export const AUDIO_PLAYER_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<AudioPlayerLibraryKey, string>>>> = { en: EN, sk: SK };
