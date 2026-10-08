import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

/**
 * The anotoki mark and the wordmark beside it: "anotoki" and the part of the
 * family ("survey", "account"), and in an admin panel " · admin panel" after
 * it - "anotoki survey · admin panel", the family's one form.
 *
 * Without the name (`showName` false: a phone's bar) the area alone stands
 * beside the mark, and the panel goes small under it.
 *
 * The mark's `alt` is empty: the wordmark beside it says the name, and saying
 * it twice is noise. With a `link` the whole is one link, named by `label` -
 * which holds the words shown (WCAG 2.5.3). `current` marks it as the page's
 * own link (the home page); `lang` gives the wordmark its language where it
 * is a name in another language than the page's.
 */
@Component({
  selector: 'anotoki-brand',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './brand.component.html',
  styleUrl: './brand.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-brand' },
})
export class BrandComponent {
  /** The part of the family, after "anotoki": "survey", "account", "Japanese". */
  readonly area = input<string | null>(null);
  /** The part of the site, after the area and a dot: "admin panel". */
  readonly panel = input<string | null>(null);
  /** "anotoki" in the wordmark; without it, the area alone beside the mark. */
  readonly showName = input(true, { transform: booleanAttribute });
  /** Where the brand leads: the site's home. Without it, the brand is no link. */
  readonly link = input<string | null>(null);
  /** The link's name, holding the words shown: "anotoki survey: the open surveys". */
  readonly label = input<string | null>(null);
  /** The brand is the page's own link (the home page). */
  readonly current = input(false, { transform: booleanAttribute });
  /** The wordmark's language, where it is not the page's ("en" for "Japanese" on a Slovak page). */
  readonly lang = input<string | null>(null);
  /** The mark's width, in px. */
  readonly size = input(32);
  /** The mark's picture: the site's own public file. */
  readonly logo = input('anotoki.png');
}
