import { ChangeDetectionStrategy, Component, ViewContainerRef, computed, inject, inputBinding, outputBinding, signal, viewChild } from '@angular/core';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { ANOTOKI_SITE_SETTINGS_CONFIG } from '../config';
import { drawWhile } from '../drawn-part';
import { SiteAnnouncement, SiteSettings } from '../site-settings.service';

/**
 * A mark of an announcement - its kind and its words in every language - never the words themselves: what the browser
 * keeps of one its reader hid. Another announcement, or the same one reworded or made graver, is another mark, and
 * shows again. FNV-1a, 32 bits: a fingerprint, not a secret.
 */
export function announcementMark(announcement: SiteAnnouncement): string {
  const text = [
    announcement.level,
    ...Object.keys(announcement.message)
      .sort()
      .map((language) => `${language}\u0000${announcement.message[language]}`),
  ].join('\u0001');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `v1:${hash.toString(16).padStart(8, '0')}`;
}

/**
 * The bar across the top of every page, when the site's administrators have something to say (the site settings'
 * "Announcement"): in the kind's colours and icon - information, a warning, something wrong - the kind said to a
 * screen reader before the message, the message in the page's language (else English: nothing is drawn where neither
 * is written), its lines as they were written. Above the site's header rather than in it: it is the site talking,
 * not navigation.
 *
 * Hide hides it in this browser until its words change (or it is made graver): the browser keeps a mark of it under
 * the site's `storageKey`, never the words. Where the browser keeps nothing (a private window, storage switched off),
 * it hides for the page's life.
 *
 * The bar itself is drawn by @anotoki/lib/site-settings/bar, which this element fetches only while there is an
 * announcement to show (0.11.1): the bar, the kit's pieces it draws and its words (`anotoki.siteSettings.*`, read by
 * the bar itself - the site's string first) are in no first load. With nothing to show the element holds nothing.
 */
@Component({
  selector: 'anotoki-announcement',
  templateUrl: './announcement.component.html',
  styleUrl: './announcement.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-announcement' },
})
export class AnnouncementComponent {
  private readonly settings = inject(SiteSettings);
  private readonly kit = inject(AnotokiWords);
  private readonly config = inject(ANOTOKI_SITE_SETTINGS_CONFIG, { optional: true });
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });

  private readonly dismissed = signal(this.read());

  /** The bar to draw: its kind, its words in the page's language (or English) and theirs, its mark; null for none. */
  protected readonly bar = computed(() => {
    const announcement = this.settings.announcement();
    if (!announcement || announcementMark(announcement) === this.dismissed()) {
      return null;
    }
    const language = this.kit.language();
    for (const code of [language, language.split('-')[0], 'en']) {
      const text = announcement.message[code]?.trim();
      if (text) {
        return { level: announcement.level, text, lang: code === language ? null : code, mark: announcementMark(announcement) };
      }
    }
    return null;
  });

  constructor() {
    drawWhile(
      'bar',
      () => this.slot(),
      () => this.bar() !== null,
      () => [
        inputBinding('level', () => this.bar()?.level ?? 'info'),
        inputBinding('text', () => this.bar()?.text ?? ''),
        inputBinding('lang', () => this.bar()?.lang ?? null),
        outputBinding('hide', () => this.dismiss()),
      ],
    );
  }

  protected dismiss(): void {
    const bar = this.bar();
    if (!bar) {
      return;
    }
    this.dismissed.set(bar.mark);
    try {
      if (this.config?.storageKey) {
        localStorage.setItem(this.config.storageKey, bar.mark);
      }
    } catch {
      // A browser that keeps nothing: hidden for the page's life.
    }
  }

  private read(): string | null {
    try {
      return this.config?.storageKey ? localStorage.getItem(this.config.storageKey) : null;
    } catch {
      return null;
    }
  }
}
