import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminTools, registerAdminIcons } from '@anotoki/lib/admin/parts';
import { ANOTOKI_MIGRATIONS_CONFIG, DEFAULT_STAFF_ROUTE, SiteStatus } from '@anotoki/lib/migrations';
import { SiteSettings } from '@anotoki/lib/site-settings';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { ErrorStateComponent } from '@anotoki/lib/ui/error-state';
import { AnotokiIcons, IconComponent } from '@anotoki/lib/ui/icon';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { registerPageIcons } from '../icons';
import { AdminSiteSettings, Message, SitePart } from '../models';
import { PagesDialogComponent } from '../pages-dialog/pages-dialog.component';
import { SwitchesDialogComponent } from '../switches-dialog/switches-dialog.component';

/** The server's word for "the tables are not there yet". */
const UNAVAILABLE = 'feature_unavailable';

/** The announcement's kinds, as the page says them. */
export const LEVEL_NAMES: Readonly<Record<string, string>> = { info: 'Information', warning: 'Warning', danger: 'Something is wrong' };

/** Who sees a page, as the page says it. */
export const VISIBILITY_NAMES: Readonly<Record<string, string>> = { PUBLIC: 'Anybody', USER: 'Anybody signed in', EDITOR: 'Editors and administrators', ADMIN: 'Administrators only' };

/** A line of a card: what it covers, and what it says now - `on` where something is in force. */
interface SummaryLine {
  label: string;
  state: string;
  on: boolean;
}

/** A card on the page: a part the site offers, saying what it is doing without being opened. */
interface Card {
  part: SitePart;
  title: string;
  note: string;
  icon: string;
  lines: SummaryLine[];
}

const counted = (count: number): string => (count ? String(count) : 'none');

/** How many languages a message is written in, as a card says it. */
function written(message: Message | undefined, none: string): string {
  const count = Object.values(message ?? {}).filter((text) => text.trim() !== '').length;
  return count ? `${count} ${count === 1 ? 'language' : 'languages'}` : none;
}

/**
 * The administrators' site settings (English, for the site's ADMIN alone) - the genshin site's settings page, for
 * every anotoki site (0.11.0): a card for each part the site offers, each saying what it is doing on its face, and
 * opening the rest in a dialog:
 *
 * - **Getting in**: maintenance mode, and what the maintenance page says in each language;
 * - **Announcement**: the bar across the top of every page - shown or not, its kind, its words in each language;
 * - **Page access**: a row per page - who sees it, whether it is switched off, the API paths refused with it.
 *
 * Every switch takes effect the moment it is saved, for everybody - and the server keeps it too (the site's gate,
 * Page access's gate): what is closed or hidden here is refused to anything that asks the API directly. The
 * administrators are never shut out of anything.
 *
 * For the site's ADMIN alone (`isAdmin`); anybody else is told whose page it is, and nothing is asked of the server.
 * While the tables wait for a database update, the page says so and links to the site's Migrations page.
 */
@Component({
  selector: 'anotoki-site-settings-page',
  imports: [RouterLink, AlertComponent, ButtonComponent, ErrorStateComponent, IconComponent, PageHeaderComponent, SpinnerComponent, PagesDialogComponent, SwitchesDialogComponent],
  templateUrl: './site-settings-page.component.html',
  styleUrl: './site-settings-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-site-settings-page', lang: 'en' },
})
export class SiteSettingsPageComponent {
  protected readonly tools = inject(AdminTools);
  private readonly base = this.tools.base('site-settings');
  private readonly publicSettings = inject(SiteSettings);
  private readonly status = inject(ANOTOKI_MIGRATIONS_CONFIG, { optional: true }) ? inject(SiteStatus) : null;
  /** Where the administrators sign in while the site is closed: the maintenance switch says so. */
  protected readonly staffRoute = inject(ANOTOKI_MIGRATIONS_CONFIG, { optional: true })?.staffRoute ?? DEFAULT_STAFF_ROUTE;

  protected readonly data = signal<AdminSiteSettings | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly unavailable = signal(false);
  /** What the last save did, read out. */
  protected readonly happened = signal('');
  /** The part whose dialog is open. */
  protected readonly editing = signal<SitePart | null>(null);

