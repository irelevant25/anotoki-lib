import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { AudioPlayerComponent, writtenDuration } from './audio-player.component';

@Component({
  selector: 'anotoki-test-audio-players',
  imports: [AudioPlayerComponent],
  template: `
    <anotoki-audio-player id="line" [src]="src()" label="Greeting" />
    <anotoki-audio-player id="plain" src="music.ogg" />
  `,
})
class AudioPlayersPageComponent {
  readonly src = signal('hello.ogg');
}

describe('<anotoki-audio-player>: a sound, its play and pause, where it is and how long', () => {
  const language = signal('en');
  let host: HTMLElement;
  let page: AudioPlayersPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<AudioPlayersPageComponent>>>;

  beforeEach(async () => {
    language.set('en');
    // jsdom plays nothing: a play and a pause say so as a browser does.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: false, configurable: true });
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: true, configurable: true });
      this.dispatchEvent(new Event('pause'));
    });
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language })) });
    fixture = await draw(AudioPlayersPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
    // Where the sound is: a plain number here, as jsdom keeps none.
    for (const element of Array.from(host.querySelectorAll('audio'))) {
      Object.defineProperty(element, 'currentTime', { value: 0, writable: true, configurable: true });
    }
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  const player = (id = 'line') => host.querySelector<HTMLElement>(`#${id}`)!;
  const audio = (id = 'line') => player(id).querySelector('audio')!;
  const play = (id = 'line') => player(id).querySelector<HTMLButtonElement>('.anotoki-audio-player__play')!;
  const seek = (id = 'line') => player(id).querySelector<HTMLInputElement>('.anotoki-audio-player__seek')!;
  const times = (id = 'line') => Array.from(player(id).querySelectorAll('.anotoki-audio-player__time')).map((time) => words(time));
  /** The sound's length known, as the browser says it once its metadata is in. */
  const loaded = async (seconds: number, id = 'line') => {
    Object.defineProperty(audio(id), 'duration', { value: seconds, configurable: true });
    audio(id).dispatchEvent(new Event('loadedmetadata'));
    await settle(fixture);
  };

  it('writes a length in minutes and seconds, the same in every language', () => {
    expect(writtenDuration(0)).toBe('0:00');
    expect(writtenDuration(7.9)).toBe('0:07');
    expect(writtenDuration(185)).toBe('3:05');
    expect(writtenDuration(3729)).toBe('1:02:09');
    expect(writtenDuration(Number.NaN)).toBe('0:00');
    expect(writtenDuration(-3)).toBe('0:00');
  });

  it('a group named by its label (or the library’s words), a real <audio> asking only for its metadata', () => {
    expect(player().getAttribute('role')).toBe('group');
    expect(player().getAttribute('aria-label')).toBe('Greeting');
    expect(player('plain').getAttribute('aria-label')).toBe('Audio player');
    expect(audio().getAttribute('preload')).toBe('metadata');
    expect(audio().getAttribute('src')).toBe('hello.ogg');
    expect(seek().disabled).toBe(true);
    expect(times()).toEqual(['0:00', '-:--']);
  });

  it('Play becomes Pause while it plays; Stop goes back to the start', async () => {
    expect(play().getAttribute('aria-label')).toBe('Play');
    play().click();
    await settle(fixture);
    expect(play().getAttribute('aria-label')).toBe('Pause');
    expect(play().getAttribute('title')).toBe('Pause');
    play().click();
    await settle(fixture);
    expect(play().getAttribute('aria-label')).toBe('Play');
    audio().currentTime = 30;
    audio().dispatchEvent(new Event('timeupdate'));
    await settle(fixture);
    player().querySelector<HTMLButtonElement>('.anotoki-audio-player__stop')!.click();
    await settle(fixture);
    expect(times()[0]).toBe('0:00');
  });

  it('the slider says where it is, in words a screen reader hears, and moves it', async () => {
    await loaded(185);
    expect(seek().disabled).toBe(false);
    expect(seek().max).toBe('185');
    expect(seek().getAttribute('aria-label')).toBe('Position');
    expect(seek().getAttribute('aria-valuetext')).toBe('0:00 of 3:05');
    seek().value = '65';
    seek().dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(audio().currentTime).toBe(65);
    expect(times()).toEqual(['1:05', '3:05']);
    expect(seek().getAttribute('aria-valuetext')).toBe('1:05 of 3:05');
    language.set('sk');
    await settle(fixture);
    expect(seek().getAttribute('aria-valuetext')).toBe('1:05 z 3:05');
    expect(play().getAttribute('aria-label')).toBe('Prehrať');
  });

  it('a sound that cannot be played says so in the controls’ place; a new sound starts from nothing', async () => {
    audio().dispatchEvent(new Event('error'));
    await settle(fixture);
    expect(player().querySelector('.anotoki-audio-player__controls')).toBeNull();
    expect(words(player().querySelector('[role="alert"]'))).toBe('This file could not be played.');
    page.src.set('again.ogg');
    await settle(fixture);
    expect(player().querySelector('.anotoki-audio-player__controls')).not.toBeNull();
    expect(times()).toEqual(['0:00', '-:--']);
  });
});
