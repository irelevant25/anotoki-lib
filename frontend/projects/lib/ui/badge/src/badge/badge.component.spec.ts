import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, words } from '../../../src/testing';
import { BadgeComponent } from './badge.component';

@Component({
  selector: 'anotoki-test-badges',
  imports: [BadgeComponent],
  template: `
    <anotoki-badge id="neutral">Draft</anotoki-badge>
    <anotoki-badge id="done" tone="success" dot>Confirmed</anotoki-badge>
    <anotoki-badge id="version" mono>v0.2.0</anotoki-badge>
    <anotoki-badge id="section" tone="info" wrap>Vocabulary, kanji and grammar in context</anotoki-badge>
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
    expect(badge('neutral').querySelector('.anotoki-badge__dot')).toBeNull();
    expect(badge('done').getAttribute('data-tone')).toBe('success');
    expect(badge('done').querySelector('.anotoki-badge__dot')?.getAttribute('aria-hidden')).toBe('true');
    expect(words(badge('done'))).toBe('Confirmed');
    expect(badge('version').classList).toContain('anotoki-badge--mono');
    expect(badge('version').classList).not.toContain('anotoki-badge--wrap');
    host.remove();
  });

  it('words that may be long wrap inside it on request (0.6.0): its own class, the words as they are', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(BadgesComponent);
    const host: HTMLElement = fixture.nativeElement;
    const section = host.querySelector<HTMLElement>('#section')!;

    expect([...section.classList]).toEqual(['anotoki-badge', 'anotoki-badge--wrap']);
    expect(words(section)).toBe('Vocabulary, kanji and grammar in context');
    host.remove();
  });
});
