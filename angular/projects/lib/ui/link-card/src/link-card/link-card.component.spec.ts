import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, words } from '../../../src/testing';
import { LinkCardComponent } from './link-card.component';

@Component({
  selector: 'anotoki-test-link-cards',
  imports: [LinkCardComponent],
  template: `
    <a anotokiLinkCard id="furina" href="/builds/genshin/furina">
      <h3>Furina</h3>
      <p>Hydro · Sword · 12 builds</p>
    </a>
    <a anotokiLinkCard id="next" href="/import" tone="highlight">Import your account</a>
  `,
})
class LinkCardsComponent {}

describe('[anotokiLinkCard]: a card that is one link as a whole', () => {
  it('a real link, the whole card its target and its name - its look from classes of its own', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(LinkCardsComponent);
    const host: HTMLElement = fixture.nativeElement;
    const card = host.querySelector<HTMLAnchorElement>('#furina')!;

    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toBe('/builds/genshin/furina');
    expect([...card.classList]).toEqual(['anotoki-link-card']);
    expect(card.hasAttribute('data-tone')).toBe(false);
    expect(words(card.querySelector('h3'))).toBe('Furina');
    expect(words(card.querySelector('p'))).toBe('Hydro · Sword · 12 builds');
    expect(host.querySelector('#next')?.getAttribute('data-tone')).toBe('highlight');
    expect(warn).not.toHaveBeenCalled();
    host.remove();
    warn.mockRestore();
  });

  it('warns in development about a control inside it: out of a keyboard’s and a screen reader’s reach', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    @Component({
      selector: 'anotoki-test-nested',
      imports: [LinkCardComponent],
      template: '<a anotokiLinkCard href="/builds">Furina <button type="button">Delete</button></a>',
    })
    class NestedComponent {}
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(NestedComponent);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('put it beside the card');
    fixture.nativeElement.remove();
    warn.mockRestore();
  });
});
