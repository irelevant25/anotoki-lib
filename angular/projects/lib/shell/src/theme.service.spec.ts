import { TestBed } from '@angular/core/testing';
import { settle } from '../../ui/src/testing';
import { AnotokiThemeMode } from './config';
import { ThemeService } from './theme.service';
import { ShellSite, deviceScheme, shellProviders, shellSite } from './testing';

describe('ThemeService: light, dark or as the device is set - the account’s while somebody is signed in', () => {
  let site: ShellSite;
  const root = document.documentElement;

  function service(): ThemeService {
    TestBed.configureTestingModule({ providers: shellProviders(site) });
    return TestBed.inject(ThemeService);
  }

  /** Saves held until the test answers them. */
  function heldSaves(): { resolve: () => void; reject: () => void }[] {
    const held: { resolve: () => void; reject: () => void }[] = [];
    site.save.mockImplementation(() => new Promise<void>((resolve, reject) => held.push({ resolve, reject: () => reject(new Error('refused')) })));
    return held;
  }

  beforeEach(() => {
    site = shellSite();
    localStorage.clear();
    root.removeAttribute('data-theme');
    root.style.colorScheme = '';
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('as the device is set by default; the theme shown goes on <html> (data-theme, color-scheme) and into theme-color', async () => {
    deviceScheme(true);
    const theme = service();
    await settle();
    expect(theme.mode()).toBe('auto');
    expect(theme.resolved()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#070d1c');
  });

  it('follows the device while automatic', async () => {
    const device = deviceScheme(false);
    const theme = service();
    await settle();
    expect(root.getAttribute('data-theme')).toBe('light');
    device.dark(true);
    await settle();
    expect(theme.resolved()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('keeps the choice shown in localStorage under the site’s key - nothing for automatic - where theme-boot.js reads it', async () => {
    deviceScheme(false);
    const theme = service();
    theme.set('dark');
    expect(localStorage.getItem('test:theme')).toBe('dark');
    theme.set('auto');
    expect(localStorage.getItem('test:theme')).toBeNull();
  });

  it('starts from the stored choice', () => {
    deviceScheme(false);
    localStorage.setItem('test:theme', 'dark');
    expect(service().mode()).toBe('dark');
  });

  it('signed out: a choice is this device’s, and nothing is saved', async () => {
    deviceScheme(false);
    const theme = service();
    theme.set('dark');
    await settle();
    expect(site.save).not.toHaveBeenCalled();
    expect(theme.mode()).toBe('dark');
  });

  it('the account’s theme from the first moment - before the first frame is drawn', () => {
    deviceScheme(false);
    localStorage.setItem('test:theme', 'light');
    site.account.set('dark');
    const theme = service();
    expect(theme.mode()).toBe('dark');
    expect(localStorage.getItem('test:theme')).toBe('dark');
  });

  it('the account’s theme whenever it changes (another site, another tab)', async () => {
    deviceScheme(false);
    site.account.set('light');
    const theme = service();
    await settle();
    site.account.set('dark');
    await settle();
    expect(theme.mode()).toBe('dark');
  });

  it('signed in, a choice is shown at once and saved to the account', async () => {
    deviceScheme(false);
    site.account.set('light');
    const theme = service();
    theme.set('dark');
    expect(theme.mode()).toBe('dark');
    expect(site.save).toHaveBeenCalledWith('dark');
  });

  it('not the account’s earlier theme while a choice made here is being saved', async () => {
    deviceScheme(false);
    site.account.set('light');
    const held = heldSaves();
    const theme = service();
    await settle();
    theme.set('dark');
    // The account answers with the earlier one first (a refresh of the preferences): not shown.
    site.account.set('auto');
    await settle();
    expect(theme.mode()).toBe('dark');
    held[0].resolve();
    site.account.set('dark');
    await settle();
    expect(theme.mode()).toBe('dark');
  });

  it('one save at a time, the latest choice last', async () => {
    deviceScheme(false);
    site.account.set('light');
    const held = heldSaves();
    const theme = service();
    theme.set('dark');
    theme.set('auto');
    theme.set('dark');
    expect(site.save.mock.calls).toEqual([['dark']]);
    site.account.set('dark');
    held[0].resolve();
    await settle();
    // The latest choice is dark, which the account has by then: nothing more to save.
    expect(site.save.mock.calls).toEqual([['dark']]);
    expect(theme.mode()).toBe('dark');
  });

  it('a refusal puts the account’s theme back and says so (refused) until the next choice - or the account goes', async () => {
    deviceScheme(false);
    site.account.set('light');
    site.save.mockRejectedValue(new Error('access_denied'));
    const theme = service();
    theme.set('dark');
    await settle();
    expect(theme.mode()).toBe('light');
    expect(theme.refused()).toBe(true);

    theme.set('auto');
    expect(theme.refused()).toBe(false);
    await settle();
    expect(theme.refused()).toBe(true);
    theme.dismissRefusal();
    expect(theme.refused()).toBe(false);

    theme.set('dark');
    await settle();
    expect(theme.refused()).toBe(true);
    site.account.set(null);
    await settle();
    expect(theme.refused()).toBe(false);
  });

  it('a refused choice a later one has overtaken is not said', async () => {
    deviceScheme(false);
    site.account.set('light');
    const held = heldSaves();
    const theme = service();
    theme.set('dark');
    theme.set('auto');
    held[0].reject();
    await settle();
    expect(theme.refused()).toBe(false);
    expect(site.save.mock.calls.map(([mode]) => mode)).toEqual<AnotokiThemeMode[]>(['dark', 'auto']);
  });

  it('a theme-color of the site’s own', async () => {
    deviceScheme(true);
    TestBed.configureTestingModule({ providers: shellProviders(site, { theme: { themeColor: { light: '#ffffff', dark: '#000000' } } }) });
    TestBed.inject(ThemeService);
    await settle();
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#000000');
  });
});
