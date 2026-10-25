import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ColorSwatch } from '@anotoki/lib/ui/color-field';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { MARK_SENTINEL, closestIn, indentBlocks, removeColour, selectedBlocks, sentinelToMarks, touched, unwrap } from '../editing';
import { typedLinkAddress } from '../link-dialog/link-dialog.component';
import { HtmlEditorComponent, HtmlEditorHeading } from './html-editor.component';

@Component({
  selector: 'anotoki-test-html-editors',
  imports: [HtmlEditorComponent],
  template: `
    <anotoki-html-editor
      id="guide"
      label="The guide"
      [(value)]="guide"
      [headings]="headings"
      highlight
      sizes
      [fonts]="fonts"
      colors
      [swatches]="swatches"
      source
      preview
      images
      [classes]="['tag']"
      placeholder="Write the guide"
      hint="What a question mark opens"
      [error]="error()"
      [disabled]="disabled()"
      (pastedImages)="pictures.set($event)"
    />
    <anotoki-html-editor id="plain" label="A question" hideLabel [(value)]="question" [tools]="['bold', 'italic']" />
  `,
})
class HtmlEditorsPageComponent {
  readonly guide = signal('<h2>Daily</h2><p>Two <b onclick="x()">quizzes</b> <span class="tag">music</span></p><script>alert(1)</script><p><a href="javascript:alert(1)">trap</a></p>');
  readonly question = signal('');
  readonly headings: HtmlEditorHeading[] = [2, 3];
  readonly fonts = ['Arial', 'Courier New'];
  readonly swatches: ColorSwatch[] = [{ value: '#f44336', name: 'Red' }];
  readonly error = signal<string | null>(null);
  readonly disabled = signal(false);
  readonly pictures = signal<File[]>([]);
}

