import { TestBed } from '@angular/core/testing';
import { ANOTOKI_ICONS } from '../config';
import { KIT_ICONS } from '../icons';
import { draw, kitProviders } from '../testing';
import { IconComponent } from './icon.component';

describe('<anotoki-icon>', () => {
  afterEach(() => vi.restoreAllMocks());

  const paths = (host: HTMLElement) => Array.from(host.querySelectorAll('path')).map((path) => path.getAttribute('d'));

  it('draws one of the kit’s icons, decorative: hidden from screen readers', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(IconComponent, { name: 'menu' });
    const svg = fixture.nativeElement.querySelector('svg')!;
    expect(paths(fixture.nativeElement)).toEqual(KIT_ICONS.menu);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('with a label it is an image with that name', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(IconComponent, { name: 'check', label: 'Done', size: 24, filled: true });
    const svg = fixture.nativeElement.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Done');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('width')).toBe('24');
  });

  it('draws the site’s own icons - from its configuration, and from an ANOTOKI_ICONS provider - and the site may redraw a kit icon', async () => {
    TestBed.configureTestingModule({
      providers: kitProviders(() => ({ icons: { piano: ['M1 1h2'], menu: ['M0 0h1'] } }), { provide: ANOTOKI_ICONS, multi: true, useValue: { trash: ['M3 6h18'] } }),
    });
    const piano = await draw(IconComponent, { name: 'piano' });
    expect(paths(piano.nativeElement)).toEqual(['M1 1h2']);
    const trash = await draw(IconComponent, { name: 'trash' });
    expect(paths(trash.nativeElement)).toEqual(['M3 6h18']);
    const menu = await draw(IconComponent, { name: 'menu' });
    expect(paths(menu.nativeElement)).toEqual(['M0 0h1']);
  });

  it('an unknown name draws nothing, and says so once in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: kitProviders() });
    const first = await draw(IconComponent, { name: 'nothingLikeThis' });
    await draw(IconComponent, { name: 'nothingLikeThis' });
    expect(paths(first.nativeElement)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('nothingLikeThis');
  });
});
