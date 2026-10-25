import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { IconComponent, KitIconName } from '@anotoki/lib/ui/icon';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { SITE_SETTINGS_LIBRARY_WORDS } from '@anotoki/lib/words/site-settings';

/** The announcement's kind - the site settings' AnnouncementLevel, which this part cannot import (ng-packagr allows no cycle). */
type Level = 'info' | 'warning' | 'danger';

const ICONS: Record<Level, KitIconName> = { info: 'info', warning: 'alert', danger: 'xCircle' };

const LEVEL_WORDS = {
  info: 'anotoki.siteSettings.levelInfo',
  warning: 'anotoki.siteSettings.levelWarning',
  danger: 'anotoki.siteSettings.levelDanger',
} as const;

/**
 * The bar across the top of every page, as it is drawn: in the kind's colours and icon - information, a warning,
 * something wrong - the kind said to a screen reader before the message, the message's lines as they were written,
 * and Hide. <anotoki-announcement> (@anotoki/lib/site-settings) decides whether there is one to show and in which
 * language, loads this part only then, and is told when Hide is pressed (`hide`): it keeps the mark of what was hidden.
 *
 * Its element is the bar itself - a <section class="anotoki-announcement__bar" data-announcement> made in the
 * announcement's place - so the page holds what it held when the bar was drawn in the element: nothing more in between.
 * Its words are the library's (`anotoki.siteSettings.*`), read by the bar itself - the site's string first.
 */
@Component({
  selector: 'section.anotoki-announcement__bar',
  imports: [ButtonComponent, IconComponent],
  templateUrl: './announcement-bar.component.html',
  styleUrl: './announcement-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-announcement__bar',
    'data-announcement': '',
    '[class.anotoki-announcement__bar--warning]': "level() === 'warning'",
    '[class.anotoki-announcement__bar--danger]': "level() === 'danger'",
    '[attr.data-level]': 'level()',
    '[attr.aria-label]': "word('anotoki.siteSettings.announcement').text",
  },
})
export class AnnouncementBarComponent {
  protected readonly word = pieceWords(SITE_SETTINGS_LIBRARY_WORDS);

  /** Its kind. */
  readonly level = input<Level>('info');
  /** The administrators' words, in the page's language or in English. */
  readonly text = input('');
  /** Their language where it is not the page's ('en'), for a `lang` attribute; null otherwise. */
  readonly lang = input<string | null>(null);

  /** Hide was pressed: the announcement's element keeps a mark of it and takes the bar away. */
  readonly hide = output<void>();

  protected readonly icon = computed(() => ICONS[this.level()]);
  protected readonly levelWord = computed(() => this.word(LEVEL_WORDS[this.level()]));
}
