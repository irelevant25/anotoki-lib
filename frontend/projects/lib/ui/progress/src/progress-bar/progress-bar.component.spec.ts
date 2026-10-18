import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { ProgressBarComponent } from './progress-bar.component';

@Component({
  selector: 'anotoki-test-progress',
  imports: [ProgressBarComponent],
  template: `
    <anotoki-progress-bar id="upload" label="Uploading" [value]="sent()" />
    <anotoki-progress-bar id="files" label="Files" [value]="done()" [max]="10" format="count" showLabel showValue tone="success" />
    <anotoki-progress-bar id="score" label="Artifacts" [value]="87" valueText="87" showValue />
  `,
})
class ProgressPageComponent {
  readonly sent = signal<number | null>(45);
  readonly done = signal(3);
}

describe('<anotoki-progress-bar>: how far something has come', () => {
  async function setUp(language = 'en') {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => language })) });
    const fixture = await draw(ProgressPageComponent);
    const host: HTMLElement = fixture.nativeElement;
    const bar = (id: string) => host.querySelector<HTMLElement>(`#${id} [role=progressbar]`)!;
    return { fixture, host, page: fixture.componentInstance, bar };
  }

  it('a named progressbar with its value, its ends, and the value in words - its name said to screen readers alone', async () => {
    const { host, bar } = await setUp();
    expect(bar('upload').getAttribute('aria-label')).toBe('Uploading');
    expect(bar('upload').hasAttribute('aria-labelledby')).toBe(false);
    expect([bar('upload').getAttribute('aria-valuemin'), bar('upload').getAttribute('aria-valuemax'), bar('upload').getAttribute('aria-valuenow')]).toEqual(['0', '100', '45']);
    expect(bar('upload').getAttribute('aria-valuetext')).toBe('45%');
    expect(bar('upload').querySelector<HTMLElement>('.anotoki-progress-bar__fill')?.style.width).toBe('45%');
    expect(host.querySelector('#upload .anotoki-progress-bar__head')).toBeNull();
    host.remove();
  });

  it('counting: "3 of 10", its label shown over it and naming it, the value seen beside it and heard once', async () => {
    const { host, bar } = await setUp();
    const label = host.querySelector<HTMLElement>('#files .anotoki-progress-bar__label')!;
    expect(bar('files').getAttribute('aria-labelledby')).toBe(label.id);
    expect(words(label)).toBe('Files');
    expect(bar('files').getAttribute('aria-valuetext')).toBe('3 of 10');
    expect(bar('files').getAttribute('aria-valuenow')).toBe('3');
    const shown = host.querySelector<HTMLElement>('#files .anotoki-progress-bar__value')!;
    expect(words(shown)).toBe('3 of 10');
    expect(shown.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('#files')?.getAttribute('data-tone')).toBe('success');
    expect(bar('files').querySelector<HTMLElement>('.anotoki-progress-bar__fill')?.style.width).toBe('30%');
    host.remove();
  });

  it('in the page’s language: Slovak numbers and words', async () => {
    const { host, bar } = await setUp('sk');
    // Slovak keeps the number and its % together with a no-break space.
    expect(bar('upload').getAttribute('aria-valuetext')).toBe('45' + String.fromCharCode(0xa0) + '%');
    expect(bar('files').getAttribute('aria-valuetext')).toBe('3 z 10');
    host.remove();
  });

  it('the page’s own words for its value; a value past an end is held at it', async () => {
    const { fixture, host, page, bar } = await setUp();
    expect(bar('score').getAttribute('aria-valuetext')).toBe('87');
    expect(words(host.querySelector('#score .anotoki-progress-bar__value'))).toBe('87');

    page.done.set(14);
    await settle(fixture);
    expect(bar('files').getAttribute('aria-valuenow')).toBe('10');
    expect(bar('files').getAttribute('aria-valuetext')).toBe('10 of 10');
    host.remove();
  });

  it('with no value nobody knows how far: no value said, the bar moving on its own', async () => {
    const { fixture, host, page, bar } = await setUp();
    page.sent.set(null);
    await settle(fixture);
    expect(bar('upload').hasAttribute('aria-valuenow')).toBe(false);
    expect(bar('upload').hasAttribute('aria-valuetext')).toBe(false);
    expect(host.querySelector('#upload')?.classList).toContain('anotoki-progress-bar--indeterminate');
    expect(bar('upload').querySelector<HTMLElement>('.anotoki-progress-bar__fill')?.style.width).toBe('');
    host.remove();
  });
});