describe('<anotoki-html-editor>: the family’s editor of a text’s HTML', () => {
  const language = signal('en');
  let host: HTMLElement;
  let page: HtmlEditorsPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<HtmlEditorsPageComponent>>>;

  beforeEach(async () => {
    language.set('en');
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language })) });
    fixture = await draw(HtmlEditorsPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => {
    host.remove();
    document.querySelectorAll('anotoki-dialog-container').forEach((element) => element.remove());
  });

  const editor = (id = 'guide') => host.querySelector<HTMLElement>(`#${id} .anotoki-html-editor__text`)!;
  const toolbar = (id = 'guide') => host.querySelector<HTMLElement>(`#${id} anotoki-rich-text-toolbar`)!;
  const named = (name: string, id = 'guide') => host.querySelector<HTMLButtonElement>(`#${id} anotoki-rich-text-toolbar [aria-label="${name}"]`);
  /** The text typed: its elements changed, as the browser's editing changes them, and the input it says. */
  const edit = async (change: (text: HTMLElement) => void, id = 'guide') => {
    change(editor(id));
    editor(id).dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  /** The caret in the text: inside a node, at an offset (or a node's whole text selected). */
  const caretIn = async (node: Node, select = false) => {
    const range = document.createRange();
    if (select) {
      range.selectNodeContents(node);
    } else {
      range.setStart(node, 0);
      range.collapse(true);
    }
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await settle(fixture);
  };

  it('draws a stored text through the allow-list: no handler, no script, no javascript: link - the site’s class kept', () => {
    expect(editor().querySelector('h2')?.textContent).toBe('Daily');
    expect(editor().querySelector('b')?.hasAttribute('onclick')).toBe(false);
    expect(editor().querySelector('script')).toBeNull();
    expect(editor().querySelector('a')).toBeNull();
    expect(editor().querySelector('span.tag')?.textContent).toBe('music');
    // Drawn, not written: the page's value stays what it gave until the person writes.
    expect(page.guide()).toContain('<script>');
  });

  it('a textbox named by its label, its hint and error tied to it, the toolbar controlling it and named after it', async () => {
    const label = document.getElementById(editor().getAttribute('aria-labelledby')!);
    expect(words(label)).toBe('The guide');
    expect(editor().getAttribute('role')).toBe('textbox');
    expect(editor().getAttribute('aria-multiline')).toBe('true');
    expect(editor().getAttribute('contenteditable')).toBe('true');
    expect(editor().getAttribute('aria-placeholder')).toBe('Write the guide');
    expect(words(document.getElementById(editor().getAttribute('aria-describedby')!))).toBe('What a question mark opens');
    expect(toolbar().getAttribute('aria-label')).toBe('The guide: formatting');
    expect(toolbar().getAttribute('aria-controls')).toBe(editor().id);
    page.error.set('The guide needs a heading.');
    await settle(fixture);
    expect(editor().getAttribute('aria-invalid')).toBe('true');
    expect(words(document.getElementById(editor().getAttribute('aria-describedby')!))).toBe('The guide needs a heading.');
    // Hidden, the label still names it.
    expect(host.querySelector('#plain .anotoki-field__label')?.classList).toContain('anotoki-visually-hidden');
  });

  it('the kit’s buttons in the page’s order, and the editor’s own where the page asks for them', () => {
    const names = Array.from(toolbar().querySelectorAll('button')).map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Bulleted list',
      'Numbered list',
      'Indent more',
      'Indent less',
      'Link',
      'Clear formatting',
      'Undo',
      'Redo',
      'Heading 2',
      'Heading 3',
      'Highlight',
      'Text size: Normal',
      'Font: Arial',
      'Text colour',
      'Highlight colour',
      'HTML source',
      'Preview',
    ]);
    expect(Array.from(toolbar('plain').querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))).toEqual(['Bold', 'Italic']);
  });

  it('what the person writes is read back through the allow-list as the value; no words is ""', async () => {
    await edit((text) => {
      text.replaceChildren();
      const p = document.createElement('p');
      p.setAttribute('style', 'margin-left: 24px; position: fixed');
      p.append('Hi ', Object.assign(document.createElement('img'), { src: 'x' }));
      text.append(p);
    });
    expect(page.guide()).toBe('<p style="margin-left: 24px;">Hi </p>');
    await edit((text) => text.replaceChildren(document.createElement('p')));
    expect(page.guide()).toBe('');
    expect(editor().classList).toContain('anotoki-html-editor__text--blank');
    // A value from the page is drawn; a blank one an empty line, where the caret has a place.
    page.question.set('<p>One</p>');
    await settle(fixture);
    expect(editor('plain').textContent).toBe('One');
    page.question.set('');
    await settle(fixture);
    expect(editor('plain').querySelector('p br')).not.toBeNull();
  });

  it('where the caret is: its heading and its mark pressed', async () => {
    await caretIn(editor().querySelector('h2')!.firstChild!);
    expect(named('Heading 2')?.getAttribute('aria-pressed')).toBe('true');
    expect(named('Heading 3')?.getAttribute('aria-pressed')).toBe('false');
    await edit((text) => {
      text.replaceChildren();
      const p = document.createElement('p');
      const mark = document.createElement('mark');
      mark.textContent = 'marked';
      p.append(mark, ' words');
      text.append(p);
    });
    await caretIn(editor().querySelector('mark')!.firstChild!);
    expect(named('Highlight')?.getAttribute('aria-pressed')).toBe('true');
    // The highlighter where a mark is: the mark taken away.
    named('Highlight')!.click();
    await settle(fixture);
    expect(page.guide()).toBe('<p>marked words</p>');
  });

  it('indent: a step of margin on the lines the selection touches, back to none', async () => {
    await caretIn(editor().querySelector('p')!.firstChild!);
    named('Indent more')!.click();
    await settle(fixture);
    expect(editor().querySelector('p')?.getAttribute('style')).toBe('margin-left: 24px;');
    expect(page.guide()).toContain('<p style="margin-left: 24px;">');
    named('Indent less')!.click();
    await settle(fixture);
    expect(editor().querySelector('p')?.hasAttribute('style')).toBe(false);
  });

  it('the source: the text as its HTML; what is typed there is the allow-list’s value; back, the text drawn from it', async () => {
    named('HTML source')!.click();
    await settle(fixture);
    const area = host.querySelector<HTMLTextAreaElement>('#guide .anotoki-html-editor__source')!;
    expect(area.getAttribute('aria-label')).toBe('The guide: HTML source');
    expect(editor().hidden).toBe(true);
    expect(named('Bold')?.getAttribute('aria-disabled')).toBe('true');
    area.value = '<h3 onclick="x()">New</h3><style>p{}</style><p>Text</p>';
    area.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(page.guide()).toBe('<h3>New</h3><p>Text</p>');
    expect(area.value).toBe('<h3 onclick="x()">New</h3><style>p{}</style><p>Text</p>');
    named('HTML source')!.click();
    await settle(fixture);
    expect(editor().hidden).toBe(false);
    expect(editor().querySelector('h3')?.textContent).toBe('New');
  });

  it('the preview: the text as the site shows it, through the same allow-list; shown and hidden by its button', async () => {
    const preview = () => host.querySelector('#guide .anotoki-html-editor__preview anotoki-rich-html');
    expect(preview()?.querySelector('h2')?.textContent).toBe('Daily');
    expect(preview()?.querySelector('script')).toBeNull();
    expect(named('Preview')?.getAttribute('aria-pressed')).toBe('true');
    named('Preview')!.click();
    await settle(fixture);
    expect(preview()).toBeNull();
  });

  it('the colours: a panel with the kit’s colour field under the toolbar, Escape and Close back to its button', async () => {
    named('Text colour')!.click();
    await settle(fixture);
    const panel = host.querySelector<HTMLElement>('#guide .anotoki-html-editor__colours')!;
    expect(panel.getAttribute('aria-label')).toBe('Text colour');
    expect(named('Text colour')?.getAttribute('aria-expanded')).toBe('true');
    expect(named('Text colour')?.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.querySelector('anotoki-color-field')).not.toBeNull();
    expect(panel.querySelector<HTMLButtonElement>('[data-apply]')?.disabled).toBe(true);
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);
    expect(host.querySelector('#guide .anotoki-html-editor__colours')).toBeNull();
    expect(document.activeElement).toBe(named('Text colour'));
  });

  it('pictures pasted or dropped are the page’s, never the text’s - where the editor takes them', async () => {
    const picture = new File([new Uint8Array(4)], 'portrait.png', { type: 'image/png' });
    const paste = (id: string, text = '') => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files: [picture], getData: () => text } });
      editor(id).dispatchEvent(event);
      return event;
    };
    const taken = paste('guide');
    expect(taken.defaultPrevented).toBe(true);
    expect(page.pictures()).toEqual([picture]);
    page.pictures.set([]);
    // Words with the picture (a spreadsheet's cells): the words are what was meant.
    expect(paste('guide', 'Two cells').defaultPrevented).toBe(false);
    expect(page.pictures()).toEqual([]);
    // An editor that takes no pictures leaves the paste to the kit, which lets no file in.
    expect(paste('plain').defaultPrevented).toBe(false);
  });

  it('a link’s address asked in the editor’s own dialog: a web or mail address alone', async () => {
    await caretIn(editor().querySelector('p')!.firstChild!, true);
    named('Link')!.click();
    await settle(fixture);
    const dialog = document.querySelector<HTMLDialogElement>('anotoki-dialog-container dialog')!;
    expect(words(dialog.querySelector('h2'))).toBe('Add a link');
    const address = dialog.querySelector<HTMLInputElement>('input[type="url"]')!;
    address.value = 'javascript:alert(1)';
    address.dispatchEvent(new Event('input'));
    await settle(fixture);
    dialog.querySelector<HTMLButtonElement>('[data-link-add]')!.click();
    await settle(fixture);
    expect(words(dialog.querySelector('.anotoki-field__error'))).toBe('That cannot be a link: write a web address (https://…) or a mail address (mailto:…).');
    dialog.querySelector<HTMLButtonElement>('[data-link-cancel]')!.click();
    await settle(fixture);
    expect(document.querySelector('anotoki-dialog-container')).toBeNull();
  });

  it('the link on the words chosen as the dialog opened, wherever the focus coming back put the caret; Enter adds it and goes no further', async () => {
    const chosen = editor().querySelector('p')!.firstChild!;
    await caretIn(chosen, true);
    const linked: string[] = [];
    // jsdom does no editing: the browser's createLink is watched, with the selection it acts on.
    const exec = vi.fn((command: string, _ui?: boolean, value?: string) => {
      if (command === 'createLink') {
        const range = document.getSelection()!.getRangeAt(0);
        linked.push(`${value} on "${range.toString()}"`);
      }
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
    try {
      named('Link')!.click();
      await settle(fixture);
      const dialog = document.querySelector<HTMLDialogElement>('anotoki-dialog-container dialog')!;
      const address = dialog.querySelector<HTMLInputElement>('input[type="url"]')!;
      address.value = 'anotoki.eu/guides';
      address.dispatchEvent(new Event('input'));
      await settle(fixture);
      // The focus given back puts the caret at the text's start, as a browser does - and the text's selection follows it.
      await caretIn(editor().querySelector('h2')!.firstChild!);
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      address.dispatchEvent(enter);
      await settle(fixture);
      expect(enter.defaultPrevented).toBe(true);
      expect(document.querySelector('anotoki-dialog-container')).toBeNull();
      expect(linked).toEqual([`https://anotoki.eu/guides on "${chosen.textContent}"`]);
    } finally {
      delete (document as { execCommand?: unknown }).execCommand;
    }
  });

  it('disabled: nothing to write in, the buttons shut', async () => {
    page.disabled.set(true);
    await settle(fixture);
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(editor().getAttribute('aria-disabled')).toBe('true');
    expect(named('Bold')?.getAttribute('aria-disabled')).toBe('true');
    expect(named('Highlight')?.getAttribute('aria-disabled')).toBe('true');
    expect(named('Text size: Normal')?.disabled).toBe(true);
  });

  it('the library’s words in the page’s language', async () => {
    language.set('sk');
    await settle(fixture);
    expect(named('Nadpis 2')).not.toBeNull();
    expect(named('Veľkosť písma: Normálne')).not.toBeNull();
    expect(toolbar().getAttribute('aria-label')).toBe('The guide: formátovanie');
  });
});

