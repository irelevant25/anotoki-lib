import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle } from '../../src/testing';
import { RichTextEditableDirective } from './editable.directive';

@Component({
  selector: 'anotoki-test-editable',
  imports: [RichTextEditableDirective],
  template: `<div id="editor" contenteditable="true" tabindex="0" anotokiRichTextEditable #editor="anotokiRichTextEditable">
      Hello <b id="bold">world</b> and <a id="link" href="https://anotoki.eu">a link</a>
    </div>
    <p id="outside">Elsewhere</p>`,
})
class EditablePageComponent {}

type Editing = Document & { execCommand?: unknown; queryCommandState?: unknown };

describe('[anotokiRichTextEditable]: the toolbar’s commands on a plain contenteditable, no markup let in from outside', () => {
  let host: HTMLElement;
  let fixture: Awaited<ReturnType<typeof draw<EditablePageComponent>>>;
  let editable: RichTextEditableDirective;
  let exec: ReturnType<typeof vi.fn>;
  let state: ReturnType<typeof vi.fn>;
  const original = { exec: (document as Editing).execCommand, state: (document as Editing).queryCommandState };

  beforeEach(async () => {
    // The browser's editing, which jsdom has not: what the directive asks of it.
    exec = vi.fn(() => true);
    state = vi.fn((command: string) => command === 'bold');
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true });
    Object.defineProperty(document, 'queryCommandState', { value: state, configurable: true, writable: true });
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(EditablePageComponent);
    host = fixture.nativeElement;
    const { debugElement } = fixture;
    editable = debugElement.children[0].injector.get(RichTextEditableDirective);
  });

  afterEach(() => {
    host?.remove();
    Object.defineProperty(document, 'execCommand', { value: original.exec, configurable: true, writable: true });
    Object.defineProperty(document, 'queryCommandState', { value: original.state, configurable: true, writable: true });
  });

  const editor = () => host.querySelector<HTMLElement>('#editor')!;
  /** The selection put inside an element, as the person's click would, and the document told. */
  const select = (element: Element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  };

  it('a command: the browser’s own editing, the focus in the editor first', () => {
    select(host.querySelector('#bold')!);
    expect(editable.run('bold')).toBe(true);
    expect(exec).toHaveBeenLastCalledWith('bold', false, undefined);
    expect(document.activeElement).toBe(editor());
    editable.run('bulletList');
    expect(exec).toHaveBeenLastCalledWith('insertUnorderedList', false, undefined);
    editable.run('strike');
    expect(exec).toHaveBeenLastCalledWith('strikeThrough', false, undefined);
    exec.mockClear();
    editable.run('clear');
    expect(exec.mock.calls.map((call) => call[0])).toEqual(['removeFormat', 'unlink']);
    expect(editable.run('link')).toBe(false);
  });

  it('the selection kept: a command goes back to where the person left it, wherever the focus went', () => {
    select(host.querySelector('#bold')!);
    // The toolbar's button took the focus, and something else moved the selection out.
    const range = document.createRange();
    range.selectNodeContents(host.querySelector('#outside')!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    editable.run('italic');
    const selection = document.getSelection()!;
    expect(editor().contains(selection.getRangeAt(0).commonAncestorContainer)).toBe(true);
    expect(selection.getRangeAt(0).toString()).toBe('world');
  });

  it('active: the formats on where the caret is - the browser’s say, and a link the caret is in', async () => {
    select(host.querySelector('#bold')!);
    await settle(fixture);
    expect(editable.active()).toEqual(['bold']);
    state.mockImplementation(() => false);
    select(host.querySelector('#link')!);
    await settle(fixture);
    expect(editable.active()).toEqual(['link']);
    // The selection elsewhere in the page: the editor's last formats stand (the toolbar's own focus moves nothing).
    select(host.querySelector('#outside')!);
    expect(editable.active()).toEqual(['link']);
  });

  it('a link: a web, mail or the site’s own address, never another scheme', () => {
    select(host.querySelector('#bold')!);
    expect(editable.link('javascript:alert(1)')).toBe(false);
    expect(editable.link('data:text/html,x')).toBe(false);
    expect(exec).not.toHaveBeenCalled();
    expect(editable.link('anotoki.eu/guides')).toBe(true);
    expect(exec).toHaveBeenLastCalledWith('createLink', false, 'https://anotoki.eu/guides');
    editable.unlink();
    expect(exec).toHaveBeenLastCalledWith('unlink', false, undefined);
  });

  it('a paste or a drop that brings markup comes in as its plain text; files dropped not at all; plain text is left to the browser', () => {
    const before = (inputType: string, data: Record<string, string>, types = Object.keys(data)) => {
      const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { types, getData: (type: string) => data[type] ?? '' } });
      editor().dispatchEvent(event);
      return event;
    };
    const html = before('insertFromPaste', { 'text/html': '<img src=x onerror=alert(1)><b>Hi</b>', 'text/plain': 'Hi' });
    expect(html.defaultPrevented).toBe(true);
    expect(exec).toHaveBeenLastCalledWith('insertText', false, 'Hi');
    exec.mockClear();
    const files = before('insertFromDrop', {}, ['Files']);
    expect(files.defaultPrevented).toBe(true);
    expect(exec).not.toHaveBeenCalled();
    const plain = before('insertFromPaste', { 'text/plain': 'Just words' });
    expect(plain.defaultPrevented).toBe(false);
    const typed = before('insertText', {});
    expect(typed.defaultPrevented).toBe(false);
  });
});
