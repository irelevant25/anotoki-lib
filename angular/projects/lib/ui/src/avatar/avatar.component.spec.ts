import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../testing';
import { AvatarComponent, initialsOf } from './avatar.component';

describe('<anotoki-avatar>', () => {
  it('initials: the first letters of the first two words', () => {
    expect(initialsOf('Japanese Academy')).toBe('JA');
    expect(initialsOf('anotoki build analyzer')).toBe('AB');
    expect(initialsOf('mira')).toBe('M');
    expect(initialsOf('  ')).toBe('?');
    expect(initialsOf('Ľubica Šťastná')).toBe('ĽŠ');
  });

  it('the picture, or the initials when there is none or it does not load - a new address is tried again', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(AvatarComponent, { name: 'Piano Academy', imageUrl: '/logo.png', size: 32, shape: 'circle' });
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(host.getAttribute('data-shape')).toBe('circle');

    host.querySelector('img')!.dispatchEvent(new Event('error'));
    await settle(fixture);
    expect(host.querySelector('img')).toBeNull();
    expect(words(host.querySelector('.initials'))).toBe('PA');
    expect(host.querySelector('.initials')?.getAttribute('aria-hidden')).toBe('true');

    fixture.componentRef.setInput('imageUrl', '/other.png');
    await settle(fixture);
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/other.png');
    host.remove();
  });
});