  /** The languages a message is written in: the site's, by their own names - English and Slovak unless it says. */
  protected readonly languages = computed(() => {
    const own = this.tools.config?.languages?.() ?? [];
    return own.length
      ? own
      : [
          { code: 'en', name: 'English' },
          { code: 'sk', name: 'Slovenčina' },
        ];
  });

  protected readonly cards = computed<Card[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const settings = data.settings;
    const cards: Card[] = [];
    if (data.parts.includes('getting_in')) {
      const on = settings.maintenance_mode?.value === true;
      cards.push({
        part: 'getting_in',
        title: 'Getting in',
        note: 'Whether the site is open to everybody, or closed for maintenance to all but its administrators.',
        icon: 'key',
        lines: [
          { label: 'Maintenance mode', state: on ? 'On' : 'Off', on },
          { label: 'The maintenance page says', state: written(settings.maintenance_message?.value, 'the built-in sentence'), on: false },
        ],
      });
    }
    if (data.parts.includes('announcement')) {
      const on = settings.announcement_enabled?.value === true;
      cards.push({
        part: 'announcement',
        title: 'Announcement',
        note: 'A line across the top of every page, for when one thing has to reach everybody at once.',
        icon: 'message',
        lines: [
          { label: 'Shown', state: on ? 'On' : 'Off', on },
          { label: 'Kind', state: LEVEL_NAMES[settings.announcement_level?.value ?? 'info'] ?? 'Information', on: false },
          { label: 'Message', state: written(settings.announcement_message?.value, 'not written'), on: false },
        ],
      });
    }
    if (data.parts.includes('page_access')) {
      const pages = data.pages.filter((page) => page.refused === null);
      const off = pages.filter((page) => page.blocked).length;
      const limited = pages.filter((page) => !page.blocked && page.visibility !== 'PUBLIC').length;
      const locking = pages.filter((page) => page.api_paths.length > 0).length;
      cards.push({
        part: 'page_access',
        title: 'Page access',
        note: 'Which pages exist, who they are shown to, and which API paths are refused with them.',
        icon: 'layers',
        lines: [
          { label: 'Pages governed', state: String(pages.length), on: false },
          { label: 'Switched off', state: counted(off), on: off > 0 },
          { label: 'For some readers alone', state: counted(limited), on: limited > 0 },
          { label: 'Refusing their API paths too', state: counted(locking), on: locking > 0 },
        ],
      });
    }
    return cards;
  });

  /** The open card's title, for the dialog. */
  protected readonly editingTitle = computed(() => this.cards().find((card) => card.part === this.editing())?.title ?? '');

  constructor() {
    const icons = inject(AnotokiIcons);
    registerAdminIcons(icons);
    registerPageIcons(icons);
    // Asked once the person is the site's ADMIN - and again when they become one (a sign-in finished meanwhile).
    effect(() => {
      if (this.tools.isAdmin()) {
        untracked(() => void this.load());
      }
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.data.set(await this.tools.get<AdminSiteSettings>(this.base));
      this.unavailable.set(false);
    } catch (error) {
      const failure = this.tools.failure(error);
      if (failure.code === UNAVAILABLE) {
        this.unavailable.set(true);
      } else {
        this.loadError.set(this.tools.say(failure));
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected open(part: SitePart): void {
    this.happened.set('');
    this.editing.set(part);
  }

  protected close(): void {
    this.editing.set(null);
  }

  /**
   * What a dialog saved: the page's whole as the server now has it - the cards say it, the site's own pages in this
   * tab hear it (the announcement bar, the closed sign's state for the notice), and the line under the heading says so.
   */
  protected saved(event: { data: AdminSiteSettings; said: string; close: boolean }): void {
    this.data.set(event.data);
    this.happened.set(event.said);
    if (event.close) {
      this.editing.set(null);
    }
    if (this.publicSettings.loaded()) {
      void this.publicSettings.refresh();
    }
    if (this.status && this.status.state() !== 'unknown') {
      void this.status.check();
    }
  }
}
