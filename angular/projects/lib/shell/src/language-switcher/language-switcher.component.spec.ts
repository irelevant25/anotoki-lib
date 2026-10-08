import { TestBed } from '@angular/core/testing';
import { draw, press, settle, words } from '../../../ui/src/testing';
import { ShellSite, shellProviders, shellSite } from '../testing';
import { LanguageSwitcherComponent } from './language-switcher.component';

describe('<anotoki-language-switcher>', () => {
  let site: ShellSite;
  let host: HTMLElement;
  let fixture: Awaited<ReturnType<typeof draw<LanguageSwitcherComponent>>>;
  let changed: string[];

  async function setUp(appearance: 'menu' | 'segmented' | 'select' | 'auto' = 'menu', language = 'en'): Promise<void> {
    site = shellSite();
    site.language.set(language);
    TestBed.configureTestingModule({ providers: shellProviders(site) });
    fixture = await draw(LanguageSwitcherComponent, { appearance });
    host = fixture.nativeElement;
    changed = [];
    fixture.componentInstance.changed.subscribe((code) => changed.push(code));
  }

  afterEach(() => host?.remove());

  const button = () => host.querySelector<HTMLButtonElement>('.switcher')!;
  const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role=menuitemradio]'));
  const note = () => host.querySelector('.note');

  async function open(): Promise<void> {
    button().focus();
    button().click();
    await settle(fixture);
  }

  /** Choices held until the test answers them. */
  function heldChoices(): ((switched: boolean) => void)[] {
    const held: ((switched: boolean) => void)[] = [];
    site.choose.mockImplementation(
      (code: string) =>
        new Promise<boolean>((resolve) =>
          held.push((switched) => {
            if (switched) {
              site.language.set(code);
            }
            resolve(switched);
          }),
        ),
    );
    return held;
  }

  describe('the bar’s menu', () => {
    it('one button showing the language’s code, its name holding that code (WCAG 2.5.3)', async () => {
      await setUp('menu', 'sk');
      expect(words(button())).toBe('SK');
      expect(button().getAttribute('aria-label')).toBe('Jazyk: Slovenčina (SK)');
      expect(button().getAttribute('title')).toBe('Jazyk: Slovenčina (SK)');
      expect(button().getAttribute('aria-haspopup')).toBe('menu');
    });

    it('a menu of the languages, each under its own name and with its own lang; the focus on the one in use', async () => {
      await setUp();
      await open();
      expect(host.querySelector('[role=menu]')?.getAttribute('aria-label')).toBe('Language');
      expect(items().map(words)).toEqual(['English', 'Slovenčina']);
      expect(items().map((item) => item.getAttribute('lang'))).toEqual(['en', 'sk']);
      expect(items().map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'false']);
      expect(document.activeElement).toBe(items()[0]);
    });

    it('a choice switches the page - `changed` once it reads in it - and the menu closes, the focus on its button', async () => {
      await setUp();
      await open();
      items()[1].click();
      await settle(fixture);
      expect(site.choose).toHaveBeenCalledWith('sk');
      expect(changed).toEqual(['sk']);
      expect(words(button())).toBe('SK');
      expect(host.querySelector('[role=menu]')).toBeNull();
      expect(document.activeElement).toBe(button());
    });

    it('the language already on the page: no `changed`', async () => {
      await setUp();
      await open();
      items()[0].click();
      await settle(fixture);
      expect(changed).toEqual([]);
    });

    it('Tab and Shift+Tab close the menu with the focus on its button, the browser’s move stopped', async () => {
      await setUp();
      for (const shift of [false, true]) {
        await open();
        const tab = press(items()[1], 'Tab', { shiftKey: shift });
        expect(tab.defaultPrevented).toBe(true);
        await settle(fixture);
        expect(host.querySelector('[role=menu]')).toBeNull();
        expect(document.activeElement).toBe(button());
      }
    });

    it('a language that cannot be had: the page stays, and a note under the button says so - until the next choice or a click elsewhere', async () => {
      await setUp();
      site.choose.mockResolvedValue(false);
      await open();
      items()[1].click();
      await settle(fixture);
      expect(changed).toEqual([]);
      expect(note()?.getAttribute('role')).toBe('alert');
      expect(words(note())).toBe('The language could not be loaded. Try again.');
      expect(words(button())).toBe('EN');

      document.body.click();
      await settle(fixture);
      expect(note()).toBeNull();
    });

    it('the account refused the language: the site’s notSaved shows a note; Escape puts it away', async () => {
      await setUp();
      site.notSaved.set(true);
      await settle(fixture);
      expect(words(note())).toBe('The language could not be saved to your anotoki account - it holds for this visit only.');
      press(button(), 'Escape');
      await settle(fixture);
      expect(site.notSaved()).toBe(false);
      expect(note()).toBeNull();
    });

    it('the last choice wins: an earlier choice answering late is no news', async () => {
      await setUp();
      const held = heldChoices();
      await open();
      items()[1].click();
      await settle(fixture);
      expect(button().getAttribute('aria-busy')).toBe('true');
      // The button stays usable while the words are on their way: back to English.
      await open();
      items()[0].click();
      await settle(fixture);
      held[1](true);
      await settle(fixture);
      held[0](false);
      await settle(fixture);
      expect(note()).toBeNull();
      expect(button().getAttribute('aria-busy')).toBeNull();
      expect(words(button())).toBe('EN');
    });

    it('keys pressed in it stay in it: a page listening on document never hears them', async () => {
      await setUp();
      const heard = vi.fn();
      document.addEventListener('keydown', heard);
      press(button(), 'Enter');
      press(button(), ' ');
      document.removeEventListener('keydown', heard);
      expect(heard).not.toHaveBeenCalled();
    });

    it('draws nothing with fewer than two languages', async () => {
      await setUp();
      site.offered.set([{ code: 'en', name: 'English' }]);
      await settle(fixture);
      expect(host.hidden).toBe(true);
      expect(host.querySelector('button')).toBeNull();
    });
  });

  describe('segments, and a select', () => {
    it('segments: the codes, each named in its own language and holding the code; the arrows choose', async () => {
      await setUp('segmented');
      const segments = Array.from(host.querySelectorAll<HTMLButtonElement>('[role=radio]'));
      expect(segments.map(words)).toEqual(['EN', 'SK']);
      expect(segments.map((segment) => segment.getAttribute('aria-label'))).toEqual(['English (EN)', 'Slovenčina (SK)']);
      expect(segments.map((segment) => segment.getAttribute('lang'))).toEqual(['en', 'sk']);
      segments[0].focus();
      press(segments[0], 'ArrowRight');
      await settle(fixture);
      expect(changed).toEqual(['sk']);
      expect(document.activeElement).toBe(segments[1]);
    });

    it('a select of the names, with a label for screen readers', async () => {
      await setUp('select');
      const select = host.querySelector<HTMLSelectElement>('select')!;
      expect(host.querySelector(`label[for="${select.id}"]`)?.textContent?.trim()).toBe('Language');
      expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['English', 'Slovenčina']);
      select.value = 'sk';
      select.dispatchEvent(new Event('change'));
      await settle(fixture);
      expect(changed).toEqual(['sk']);
    });

    it('a select that could not switch shows what is true again', async () => {
      await setUp('select');
      site.choose.mockResolvedValue(false);
      const select = host.querySelector<HTMLSelectElement>('select')!;
      select.value = 'sk';
      select.dispatchEvent(new Event('change'));
      await settle(fixture);
      expect(select.value).toBe('en');
      expect(note()).not.toBeNull();
    });

    it('auto: segments up to four languages, a select above', async () => {
      await setUp('auto');
      expect(host.querySelector('[role=radiogroup]')).not.toBeNull();
      site.offered.set(['en', 'sk', 'cs', 'de', 'pl'].map((code) => ({ code, name: code })));
      await settle(fixture);
      expect(host.querySelector('[role=radiogroup]')).toBeNull();
      expect(host.querySelector('select')).not.toBeNull();
    });
  });
});
