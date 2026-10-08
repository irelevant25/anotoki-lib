import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { PaginationComponent } from './pagination.component';

describe('<anotoki-pagination>', () => {
  it('"51-100 of 230" with Previous and Next, in the page language; each end disables its way', async () => {
    const language = signal('en');
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language })) });
    const fixture = await draw(PaginationComponent, { page: 2, pageSize: 50, total: 230 });
    const host: HTMLElement = fixture.nativeElement;
    const moves: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => moves.push(page));
    const previous = host.querySelector<HTMLButtonElement>('[data-previous]')!;
    const next = host.querySelector<HTMLButtonElement>('[data-next]')!;

    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('Pages');
    expect(words(host.querySelector('.range'))).toBe('51-100 of 230');
    expect(host.querySelector('.range')?.getAttribute('aria-live')).toBe('polite');
    expect(words(host.querySelector('.page'))).toBe('Page 2 of 5');
    previous.click();
    next.click();
    expect(moves).toEqual([1, 3]);

    fixture.componentRef.setInput('page', 5);
    await settle(fixture);
    expect(words(host.querySelector('.range'))).toBe('201-230 of 230');
    expect(next.disabled).toBe(true);

    fixture.componentRef.setInput('busy', true);
    await settle(fixture);
    expect(previous.disabled).toBe(true);

    language.set('sk');
    fixture.componentRef.setInput('total', 0);
    fixture.componentRef.setInput('page', 1);
    await settle(fixture);
    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('Strany');
    expect(words(host.querySelector('.range'))).toBe('Nie je čo zobraziť');
    expect(words(host.querySelector('.page'))).toBe('Strana 1 z 1');
    expect(words(previous)).toBe('Predchádzajúca');
    host.remove();
  });
});
