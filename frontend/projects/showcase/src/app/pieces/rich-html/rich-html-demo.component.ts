import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CardComponent } from '@anotoki/lib/ui/card';
import { ColorSwatch } from '@anotoki/lib/ui/color-field';
import { HtmlEditorComponent } from '@anotoki/lib/ui/html-editor';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { RichHtmlComponent, cleanRichHtml } from '@anotoki/lib/ui/rich-html';

/** A stored text no editor wrote: what anybody who may edit could send the API straight. */
const ATTACK = [
  '<h3>A guide, as somebody sent it</h3>',
  '<p onmouseover="alert(1)">Hover me. <img src="x" onerror="alert(2)"> <a href="javascript:alert(3)">A link</a></p>',
  '<script>alert(4)</script><style>body { display: none }</style>',
  '<p style="position: fixed; inset: 0; z-index: 9999; background-color: red;">This would cover the page.</p>',
  '<p><a href="https://anotoki.eu" target="_self">A real address</a> stays, opening apart.</p>',
].join('');

/**
 * One HTML editor and one safe view (0.11.0): genshin's guide editor - sizes, fonts, colours, the source and the
 * preview - and the survey's question editor - headings, the highlighter, pictures handed out; the value each writes,
 * and a stored text no editor wrote drawn through the same allow-list.
 */
@Component({
  selector: 'show-rich-html-demo',
  imports: [CardComponent, HtmlEditorComponent, PageHeaderComponent, RichHtmlComponent],
  templateUrl: './rich-html-demo.component.html',
  styleUrl: './rich-html-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RichHtmlDemoComponent {
  protected readonly guide = signal(
    '<h4>What is the Daily?</h4><p>Two quizzes are drawn at random each day: <strong>banners</strong> or <span class="tag">music</span>.</p><ol><li>Every question is timed.</li><li>The day rolls over at 00:00 UTC.</li></ol><p><font color="#2196f3">Coloured</font> words and a <span style="background-color: rgb(255, 235, 59);">highlight colour</span>.</p>',
  );
  protected readonly question = signal('<h2>Welcome</h2><p>Which of these do you play <mark>most</mark>?</p>');
  protected readonly pictures = signal<readonly string[]>([]);
  protected readonly fonts = ['Arial', 'Times New Roman', 'Courier New'];
  protected readonly swatches: readonly ColorSwatch[] = [
    { value: '#f44336', name: 'Red' },
    { value: '#2196f3', name: 'Blue' },
    { value: '#4caf50', name: 'Green' },
    { value: '#ffeb3b', name: 'Yellow' },
  ];
  protected readonly attack = ATTACK;
  protected readonly attackClean = cleanRichHtml(ATTACK);

  protected onPictures(files: readonly File[]): void {
    this.pictures.update((names) => [...names, ...files.map((file) => file.name)]);
  }
}
