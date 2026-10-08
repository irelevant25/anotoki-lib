import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { draw, kitProviders, settle, words } from '../../../ui/src/testing';
import { BrandComponent } from './brand.component';

describe('<anotoki-brand>: the mark and the wordmark', () => {
  async function brand(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ providers: [...kitProviders(), provideRouter([])] });
    return draw(BrandComponent, inputs);
  }

  const parts = (host: HTMLElement) => Array.from(host.querySelectorAll('.wordmark > span')).map(words);

  it('"anotoki" and the area, one link named by its label; the mark’s alt empty', async () => {
    const fixture = await brand({ area: 'survey', link: '/', label: 'anotoki survey: the open surveys' });
    const host: HTMLElement = fixture.nativeElement;
    const link = host.querySelector('a')!;
    expect(parts(host)).toEqual(['anotoki', 'survey']);
    expect(link.getAttribute('href')).toBe('/');
    expect(link.getAttribute('aria-label')).toBe('anotoki survey: the open surveys');
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('anotoki.png');
    expect(link.getAttribute('aria-current')).toBeNull();
    host.remove();
  });

  it('the admin panel’s form: "anotoki survey · admin panel"; short, the panel small under the area', async () => {
    const fixture = await brand({ area: 'survey', panel: 'admin panel', link: '/admin', label: 'anotoki survey · admin panel - home' });
    const host: HTMLElement = fixture.nativeElement;
    expect(words(host.querySelector('.wordmark'))).toBe('anotoki survey · admin panel');
    expect(host.querySelector('.dot')?.getAttribute('aria-hidden')).toBe('true');

    fixture.componentRef.setInput('showName', false);
    await settle(fixture);
    expect(parts(host)).toEqual(['survey', '·', 'admin panel']);
    expect(host.querySelector('.wordmark')?.classList).toContain('is-short');
    expect(host.querySelector('.wordmark')?.classList).toContain('has-panel');
    host.remove();
  });

  it('the page’s own link, a name in another language, the site’s mark - and no link at all', async () => {
    const fixture = await brand({ area: 'Japanese', link: '/', label: 'anotoki Japanese: home', current: true, lang: 'en', logo: '/brand/mark.png', size: 40 });
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('a')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.wordmark')?.getAttribute('lang')).toBe('en');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/brand/mark.png');
    expect(host.querySelector('img')?.getAttribute('width')).toBe('40');

    fixture.componentRef.setInput('link', null);
    await settle(fixture);
    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('span.brand')).not.toBeNull();
    host.remove();
  });
});
