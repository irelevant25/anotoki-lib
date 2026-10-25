import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { AudioPlayerComponent } from '@anotoki/lib/ui/audio-player';
import { CardComponent } from '@anotoki/lib/ui/card';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';

/** A short sound for the showcase, made here: three notes, a WAV of 8-bit samples - no file in the repository. */
function chime(): string {
  const rate = 8000;
  const notes = [523.25, 659.25, 783.99];
  const length = rate * 3;
  const data = new Uint8Array(44 + length);
  const view = new DataView(data.buffer);
  const text = (at: number, words: string) => [...words].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, length, true);
  for (let sample = 0; sample < length; sample++) {
    const note = notes[Math.floor(sample / rate)];
    const fade = 1 - (sample % rate) / rate;
    data[44 + sample] = 128 + Math.round(48 * fade * Math.sin((2 * Math.PI * note * sample) / rate));
  }
  return URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
}

/** The audio player (0.11.0): a sound with its name, one without, and one that cannot be played. */
@Component({
  selector: 'show-audio-player-demo',
  imports: [AudioPlayerComponent, CardComponent, PageHeaderComponent],
  templateUrl: './audio-player-demo.component.html',
  styleUrl: './audio-player-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioPlayerDemoComponent {
  protected readonly sound = chime();

  constructor() {
    inject(DestroyRef).onDestroy(() => URL.revokeObjectURL(this.sound));
  }
}
