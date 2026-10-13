import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalLink, cutAt, isOwnPath } from '../page';

/**
 * A sentence of the legal pages with one link where its placeholder stands - the address to write to
 * (`{email}`, a mailto link), who runs the site (`{operator}`), the data protection authority (`{authority}`) -
 * drawn as text around the link, never as markup. The rest of its placeholders are filled from `params`. An
 * owner's rewording without the placeholder keeps its words, and the link follows them. Phrasing content: it goes
 * inside the page's own paragraph.
 */
@Component({
  selector: 'anotoki-legal-text',
  imports: [RouterLink],
  templateUrl: './legal-text.component.html',
  styleUrl: './legal-text.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-legal-text' },
})
export class LegalTextComponent {
  readonly text = input.required<string>();
  readonly params = input<Readonly<Record<string, string | number>>>({});
  readonly link = input<LegalLink | null>(null);

  protected readonly parts = computed(() => cutAt(this.text(), this.link()?.name ?? null, this.params()));
  /** A path of the site's own: the router follows it. */
  protected readonly own = computed(() => {
    const link = this.link();
    return link !== null && isOwnPath(link.href);
  });
}
