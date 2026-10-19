import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ANOTOKI_LEGAL_CONFIG, legalPaths } from '@anotoki/lib/legal';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { ANOTOKI_NAME_ORIGIN, ANOTOKI_PROJECTS, SentencePart, sentenceParts } from '../projects';
import { aboutWords } from '../words';

/**
 * The About page (0.8.0), the same on every anotoki site, in the owner's own words: where the name anotoki comes
 * from - the Japanese あの時 in Japanese, its reading in italics -, who makes the projects, each project (its name a
 * link to its site, the fan clause under the two about HoYoverse's games), and a last line whose link goes to the
 * Support page (the site's path for it, provideAnotokiLegal()'s `paths`).
 *
 * In the page's language (`anotoki.about.*`: an owner's rewording from the site's database, else the built-in English
 * and impersonal Slovak), read by the page itself; every address it links to is the library's code. One `<h1>`, a
 * section per `<h2>`, each project an `<h3>`; in the site's frame - the one its legal pages are in. With the legal
 * configuration or without it (the page's own language, the default paths). For a lazy route of the site's own:
 * `loadComponent: () => import('@anotoki/lib/legal/about').then((m) => m.AboutPageComponent)`.
 */
@Component({
  selector: 'anotoki-about-page',
  imports: [PageHeaderComponent, RouterLink],
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-about-page', '[attr.lang]': 'said().lang' },
})
export class AboutPageComponent {
  private readonly config = inject(ANOTOKI_LEGAL_CONFIG, { optional: true });
  private readonly document = inject(DOCUMENT);

  private readonly language = computed(() => (this.config?.language?.() || this.document.documentElement.lang || 'en').trim());
  protected readonly said = computed(() => aboutWords(this.language(), this.config?.translate));
  protected readonly w = computed(() => this.said().words);
  protected readonly origin = ANOTOKI_NAME_ORIGIN;
  protected readonly supportPath = computed(() => legalPaths(this.config?.paths).support);

  /** Where the name comes from: the sentence around the Japanese word and its reading. */
  protected readonly nameParts = computed(() => sentenceParts(this.w().nameText, ['word', 'reading']));

  /** The last line around its link to the Support page - which follows the words of a rewording that left out its place. */
  protected readonly closingParts = computed<SentencePart[]>(() => {
    const parts = sentenceParts(this.w().closing, ['support']);
    return parts.some((part) => part.name === 'support') ? parts : [...parts, { text: ' ' }, { name: 'support' }];
  });

  /** The projects, worded: each its name, its site and what it is. */
  protected readonly projects = computed(() => {
    const w = this.w();
    return ANOTOKI_PROJECTS.map((project) => ({ ...project, name: w[`${project.id}Name`], text: w[`${project.id}Text`] }));
  });
}
