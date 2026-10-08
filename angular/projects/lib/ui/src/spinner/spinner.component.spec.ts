import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../testing';
import { SpinnerComponent } from './spinner.component';

describe('<anotoki-spinner>', () => {
  it('without a label it is decoration: no status, nothing said', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(SpinnerComponent);
    expect(fixture.nativeElement.querySelector('[role=status]')).toBeNull();
    expect(fixture.nativeElement.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(words(fixture.nativeElement)).toBe('');
  });

  it('with a label it is a status, its words hidden unless showLabel', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(SpinnerComponent, { label: 'Saving the survey' });
    const status = fixture.nativeElement.querySelector('[role=status]');
    expect(words(status)).toBe('Saving the survey');
    expect(status.querySelector('.label').classList).toContain('visually-hidden');

    fixture.componentRef.setInput('showLabel', true);
    await settle(fixture);
    expect(status.querySelector('.label').classList).not.toContain('visually-hidden');
  });

  it('a bare label says the kit’s "Loading…" in the page language', async () => {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => 'sk' })) });
    const fixture = await draw(SpinnerComponent, { label: '' });
    expect(words(fixture.nativeElement.querySelector('[role=status]'))).toBe('Načítava sa…');
  });

  it('on a page in a language with no words, the kit’s English is marked English', async () => {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => 'de' })) });
    const fixture = await draw(SpinnerComponent, { label: '' });
    expect(fixture.nativeElement.querySelector('[role=status]').getAttribute('lang')).toBe('en');
  });

  it('with a delay it shows only once the delay has passed - a quick answer never flickers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      TestBed.configureTestingModule({ providers: kitProviders() });
      const fixture = TestBed.createComponent(SpinnerComponent);
      fixture.componentRef.setInput('delay', 400);
      fixture.componentRef.setInput('label', 'Loading');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('svg')).toBeNull();
      vi.advanceTimersByTime(399);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('svg')).toBeNull();
      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('svg')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
