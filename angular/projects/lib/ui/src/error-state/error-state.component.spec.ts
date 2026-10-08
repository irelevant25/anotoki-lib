import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { PageHeaderComponent } from '../page-header/page-header.component';
import { draw, kitProviders, settle, words } from '../testing';
import { ErrorStateComponent } from './error-state.component';

describe('<anotoki-error-state>, <anotoki-empty-state>, <anotoki-page-header>', () => {
  it('error state: an announced danger alert with the kit’s "Try again" in the page language, which emits retry', async () => {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => 'sk' })) });
    const fixture = await draw(ErrorStateComponent, { heading: 'Nepodarilo sa načítať', message: 'Server neodpovedá.' });
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    const alert = fixture.nativeElement.querySelector('anotoki-alert');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.getAttribute('data-tone')).toBe('danger');
    expect(words(alert.querySelector('.heading'))).toBe('Nepodarilo sa načítať');
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(words(button)).toBe('Skúsiť znova');
    button.click();
    expect(retry).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('retryLabel', 'Načítať znova');
    await settle(fixture);
    expect(words(button)).toBe('Načítať znova');
    fixture.nativeElement.remove();
  });

  it('empty state: an icon, a heading, a line, the actions', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(EmptyStateComponent, { heading: 'No tokens yet', text: 'Make one for a script.' });
    expect(words(fixture.nativeElement.querySelector('.heading'))).toBe('No tokens yet');
    expect(words(fixture.nativeElement.querySelector('.text'))).toBe('Make one for a script.');
    expect(fixture.nativeElement.querySelector('anotoki-icon path')).not.toBeNull();
    fixture.nativeElement.remove();
  });

  it('page header: the one h1, focusable for a router, with its id', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(PageHeaderComponent, { heading: 'Security', lead: 'How you sign in.' });
    const h1 = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(h1.id).toBe('page-title');
    expect(h1.getAttribute('tabindex')).toBe('-1');
    expect(words(fixture.nativeElement.querySelector('.lead'))).toBe('How you sign in.');
    fixture.componentRef.setInput('headingId', 'security-title');
    await settle(fixture);
    expect(h1.id).toBe('security-title');
    fixture.nativeElement.remove();
  });
});
