import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { TextCommand, ToolbarTool, safeLinkAddress } from '../commands';
import { ToolbarItemDirective } from '../toolbar-item.directive';
import { RichTextToolbarComponent } from './rich-text-toolbar.component';

@Component({
  selector: 'anotoki-test-toolbar',
  imports: [RichTextToolbarComponent, ToolbarItemDirective],
  template: `
    <anotoki-rich-text-toolbar
      id="bar"
      controls="editor"
      [label]="label()"
      [tools]="tools()"
      [active]="active()"
      [unavailable]="unavailable()"
      [disabled]="disabled()"
      (command)="pressed.push($event)"
    >
      @if (size()) {
        <button anotokiToolbarItem id="size" type="button">Size</button>
      }
    </anotoki-rich-text-toolbar>
    <div id="editor" contenteditable="true">Hello</div>
  `,
})
class ToolbarPageComponent {
  readonly label = signal<string | null>(null);
  readonly tools = signal<readonly ToolbarTool[]>(['bold', 'italic', 'underline', '|', 'bulletList', 'orderedList', '|', 'link', 'clear']);
  readonly active = signal<readonly TextCommand[]>([]);
  readonly unavailable = signal<readonly TextCommand[]>([]);
  readonly disabled = signal(false);
  readonly size = signal(true);
  readonly pressed: TextCommand[] = [];
}

