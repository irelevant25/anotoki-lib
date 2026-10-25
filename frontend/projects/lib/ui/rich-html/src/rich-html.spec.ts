import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import cases from '../../../../../../backend/tests/RichHtml/cases.json';
import { draw, kitProviders, settle } from '../../src/testing';
import { drawRichNodes, readRichDom } from './dom';
import { parseRichHtml } from './parse';
import { RichHtmlComponent } from './rich-html/rich-html.component';
import { cleanRichHtml, cleanRichNodes, richHtmlIsBlank, richHtmlText, richLinkAddress, writeRichHtml } from './rules';

/** The cases both halves are held to: the PHP half's RichHtmlTest reads the same file. */
const CASES = cases as readonly { name: string; html: string; classes?: string[]; clean: string; text: string }[];

describe('the allow-list of a text’s HTML (ui/rich-html): the same text as the PHP half', () => {
  for (const one of CASES) {
    it(one.name, () => {
      expect(cleanRichHtml(one.html, { classes: one.classes ?? [] })).toBe(one.clean);
      expect(richHtmlText(one.html)).toBe(one.text);
      // What is clean stays as it is: cleaning it again changes nothing.
      expect(cleanRichHtml(one.clean, { classes: one.classes ?? [] })).toBe(one.clean);
    });
  }
});

