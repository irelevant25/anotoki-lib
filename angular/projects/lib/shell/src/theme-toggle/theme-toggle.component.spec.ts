import { TestBed } from '@angular/core/testing';
import { draw, press, settle, words } from '../../../ui/src/testing';
import { ThemeService } from '../theme.service';
import { ShellSite, deviceScheme, shellProviders, shellSite } from '../testing';
import { ThemeToggleComponent } from './theme-toggle.component';

describe('<anotoki-theme-toggle>: the family’s segmented switch', () => {
  let site: ShellSite;
  let host: HTMLElement;
  let fixture: Awaited<ReturnType<typeof draw<ThemeToggleComponent>>>;

  async function setUp(language = 'en', iconsOnly = true): Promise<void> {
    site = shellSite();
    site.language.set(language);
    deviceScheme(false);
    localStorage.clear();
    TestBed.configureTestingModule({ providers: shellProviders(site) });
    fixture = await draw(ThemeToggleComponent, { iconsOnly });
    host = fixture.nativeElement;
  }

  afterEach(() => {
    host.remove();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const radios = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role=radio]'));

  it('a radio group of three, the icons each named and with a tooltip - "as your device is set" for automatic', async () => {
    await setUp();
    expect(host.querySelector('[role=radiogroup]')?.getAttribute('aria-label')).toBe('Theme');
    expect(radios().map((radio) => radio.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'Automatic']);
    expect(radios().map((radio) => radio.getAttribute('title'))).toEqual(['Light', 'Dark', 'As your device is set']);
    expect(radios().map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(radios().map((radio) => radio.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('in Slovak, informal', async () => {
    await setUp('sk');
    expect(host.querySelector('[role=radiogroup]')?.getAttribute('aria-label')).toBe('Vzhľad');
    expect(radios().map((radio) => radio.getAttribute('aria-label'))).toEqual(['Svetlý', 'Tmavý', 'Automaticky']);
    expect(radios()[2].getAttribute('title')).toBe('Podľa nastavenia zariadenia');
  });

  it('with words, for an account page', async () => {
    await setUp('en', false);
    expect(radios().map((radio) => words(radio))).toEqual(['Light', 'Dark', 'Automatic']);
  });

  it('a click or an arrow chooses; the focus follows the choice', async () => {
    await setUp();
    const theme = TestBed.inject(ThemeService);
    radios()[0].click();
    await settle(fixture);
    expect(theme.mode()).toBe('light');
    radios()[0].focus();
    press(radios()[0], 'ArrowRight');
    await settle(fixture);
    expect(theme.mode()).toBe('dark');
    expect(document.activeElement).toBe(radios()[1]);
  });

  it('when the account refuses a choice: a note under the switch, gone on the next choice, a click elsewhere, or Escape', async () => {
    await setUp();
    site.account.set('light');
    site.save.mockRejectedValue(new Error('access_denied'));
    await settle(fixture);
    const note = () => host.querySelector('.note');

    radios()[1].click();
    await settle(fixture);
    expect(note()?.getAttribute('role')).toBe('alert');
    expect(words(note())).toBe('The theme could not be saved to your anotoki account.');
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');

    document.body.click();
    await settle(fixture);
    expect(note()).toBeNull();

    radios()[1].click();
    await settle(fixture);
    expect(note()).not.toBeNull();
    press(radios()[1], 'Escape');
    await settle(fixture);
    expect(note()).toBeNull();

    radios()[1].click();
    await settle(fixture);
    expect(note()).not.toBeNull();
    site.save.mockResolvedValue(undefined);
    radios()[2].click();
    await settle(fixture);
    expect(note()).toBeNull();
  });
});
