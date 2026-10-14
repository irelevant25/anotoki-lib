import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, words } from '../../../src/testing';
import { PageHeaderComponent } from './page-header.component';

@Component({
  selector: 'anotoki-test-page-headers',
  imports: [PageHeaderComponent],
  template: `
    <anotoki-page-header id="plain" heading="Builds" lead="Every build the sources know." />
    <anotoki-page-header id="own" heading="Furina" headingId="furina-title">
      <span pageEyebrow>Characters</span>
      <span pageLead>Hydro · from <a href="/sources/wanderers">Wanderer's Troupe</a> and <strong>2 more</strong></span>
      <button type="button">Import</button>
    </anotoki-page-header>
  `,
})
class PageHeadersComponent {}

describe('<anotoki-page-header>', () => {
  it('the one heading (focusable for the router), a lead in words, the actions beside', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(PageHeadersComponent);
    const plain = fixture.nativeElement.querySelector('#plain') as HTMLElement;
    const heading = plain.querySelector('h1')!;
    expect(heading.id).toBe('page-title');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(words(plain.querySelector('p.anotoki-page-header__lead'))).toBe('Every build the sources know.');
    // No lead of its own given: its box holds nothing (and is not drawn).
    expect(plain.querySelector('.anotoki-page-header__lead--own')?.childNodes.length).toBe(0);
    fixture.nativeElement.remove();
  });

  it('a lead with markup of its own (0.6.0): its links and words in the lead’s place, under the heading', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(PageHeadersComponent);
    const own = fixture.nativeElement.querySelector('#own') as HTMLElement;
    const lead = own.querySelector('.anotoki-page-header__lead--own')!;
    expect(lead.querySelector('[pageLead] a')?.getAttribute('href')).toBe('/sources/wanderers');
    expect(words(lead)).toBe("Hydro · from Wanderer's Troupe and 2 more");
    expect(own.querySelector('p.anotoki-page-header__lead')).toBeNull();
    const titles = Array.from(own.querySelector('.anotoki-page-header__titles')!.children);
    expect(titles.indexOf(own.querySelector('h1')!)).toBeLessThan(titles.indexOf(lead));
    expect(own.querySelector('h1')?.id).toBe('furina-title');
    expect(words(own.querySelector('.anotoki-page-header__actions'))).toBe('Import');
    fixture.nativeElement.remove();
  });
});