describe('the HTML editor’s own editing (beyond the browser’s)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => root.remove());

  const range = (start: Node, end: Node = start) => {
    const made = document.createRange();
    made.setStart(start, 0);
    made.setEnd(end, end.childNodes.length || (end.textContent ?? '').length);
    return made;
  };

  it('a link a person types: a web or mail address, a site’s name made https - nothing else', () => {
    expect(typedLinkAddress('https://anotoki.eu/a')).toBe('https://anotoki.eu/a');
    expect(typedLinkAddress('mailto:hello@anotoki.eu')).toBe('mailto:hello@anotoki.eu');
    expect(typedLinkAddress(' anotoki.eu/guides ')).toBe('https://anotoki.eu/guides');
    for (const typed of ['javascript:alert(1)', 'data:text/html,x', '/database', '#top', '?page=2', '', 'a b']) {
      expect(typedLinkAddress(typed), typed).toBeNull();
    }
  });

  it('finds the element of the text round a node, never the text’s own box', () => {
    const p = document.createElement('p');
    const bold = Object.assign(document.createElement('b'), { textContent: 'bold' });
    p.append(bold);
    root.append(p);
    expect(closestIn(bold.firstChild, root, 'p')).toBe(p);
    expect(closestIn(bold.firstChild, root, 'div')).toBeNull();
  });

  it('indents the selected lines - never a list’s - in steps, none at nought, never past 400 px', () => {
    root.append(Object.assign(document.createElement('p'), { textContent: 'one' }), Object.assign(document.createElement('div'), { textContent: 'two' }));
    const list = document.createElement('ul');
    list.append(Object.assign(document.createElement('li'), { textContent: 'item' }));
    root.append(list, Object.assign(document.createElement('p'), { textContent: 'three' }));
    const [one, three] = [root.querySelector('p')!, root.querySelectorAll('p')[1]];
    const blocks = selectedBlocks(root, range(one.firstChild!, three.firstChild!));
    expect(blocks.map((block) => block.textContent)).toEqual(['one', 'two', 'three']);
    indentBlocks(blocks, 1, 24);
    indentBlocks(blocks, 1, 24);
    expect(one.style.marginLeft).toBe('48px');
    indentBlocks(blocks, -1, 24);
    indentBlocks(blocks, -1, 24);
    expect(one.hasAttribute('style')).toBe(false);
    for (let step = 0; step < 30; step++) {
      indentBlocks([one], 1, 24);
    }
    expect(one.style.marginLeft).toBe('400px');
  });

  it('makes the browser’s sentinel highlight a mark; takes a colour off; unwraps', () => {
    const span = document.createElement('span');
    span.style.backgroundColor = MARK_SENTINEL;
    span.textContent = 'marked';
    const bold = document.createElement('b');
    bold.style.backgroundColor = MARK_SENTINEL;
    bold.style.color = 'red';
    bold.textContent = 'bold';
    root.append(span, bold);
    sentinelToMarks(root);
    expect(root.querySelector('span')).toBeNull();
    expect(root.querySelector('mark')?.textContent).toBe('marked');
    expect(root.querySelector('b')?.getAttribute('style')).toBe('color: red;');
    expect(root.querySelector('b > mark')?.textContent).toBe('bold');

    const font = document.createElement('font');
    font.setAttribute('color', '#f44336');
    font.textContent = 'red';
    root.append(font);
    removeColour(root, range(font.firstChild!), 'fore');
    expect(root.querySelector('font')).toBeNull();
    expect(root.textContent).toContain('red');

    expect(touched(root, range(root.querySelector('b > mark')!.firstChild!), 'mark').length).toBe(1);
    root.querySelectorAll('mark').forEach(unwrap);
    expect(root.querySelector('mark')).toBeNull();
    expect(root.textContent).toBe('markedboldred');
  });
});