describe('<anotoki-rich-text-toolbar>: the ARIA toolbar pattern over an editor - one Tab stop, the arrows, aria-pressed', () => {
  let host: HTMLElement;
  let page: ToolbarPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<ToolbarPageComponent>>>;

  async function setUp(config?: () => AnotokiUiConfig): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    fixture = await draw(ToolbarPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  }

  afterEach(() => host?.remove());

  const bar = () => host.querySelector<HTMLElement>('#bar')!;
  const items = () => Array.from(bar().querySelectorAll<HTMLElement>('[data-anotoki-toolbar-item]'));
  const named = () => items().map((item) => item.getAttribute('aria-label') ?? words(item));
  const button = (name: string) => items().find((item) => item.getAttribute('aria-label') === name)!;
  const stops = () => items().filter((item) => item.tabIndex === 0);

  it('lets a link’s address in only as a web, mail or the site’s own address', () => {
    expect(safeLinkAddress(' https://anotoki.eu/guides ')).toBe('https://anotoki.eu/guides');
    expect(safeLinkAddress('mailto:support@anotoki.eu')).toBe('mailto:support@anotoki.eu');
    expect(safeLinkAddress('/guides/1')).toBe('/guides/1');
    expect(safeLinkAddress('#notes')).toBe('#notes');
    expect(safeLinkAddress('anotoki.eu/guides')).toBe('https://anotoki.eu/guides');
    for (const address of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:x',
      'file:///etc/passwd',
      'java\tscript:alert(1)',
      '//evil.example',
      'https://a.example/"onmouseover="x',
      '',
      '   ',
    ]) {
      expect(safeLinkAddress(address), address).toBeNull();
    }
  });

  it('role="toolbar", named and controlling the editor; each button named by the library, its tooltip the same', async () => {
    await setUp();
    expect(bar().getAttribute('role')).toBe('toolbar');
    expect(bar().getAttribute('aria-label')).toBe('Formatting');
    expect(bar().getAttribute('aria-controls')).toBe('editor');
    expect(named()).toEqual(['Bold', 'Italic', 'Underline', 'Bulleted list', 'Numbered list', 'Link', 'Clear formatting', 'Size']);
    expect(
      items()
        .slice(0, 7)
        .every((item) => item.getAttribute('title') === item.getAttribute('aria-label') && item.getAttribute('type') === 'button'),
    ).toBe(true);
    const separators = Array.from(bar().querySelectorAll('[role="separator"]'));
    // The two of the tools, and one before the site's own items.
    expect(separators.length).toBe(3);
    expect(separators.every((separator) => separator.getAttribute('aria-orientation') === 'vertical')).toBe(true);
    expect(TestBed.inject(AnotokiIcons).has('listBullets')).toBe(true);
    page.label.set('The guide’s formatting');
    await settle(fixture);
    expect(bar().getAttribute('aria-label')).toBe('The guide’s formatting');
  });

  it('a format that is on says so: aria-pressed on the formats, never on the buttons that act once', async () => {
    await setUp();
    expect(button('Bold').getAttribute('aria-pressed')).toBe('false');
    expect(button('Clear formatting').hasAttribute('aria-pressed')).toBe(false);
    page.active.set(['bold', 'bulletList', 'link']);
    await settle(fixture);
    expect(['Bold', 'Italic', 'Bulleted list', 'Link'].map((name) => button(name).getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true', 'true']);
    expect(button('Bold').classList).toContain('anotoki-rich-text-toolbar__tool--on');
  });

  it('one Tab stop - the first, then the last one the focus was on; Left and Right round the items, Home and End to the ends', async () => {
    await setUp();
    expect(stops()).toEqual([button('Bold')]);
    button('Bold').focus();
    press(button('Bold'), 'ArrowRight');
    await settle(fixture);
    expect(document.activeElement).toBe(button('Italic'));
    expect(stops()).toEqual([button('Italic')]);
    press(button('Italic'), 'ArrowLeft');
    press(button('Bold'), 'ArrowLeft');
    await settle(fixture);
    // Round the row: the site's own item is the last.
    expect(document.activeElement?.id).toBe('size');
    expect(stops().map((item) => item.id || item.getAttribute('aria-label'))).toEqual(['size']);
    press(document.activeElement!, 'Home');
    await settle(fixture);
    expect(document.activeElement).toBe(button('Bold'));
    press(button('Bold'), 'End');
    await settle(fixture);
    expect(document.activeElement?.id).toBe('size');
    press(document.activeElement!, 'ArrowRight');
    await settle(fixture);
    expect(document.activeElement).toBe(button('Bold'));
    // Up and Down are an item's own (a menu button's).
    expect(press(button('Bold'), 'ArrowDown').defaultPrevented).toBe(false);
    // A click (the focus) on an item makes it the stop.
    button('Link').focus();
    await settle(fixture);
    expect(stops()).toEqual([button('Link')]);
  });

  it('the site’s item gone: the stop goes back to the first; without the toolbar’s buttons, the site’s first item is it', async () => {
    await setUp();
    host.querySelector<HTMLElement>('#size')!.focus();
    await settle(fixture);
    page.size.set(false);
    await settle(fixture);
    expect(stops()).toEqual([button('Bold')]);
    page.size.set(true);
    page.tools.set([]);
    await settle(fixture);
    expect(stops().map((item) => item.id)).toEqual(['size']);
  });

  it('a press: its command, the focus and the selection left in the editor (a pointer’s press takes no focus)', async () => {
    await setUp();
    button('Bold').click();
    button('Bulleted list').click();
    expect(page.pressed).toEqual(['bold', 'bulletList']);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button('Italic').dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('unavailable or disabled: kept in the row and the tab order, aria-disabled, doing nothing', async () => {
    await setUp();
    page.unavailable.set(['clear']);
    await settle(fixture);
    expect(button('Clear formatting').getAttribute('aria-disabled')).toBe('true');
    button('Clear formatting').click();
    expect(page.pressed).toEqual([]);
    page.disabled.set(true);
    await settle(fixture);
    expect(
      items()
        .slice(0, 7)
        .every((item) => item.getAttribute('aria-disabled') === 'true'),
    ).toBe(true);
    button('Bold').click();
    expect(page.pressed).toEqual([]);
    expect(stops().length).toBe(1);
  });

  it('in the page’s language - the site’s words first', async () => {
    await setUp(() => ({ language: () => 'sk', lookup: (key) => ((key as string) === 'richText.bold' ? 'Hrubé písmo' : null) }));
    expect(bar().getAttribute('aria-label')).toBe('Formátovanie');
    expect(named().slice(0, 7)).toEqual(['Hrubé písmo', 'Kurzíva', 'Podčiarknuté', 'Odrážky', 'Číslovaný zoznam', 'Odkaz', 'Zrušiť formátovanie']);
  });
});
