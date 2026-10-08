import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, words } from '../testing';
import { BadgeComponent } from './badge.component';

@Component({
  selector: 'anotoki-test-badges',
  imports: [BadgeComponent],
  template: `
    <anotoki-badge id="neutral">Draft</anotoki-badge>
    <anotoki-badge id="done" tone="success" dot>Confirmed</anotoki-badge>
    <anotoki-badge id="version" mono>v0.2.0</anotoki-badge>
  `,
})
class BadgesComponent {}

describe('<anotoki-badge>', () => {
  it('a word, its tone a colour that repeats it; a dot before it on request; monospaced for a code', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(BadgesComponent);
    const host: HTMLElement = fixture.nativeElement;
    const badge = (id: string) => host.querySelector<HTMLElement>('#' + id)!;

    expect(badge('neutral').getAttribute('data-tone')).toBe('neutral');
    expect(badge('neutral').querySelector('.dot')).toBeNull();
    expect(badge('done').getAttribute('data-tone')).toBe('success');
    expect(badge('done').querySelector('.dot')?.getAttribute('aria-hidden')).toBe('true');
    expect(words(badge('done'))).toBe('Confirmed');
    expect(badge('version').classList).toContain('is-mono');
    host.remove();
  });
});
