import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { pieceWords } from '@anotoki/lib/ui/piece-words';
import { MAINTENANCE_LIBRARY_WORDS } from '@anotoki/lib/words/maintenance';
import { filter, map } from 'rxjs';

let nextId = 0;

/** Whether the router URL `url` is `route` or below it ('/staff', '/staff/x'; never '/staffing'). */
function isOn(url: string, route: string): boolean {
  const path = url.split(/[?#]/)[0];
  const base = route.length > 1 ? route.replace(/\/+$/, '') : route;
  return path === base || path.startsWith(`${base}/`);
}

/**
 * The closed sign: what everybody but the site's ADMIN reads while its administrators have closed it for maintenance
 * (the site settings' "Getting in") - the page of its own the status page draws (<anotoki-site-status>, which loads it
 * and hands it what it says), no header and no footer:
 *
 * - "Back shortly" and what the administrators wrote - in the page's language (or its primary subtag), else in
 *   English, marked so, else the built-in sentence: never blank. Their line breaks are theirs.
 * - At the staff route alone (`staffRoute`, '/staff'), for somebody not signed in: a line and Sign in - back to the
 *   home page afterwards, where an administrator sees the site as it is. Never on the page the public lands on: a
 *   closed site shows no door it will not open, and its administrators always have one.
 *
 * The status page around it asks the server again every so often and reloads once the site is open. Its words are the
 * library's (`anotoki.maintenance.*`), read by the sign itself - the site's string first.
 */
@Component({
  selector: 'anotoki-maintenance-page',
  imports: [ButtonComponent],
  templateUrl: './maintenance-page.component.html',
  styleUrl: './maintenance-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-maintenance-page' },
})
export class MaintenancePageComponent {
  private readonly router = inject(Router);
  protected readonly word = pieceWords(MAINTENANCE_LIBRARY_WORDS);

  /** What the administrators wrote, per language ({} for nothing). */
  readonly message = input<Readonly<Record<string, string>>>({});
  /** The page's language. */
  readonly language = input('en');
  readonly signedIn = input(false);
  /** Where the administrators sign in while the site is closed. */
  readonly staffRoute = input('/staff');
  /** Starts the site's sign-in, returning to `returnTo`. */
  readonly signIn = input<(returnTo?: string) => unknown>(() => undefined);

  protected readonly id = `anotoki-maintenance-page-${++nextId}`;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** What the administrators wrote: in the page's language (or its primary subtag), else in English - and its language where it is not the page's; null for nothing. */
  protected readonly notice = computed(() => {
    const message = this.message();
    const language = (this.language() || 'en').trim().toLowerCase();
    for (const code of [language, language.split('-')[0], 'en']) {
      const text = message[code]?.trim();
      if (text) {
        return { text, lang: code === language ? null : code };
      }
    }
    return null;
  });

  /** At the staff route, for somebody not signed in: the administrators' way in while the site is closed. */
  protected readonly door = computed(() => !this.signedIn() && isOn(this.url(), this.staffRoute()));

  /** Back to the home page afterwards: signed in, an administrator sees the site as it is. */
  protected start(): void {
    this.signIn()('/');
  }
}
