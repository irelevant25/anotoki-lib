import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, ViewEncapsulation, computed, effect, inject, input } from '@angular/core';
import { drawRichNodes } from '../dom';
import { parseRichHtml } from '../parse';
import { cleanRichNodes } from '../rules';

/**
 * A text's HTML on the page, made safe: `<anotoki-rich-html [html]="guide.content" />` - a guide, a voice line, a
 * survey's question.
 *
 * The one way the family shows HTML a person wrote: the text is read by the library (never by the browser - no markup
 * handed to it, no sanitizer switched off), put through the allow-list (rules.ts: paragraphs, headings, lists, the
 * words' formats, links to the web and to a mail address, five inline styles, the site's own class names), and drawn
 * node by node - each element made by its tag, each word a text node. A script, an event handler, a javascript: link, a style
 * that would leave the text's box: none of it is ever in the page. A new text, or a new list of classes, draws it again.
 *
 * Its typography is the family's - paragraphs, headings, lists, links in the link's ink, a highlighter's mark in the
 * warning's soft ground - under the host's class (`anotoki-rich-html`), each rule as weak as one class (`:where()`), so
 * a site's own styles for its texts win: genshin's `.anotoki-rich-html .tag`. `classes` names the class names its texts
 * may carry (none by default). The colours a writer gave stay theirs, the same in both themes.
 */
@Component({
  selector: 'anotoki-rich-html',
  templateUrl: './rich-html.component.html',
  styleUrl: './rich-html.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The text is drawn by the component itself, node by node: its elements carry no attribute of Angular's scoping, so
  // its rules are under the host's class instead.
  encapsulation: ViewEncapsulation.None,
  host: { class: 'anotoki-rich-html' },
})
export class RichHtmlComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);

  /** The text's HTML, as it was kept. */
  readonly html = input<string | null | undefined>('');
  /** The class names its texts may carry - each its own style, the site's (genshin's "tag"); none by default. */
  readonly classes = input<readonly string[]>([]);

  /** The text through the allow-list. */
  private readonly nodes = computed(() => cleanRichNodes(parseRichHtml(this.html()), { classes: this.classes() }));

  constructor() {
    effect(() => {
      const nodes = this.nodes();
      this.host.replaceChildren();
      drawRichNodes(nodes, this.host, this.document);
    });
  }
}