describe('the allow-list: no script, no handler, no dangerous address, no style that leaves the box', () => {
  const ALLOWED_TAG = /<(?!\/?(p|div|h[234]|ul|ol|li|br|b|strong|i|em|u|s|strike|mark|span|font|a)[\s>])/i;
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<body onload=alert(1)>',
    '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JAVASCRIPT:alert(1)">x</a>',
    '<a href="  javascript:alert(1)">x</a>',
    '<a href="java&#x09;script:alert(1)">x</a>',
    '<a href="&#x6A;avascript:alert(1)">x</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<p style="position: fixed; inset: 0; z-index: 99999">x</p>',
    '<p style="background-color: url(javascript:alert(1))">x</p>',
    '<p style="color: expression(alert(1))">x</p>',
    '<p style="margin-left: -9999px">x</p>',
    '<p style="font-size: 9999px">x</p>',
    '<p style="-moz-binding: url(x)">x</p>',
    '<p style="color: red; } body { display: none">x</p>',
    '<form><input name="password"></form>',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
    '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    '<object data="x.swf"></object><embed src="x.swf">',
  ];

  for (const attack of attacks) {
    it(attack, () => {
      const clean = cleanRichHtml(attack);
      expect(clean).not.toMatch(ALLOWED_TAG);
      expect(clean).not.toMatch(/\son[a-z]+\s*=/i);
      expect(clean).not.toMatch(/javascript:|vbscript:|data:|expression\(|url\(|position|z-index|-moz-binding|-9999|9999px/i);
    });
  }

  it('a link goes to the web or to a mail address, and opens apart from the page', () => {
    expect(richLinkAddress(' https://anotoki.eu/a?b=1 ')).toBe('https://anotoki.eu/a?b=1');
    expect(richLinkAddress('mailto:hello@anotoki.eu')).toBe('mailto:hello@anotoki.eu');
    for (const address of ['javascript:alert(1)', '/admin', '//evil.example', 'evil.example', 'https://', 'mailto:nobody', 'https://a b', 'https://a"b', 'https://a\\b', 'a'.repeat(2001)]) {
      expect(richLinkAddress(address), address).toBeNull();
    }
    expect(cleanRichHtml('<a href="https://anotoki.eu" target="_self">x</a>')).toBe('<a target="_blank" rel="noopener noreferrer" href="https://anotoki.eu">x</a>');
  });

  it('no words is blank: an emptied editor, a script’s, a picture’s words', () => {
    expect(richHtmlIsBlank('')).toBe(true);
    expect(richHtmlIsBlank(null)).toBe(true);
    expect(richHtmlIsBlank('<p></p>')).toBe(true);
    expect(richHtmlIsBlank('<p> &nbsp; </p><p><br></p>')).toBe(true);
    expect(richHtmlIsBlank('<script>words</script><img alt="words">')).toBe(true);
    expect(richHtmlIsBlank('<p>x</p>')).toBe(false);
  });

  it('a tree written again reads as the same tree: what the writer escapes stays words', () => {
    const tree = [{ tag: 'p', attrs: [['style', 'font-family: "A"; color: red;']] as const, children: [{ text: '<b>&nbsp;"' }] }];
    const html = writeRichHtml(tree);
    expect(html).toBe('<p style="font-family: &quot;A&quot;; color: red;">&lt;b&gt;&amp;nbsp;"</p>');
    expect(cleanRichNodes(parseRichHtml(html))).toEqual(tree);
  });
});

describe('the page’s own elements: drawn node by node, and read back through the allow-list', () => {
  it('draws a cleaned tree with elements and text nodes, never as markup', () => {
    const box = document.createElement('div');
    drawRichNodes(cleanRichNodes(parseRichHtml('<p>a <b onclick="x()">b</b> &lt;i&gt;</p><script>alert(1)</script>')), box, document);
    expect(box.querySelector('p')?.textContent).toBe('a b <i>');
    expect(box.querySelector('b')?.getAttribute('onclick')).toBeNull();
    expect(box.querySelector('i')).toBeNull();
    expect(box.querySelector('script')).toBeNull();
  });

  it('reads an element of the page - an editor’s - through the allow-list', () => {
    const box = document.createElement('div');
    const p = document.createElement('p');
    p.setAttribute('style', 'margin-left: 20px; position: absolute');
    p.setAttribute('onmouseover', 'x()');
    p.append('Line ', Object.assign(document.createElement('b'), { textContent: 'bold' }), document.createComment('a comment'));
    const image = document.createElement('img');
    image.setAttribute('src', 'x');
    box.append(p, image);
    expect(writeRichHtml(readRichDom(box))).toBe('<p style="margin-left: 20px;">Line <b>bold</b></p>');
  });
});

@Component({
  selector: 'anotoki-test-rich-html',
  imports: [RichHtmlComponent],
  template: `<anotoki-rich-html [html]="html()" [classes]="classes()" />`,
})
class RichHtmlPageComponent {
  readonly html = signal<string | null>('<h4>Guide</h4><p>Hi <span class="tag">music</span> <a href="https://anotoki.eu" onclick="x()">site</a></p><script>alert(1)</script>');
  readonly classes = signal<readonly string[]>(['tag']);
}

describe('<anotoki-rich-html>: the safe view', () => {
  let host: HTMLElement;
  let fixture: Awaited<ReturnType<typeof draw<RichHtmlPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(RichHtmlPageComponent);
    host = fixture.nativeElement;
  });

  afterEach(() => host.remove());

  const view = () => host.querySelector('anotoki-rich-html')!;

  it('draws the text through the allow-list: the site’s classes kept, links opening apart, nothing that runs', () => {
    expect(view().classList).toContain('anotoki-rich-html');
    expect(view().querySelector('h4')?.textContent).toBe('Guide');
    expect(view().querySelector('span.tag')?.textContent).toBe('music');
    const link = view().querySelector('a')!;
    expect([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel'), link.getAttribute('onclick')]).toEqual(['https://anotoki.eu', '_blank', 'noopener noreferrer', null]);
    expect(view().querySelector('script')).toBeNull();
  });

  it('draws again as the text or the classes change - nothing for nothing', async () => {
    fixture.componentInstance.classes.set([]);
    await settle(fixture);
    expect(view().querySelector('span')?.hasAttribute('class')).toBe(false);
    fixture.componentInstance.html.set('<ul><li>One</li></ul>');
    await settle(fixture);
    expect(view().querySelectorAll('li').length).toBe(1);
    expect(view().querySelector('h4')).toBeNull();
    fixture.componentInstance.html.set(null);
    await settle(fixture);
    expect(view().childNodes.length).toBe(0);
  });
});
