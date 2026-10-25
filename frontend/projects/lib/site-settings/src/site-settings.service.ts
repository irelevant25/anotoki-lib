import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ANOTOKI_SITE_SETTINGS_CONFIG, DEFAULT_SITE_SETTINGS_URL } from './config';

/** Who a page is shown to, from the most open: anybody, somebody signed in, editors and administrators, administrators. */
export type PageVisibility = 'PUBLIC' | 'USER' | 'EDITOR' | 'ADMIN';

/** The announcement's kind: "know this", "watch out", "something is wrong". */
export type AnnouncementLevel = 'info' | 'warning' | 'danger';

/** The bar across the top of every page: its kind, and its message per language. */
export interface SiteAnnouncement {
  readonly level: AnnouncementLevel;
  readonly message: Readonly<Record<string, string>>;
}

/** A page a row of Page access governs: its path as the router declares it, who sees it, whether it is switched off. */
export interface PublicPage {
  readonly path: string;
  readonly visibility: PageVisibility;
  readonly blocked: boolean;
}

/** What an administrator is told about the page they are on: switched off, or shown to some readers alone. */
export type PageNotice = { readonly kind: 'off' } | { readonly kind: 'limited'; readonly visibility: Exclude<PageVisibility, 'PUBLIC'> };

const LEVELS: readonly string[] = ['info', 'warning', 'danger'];
const VISIBILITIES: readonly string[] = ['PUBLIC', 'USER', 'EDITOR', 'ADMIN'];

/** A path's segments: '/' -> [], '/a/:id/' -> ['a', ':id']. */
function segments(path: string): string[] {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? [] : trimmed.split('/');
}

/**
 * Whether a row's path is this page's: the same number of segments, each the same or a placeholder (':id' stands for
 * any one segment). '/database/characters' is not '/database/characters/5': two rows, two decisions - the PHP half's
 * PageRules::matches(), which decides the same for the server.
 */
export function pageMatches(pattern: string, path: string): boolean {
  const left = segments(pattern);
  const right = segments(path.split(/[?#]/)[0]);
  return left.length === right.length && left.every((segment, index) => segment.startsWith(':') || segment === right[index]);
}

/** The server's answer, read defensively: what is no announcement or no page is nothing. */
function announcementFrom(value: unknown): SiteAnnouncement | null {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const message: Record<string, string> = {};
  const given = body?.['message'];
  for (const [language, text] of Object.entries(given && typeof given === 'object' && !Array.isArray(given) ? given : {})) {
    if (typeof text === 'string' && text.trim() !== '') {
      message[language] = text;
    }
  }
  if (!body || Object.keys(message).length === 0) {
    return null;
  }
  const level = body['level'];
  return { level: typeof level === 'string' && LEVELS.includes(level) ? (level as AnnouncementLevel) : 'info', message };
}

function pagesFrom(value: unknown): PublicPage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((row: unknown) => {
    const page = row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
    if (!page || typeof page['path'] !== 'string' || !page['path'].startsWith('/')) {
      return [];
    }
    // A visibility nothing understands is the strictest, never the most open - as the server reads it.
    const visibility = typeof page['visibility'] === 'string' && VISIBILITIES.includes(page['visibility']) ? (page['visibility'] as PageVisibility) : 'ADMIN';
    return [{ path: page['path'], visibility, blocked: page['blocked'] === true }];
  });
}

/**
 * The site settings as every page is told them (the PHP half's SiteSettings::publicBody(), GET /api/site-settings):
 * the announcement, and the pages Page access governs - read once at boot (load(), from an app initializer), and
 * again after an administrator saved them (refresh()).
 *
 * A read that fails - the API down, a table that waits for its update, a site that offers neither part - leaves no
 * announcement and every page anybody's: the server keeps the API paths of a hidden page refused on its own
 * (PageAccessGate), and a page that could not ask whether it is open is no reason to close it. Nothing here is a
 * security boundary; the server is.
 *
 * Getting in is here only as whether the site is closed for maintenance - for the notice an administrator reads above
 * each page: the gate and the closed sign are the site's status's (@anotoki/lib/migrations: SiteStatus, the gate, the
 * status page), never this.
 */
@Injectable({ providedIn: 'root' })
export class SiteSettings {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ANOTOKI_SITE_SETTINGS_CONFIG, { optional: true });
  private readonly body = signal<{ maintenance: boolean; announcement: SiteAnnouncement | null; pages: PublicPage[] } | null>(null);

  /** Whether the server answered once. */
  readonly loaded = computed(() => this.body() !== null);
  /** The bar across the top of every page, or null when there is nothing to say. */
  /** Whether the site is closed for maintenance, as the server said when it was asked: the administrators' notice. */
  readonly maintenance = computed(() => this.body()?.maintenance ?? false);
  readonly announcement = computed(() => this.body()?.announcement ?? null);
  /** Every governed page: a page with no row is anybody's. */
  readonly pages = computed(() => this.body()?.pages ?? []);
  /** The site's ADMIN, from the token: never refused a page, and told what the others are not shown. */
  readonly isAdmin = computed(() => this.roles().includes('ADMIN'));

  private readonly roles = computed(() => (this.config?.roles() ?? []).map((role) => String(role).toUpperCase()));

  /** Asks the server, once - an app initializer's: it never rejects. */
  load(): Promise<void> {
    return this.refresh();
  }

  /** Asks again (the admin page, after a save). Never rejects; a failure leaves what was there. */
  async refresh(): Promise<void> {
    try {
      const answer = await firstValueFrom(this.http.get<Record<string, unknown> | null>(this.config?.url ?? DEFAULT_SITE_SETTINGS_URL));
      this.body.set({ maintenance: answer?.['maintenance'] === true, announcement: announcementFrom(answer?.['announcement']), pages: pagesFrom(answer?.['pages']) });
    } catch {
      // Left as it was: nothing switched off, nothing to announce.
    }
  }

  /** The row governing a page, or null: a page no row governs is anybody's. */
  pageFor(path: string): PublicPage | null {
    return this.pages().find((page) => pageMatches(page.path, path)) ?? null;
  }

  /** Whether the reader is one of those a visibility lets in. */
  visibleTo(visibility: PageVisibility): boolean {
    const roles = this.roles();
    switch (visibility) {
      case 'PUBLIC':
        return true;
      case 'USER':
        return this.config?.signedIn() ?? false;
      case 'EDITOR':
        return roles.includes('EDITOR') || roles.includes('ADMIN');
      default:
        return roles.includes('ADMIN');
    }
  }

  /**
   * Whether the reader may have the page at this path: the site's ADMIN always - whoever switched a page off must be
   * able to look at it -, anybody else when no row governs it, or its row is not switched off and lets them in.
   */
  mayNavigate(path: string): boolean {
    if (this.isAdmin()) {
      return true;
    }
    const page = this.pageFor(path);
    return !page || (!page.blocked && this.visibleTo(page.visibility));
  }

  /**
   * What to tell an administrator about the page they are on, or null - only ever an administrator: anybody else is
   * not on such a page (the router never matched it for them). Switched off outranks shown to some alone.
   */
  noticeFor(path: string): PageNotice | null {
    if (!this.isAdmin()) {
      return null;
    }
    const page = this.pageFor(path);
    if (!page) {
      return null;
    }
    if (page.blocked) {
      return { kind: 'off' };
    }
    return page.visibility === 'PUBLIC' ? null : { kind: 'limited', visibility: page.visibility };
  }
}
