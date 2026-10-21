import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { CodeEditorComponent, CodeLanguage } from './code-editor.component';

@Component({
  selector: 'anotoki-test-code-editors',
  imports: [CodeEditorComponent],
  template: `
    <anotoki-code-editor
      id="levels"
      label="The levels, as JSON"
      language="json"
      [rows]="6"
      hint="Six quizzes, three levels each"
      [error]="error()"
      [(value)]="levels"
      (blurred)="blurs.set(blurs() + 1)"
    />
    <anotoki-code-editor id="query" label="The query" [language]="language()" readonly [(value)]="query" />
    <anotoki-code-editor id="notes" label="Notes" [disabled]="true" value="plain words" />
  `,
})
class EditorsPageComponent {
  readonly levels = signal('{"easy": 1, "hard": [3, true]}');
  readonly query = signal("SELECT 'x' FROM t;");
  readonly language = signal<CodeLanguage>('sql');
  readonly error = signal<string | null>(null);
  readonly blurs = signal(0);
}

describe('<anotoki-code-editor>: a native textarea over the same text coloured, its value two-way', () => {
  let host: HTMLElement;
  let page: EditorsPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<EditorsPageComponent>>>;

  async function setUp(): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(EditorsPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  }

  afterEach(() => host.remove());

  const editor = (id: string) => host.querySelector<HTMLElement>('#' + id)!;
  const area = (id: string) => editor(id).querySelector('textarea')!;
  const code = (id: string) => editor(id).querySelector<HTMLElement>('.anotoki-code-editor__code')!;
  /** The layer's spans as [kind, text] ('' for plain text). */
  const pieces = (id: string) => Array.from(code(id).children, (span) => [span.className.replace('anotoki-code-editor__', ''), span.textContent ?? '']);
  const type = async (id: string, text: string) => {
    area(id).value = text;
    area(id).dispatchEvent(new Event('input'));
    await settle(fixture);
  };

  it('a native textarea with a real label, its hint and rows - no spell check, no wrapping - over a layer screen readers never read', async () => {
    await setUp();
    const levels = area('levels');
    expect(words(editor('levels').querySelector(`label[for="${levels.id}"]`))).toBe('The levels, as JSON');
    expect(words(document.getElementById(levels.getAttribute('aria-describedby')!))).toBe('Six quizzes, three levels each');
    expect([levels.rows, levels.getAttribute('spellcheck'), levels.getAttribute('wrap'), levels.getAttribute('autocapitalize')]).toEqual([6, 'false', 'off', 'off']);
    expect(editor('levels').querySelector('.anotoki-code-editor__layer')?.getAttribute('aria-hidden')).toBe('true');
    expect(editor('levels').getAttribute('translate')).toBe('no');
    // Tab is the browser's: it moves the focus on, never taken.
    expect(press(levels, 'Tab').defaultPrevented).toBe(false);
  });

  it('the value in: the textarea holds it, and the layer draws it coloured - a span a piece, its text the value', async () => {
    await setUp();
    expect(area('levels').value).toBe('{"easy": 1, "hard": [3, true]}');
    expect(code('levels').textContent).toBe(area('levels').value);
    expect(pieces('levels')).toEqual([
      ['punctuation', '{'],
      ['key', '"easy"'],
      ['punctuation', ': '],
      ['number', '1'],
      ['punctuation', ', '],
      ['key', '"hard"'],
      ['punctuation', ': ['],
      ['number', '3'],
      ['punctuation', ', '],
      ['literal', 'true'],
      ['punctuation', ']}'],
    ]);

    page.levels.set('{"x": null}');
    await settle(fixture);
    expect(area('levels').value).toBe('{"x": null}');
    expect(code('levels').textContent).toBe('{"x": null}');
    // A value from elsewhere with Windows' line ends: the layer draws what the textarea holds, \n.
    page.levels.set('[1,\r\n2]');
    await settle(fixture);
    expect(code('levels').textContent).toBe('[1,\n2]');
  });

  it('the value out: what is typed is the value, and the layer follows - half-typed JSON drawn as it stands', async () => {
    await setUp();
    await type('levels', '{"easy": "Ka');
    expect(page.levels()).toBe('{"easy": "Ka');
    expect(code('levels').textContent).toBe('{"easy": "Ka');
    expect(pieces('levels')).toEqual([
      ['punctuation', '{'],
      ['key', '"easy"'],
      ['punctuation', ': '],
      ['string', '"Ka'],
    ]);

    area('levels').dispatchEvent(new Event('blur'));
    expect(page.blurs()).toBe(1);
  });

  it('the text’s words are text, never markup: <script>, </span>, {{ }} drawn as written, in spans alone', async () => {
    await setUp();
    const json = '{"<script>": "</span><b>x</b>", "t": "{{ 1 + 1 }}"}';
    await type('levels', json);
    expect(code('levels').textContent).toBe(json);
    expect(code('levels').querySelector(':not(span)')).toBeNull();
    expect(Array.from(code('levels').children).every((span) => span.childElementCount === 0)).toBe(true);
    expect(editor('levels').querySelector('script, b')).toBeNull();
  });

  it('SQL, read-only - and text, which colours nothing; disabled; an error said and marked', async () => {
    await setUp();
    expect(area('query').readOnly).toBe(true);
    expect(pieces('query')).toEqual([
      ['keyword', 'SELECT '],
      ['string', "'x' "],
      ['keyword', 'FROM '],
      ['', 't'],
      ['punctuation', ';'],
    ]);
    page.language.set('text');
    await settle(fixture);
    expect(pieces('query')).toEqual([['', "SELECT 'x' FROM t;"]]);

    expect(area('notes').disabled).toBe(true);
    expect(code('notes').textContent).toBe('plain words');
    expect(editor('notes').querySelector('.anotoki-field__control--disabled')).not.toBeNull();

    page.error.set('Not JSON yet: a comma is missing.');
    await settle(fixture);
    expect(area('levels').getAttribute('aria-invalid')).toBe('true');
    expect(words(editor('levels').querySelector('[role=alert]'))).toBe('Not JSON yet: a comma is missing.');
    expect(area('levels').getAttribute('aria-describedby')).toBe(editor('levels').querySelector('[role=alert]')?.id);
  });

  it('the layer follows the textarea’s scrolling', async () => {
    await setUp();
    const levels = area('levels');
    Object.defineProperty(levels, 'scrollTop', { value: 42, configurable: true });
    Object.defineProperty(levels, 'scrollLeft', { value: 17, configurable: true });
    levels.dispatchEvent(new Event('scroll'));
    await settle(fixture);
    expect(code('levels').style.transform).toBe('translate(-17px, -42px)');
  });
});
