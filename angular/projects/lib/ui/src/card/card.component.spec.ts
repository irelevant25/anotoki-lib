import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../testing';
import { CardComponent } from './card.component';

@Component({
  selector: 'anotoki-test-card',
  imports: [CardComponent],
  template: `
    <anotoki-card [heading]="heading()" subheading="Where you are signed in" headingId="sessions" [headingLevel]="level()" [flush]="flush()" tone="danger">
      <div cardActions><button type="button">Sign out everywhere</button></div>
      <p id="body">Two sessions</p>
    </anotoki-card>
  `,
})
class CardPageComponent {
  readonly heading = signal<string | null>('Sessions');
  readonly level = signal<2 | 3>(2);
  readonly flush = signal(false);
}

describe('<anotoki-card>', () => {
  it('a heading row with the actions beside it, then the body; an h2, or an h3 inside a section', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(CardPageComponent);
    const card = fixture.nativeElement.querySelector('anotoki-card') as HTMLElement;
    expect(card.querySelector('h2')?.id).toBe('sessions');
    expect(words(card.querySelector('h2'))).toBe('Sessions');
    expect(words(card.querySelector('.subtitle'))).toBe('Where you are signed in');
    expect(words(card.querySelector('.actions'))).toBe('Sign out everywhere');
    expect(card.querySelector('.body #body')).not.toBeNull();
    expect(card.getAttribute('data-tone')).toBe('danger');

    fixture.componentInstance.level.set(3);
    fixture.componentInstance.flush.set(true);
    await settle(fixture);
    expect(card.querySelector('h2')).toBeNull();
    expect(card.querySelector('h3')?.id).toBe('sessions');
    expect(card.classList).toContain('is-flush');

    fixture.componentInstance.heading.set(null);
    await settle(fixture);
    expect(card.querySelector('header')).toBeNull();
    fixture.nativeElement.remove();
  });
});
