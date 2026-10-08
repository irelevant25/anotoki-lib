import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../testing';
import { AlertComponent } from './alert.component';

@Component({
  selector: 'anotoki-test-alert',
  imports: [AlertComponent],
  template: `
    <anotoki-alert [tone]="tone()" [heading]="heading()" [announce]="announce()">
      Your address is not confirmed yet.
      <div alertActions><button type="button">Send again</button></div>
    </anotoki-alert>
  `,
})
class AlertPageComponent {
  readonly tone = signal<'info' | 'success' | 'warning' | 'danger'>('info');
  readonly heading = signal<string | null>(null);
  readonly announce = signal<boolean | 'polite'>(false);
}

describe('<anotoki-alert>', () => {
  it('a notice that is part of the page is not announced; one the person caused is, at once or politely', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(AlertPageComponent);
    const alert = fixture.nativeElement.querySelector('anotoki-alert') as HTMLElement;
    expect(alert.getAttribute('role')).toBeNull();
    expect(alert.getAttribute('data-tone')).toBe('info');
    expect(alert.querySelector('.heading')).toBeNull();
    expect(words(alert.querySelector('.text'))).toBe('Your address is not confirmed yet.');
    expect(words(alert.querySelector('.actions'))).toBe('Send again');

    fixture.componentInstance.announce.set(true);
    fixture.componentInstance.tone.set('danger');
    fixture.componentInstance.heading.set('Not signed in');
    await settle(fixture);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.getAttribute('data-tone')).toBe('danger');
    expect(words(alert.querySelector('.heading'))).toBe('Not signed in');

    fixture.componentInstance.announce.set('polite');
    await settle(fixture);
    expect(alert.getAttribute('role')).toBe('status');
    fixture.nativeElement.remove();
  });
});
