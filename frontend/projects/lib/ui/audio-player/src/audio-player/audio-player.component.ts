import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { AUDIO_PLAYER_LIBRARY_WORDS } from '@anotoki/lib/words/audio-player';
import { registerAudioPlayerIcons } from '../icons';

/** A length of a sound in minutes and seconds - 0:07, 3:05, 1:02:09 past an hour - the same digits in every language. */
export function writtenDuration(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/**
 * A sound to listen to: `<anotoki-audio-player [src]="line.audio" [label]="line.title" />` (genshin's voice lines and
 * demo music, its admin panel's uploaded files).
 *
 * A real `<audio>` element - its formats and buffering the browser's, only its metadata loaded before the person asks
 * for more - under the kit's controls: Play, which becomes Pause while it plays (its name and tooltip say which), Stop
 * (back to the start), the time it is at and how long it is, and a slider between them that says and moves where it is
 * ("Position", heard "0:32 of 3:05"; the arrow keys move it by seconds, a press or a drag anywhere on it). A group,
 * named by its `label` - shown above the controls, a file's name - or the library's "Audio player". A sound that cannot
 * be loaded or played says so in the controls' place (role="alert"). A new `src` starts again from nothing.
 */
@Component({
  selector: 'anotoki-audio-player',
  imports: [ButtonComponent, IconComponent],
  templateUrl: './audio-player.component.html',
  styleUrl: './audio-player.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-audio-player', role: 'group', '[attr.aria-label]': 'name()' },
})
export class AudioPlayerComponent {
  protected readonly word = pieceWords(AUDIO_PLAYER_LIBRARY_WORDS);

  /** The sound's address. */
  readonly src = input.required<string>();
  /** Shown above the controls, and the group's name: the file's name, the line's title. */
  readonly label = input<string | null>(null);
  /** It starts playing as soon as it can (the browser may refuse until the person has done something on the page). */
  readonly autoplay = input(false, { transform: booleanAttribute });

  /** Whether it plays now. */
  readonly playing = signal(false);
  /** Where it is, in seconds. */
  readonly currentTime = signal(0);
  /** How long it is, in seconds; 0 while it is not known (a stream of no length too). */
  readonly duration = signal(0);
  /** It could not be loaded or played. */
  readonly failed = signal(false);

  private readonly audio = viewChild<ElementRef<HTMLAudioElement>>('audio');

  protected readonly name = computed(() => this.label() || this.word('anotoki.audioPlayer.player').text);
  protected readonly elapsed = computed(() => writtenDuration(this.currentTime()));
  protected readonly total = computed(() => (this.duration() > 0 ? writtenDuration(this.duration()) : '-:--'));
  /** What a screen reader hears of the slider: "0:32 of 3:05". */
  protected readonly positionText = computed(() => this.word('anotoki.audioPlayer.positionText', { elapsed: this.elapsed(), total: this.total() }).text);

  constructor() {
    registerAudioPlayerIcons(inject(AnotokiIcons));
    // A new sound starts from nothing: the element loads it by itself.
    effect(() => {
      this.src();
      untracked(() => {
        this.playing.set(false);
        this.currentTime.set(0);
        this.duration.set(0);
        this.failed.set(false);
      });
    });
  }

  /** Play, or Pause while it plays. */
  toggle(): void {
    const audio = this.audio()?.nativeElement;
    if (!audio || this.failed()) {
      return;
    }
    if (audio.paused) {
      void Promise.resolve(audio.play()).catch((error: unknown) => {
        // A play the browser stops because a pause came first is no failure of the sound's.
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          this.failed.set(true);
        }
      });
    } else {
      audio.pause();
    }
  }

  /** Stops it, back at its start. */
  stop(): void {
    const audio = this.audio()?.nativeElement;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    this.currentTime.set(0);
  }

  protected onSeek(event: Event): void {
    const audio = this.audio()?.nativeElement;
    const to = Number((event.target as HTMLInputElement).value);
    if (!audio || !Number.isFinite(to) || this.duration() <= 0) {
      return;
    }
    audio.currentTime = Math.min(Math.max(0, to), this.duration());
    this.currentTime.set(audio.currentTime);
  }

  protected onMetadata(): void {
    // A stream of no known length says Infinity: no length, then.
    const duration = this.audio()?.nativeElement.duration ?? 0;
    this.duration.set(Number.isFinite(duration) && duration > 0 ? duration : 0);
  }

  protected onTime(): void {
    this.currentTime.set(this.audio()?.nativeElement.currentTime ?? 0);
  }
}
