import { ChangeDetectionStrategy, Component, DOCUMENT, EnvironmentInjector, OnDestroy, OnInit, computed, inject, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AnotokiAuth } from '../auth.service';
import { ANOTOKI_AUTH_BROWSER } from '../browser';
import { ANOTOKI_AUTH_CONFIG } from '../config';
import { failureText, signInWords } from '../words';

/**
 * The callback route's page (/auth/callback) - the one thing of signing in a
 * visitor may see on the site itself:
 *
 * - "Signing you in…", and on to the home page: init() finishes a callback
 *   before the router starts, so the route is reached only when it is opened
 *   by hand;
 * - or why a sign-in came back without one, or could not start, or cannot be
 *   set up at all (personGuard sends the browser here then) - worded from the
 *   code alone - with Try again and Back.
 *
 * The page asks search engines not to index it (noindex); a site keeps
 * crawlers off /auth/ in its robots.txt too. Drawn with the kit's buttons, in
 * the status page's frame; its words are the library's `anotoki.signIn.*`.
 */
@Component({
  selector: 'anotoki-auth-callback',
  imports: [ButtonComponent],
  templateUrl: './auth-callback.component.html',
  styleUrl: './auth-callback.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AnotokiAuth);
  private readonly config = inject(ANOTOKI_AUTH_CONFIG);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly browser = inject(ANOTOKI_AUTH_BROWSER);
  /** The robots tag while this page shows, and what it said before (null: the page added it). */
  private robots: { tag: HTMLMetaElement; before: string | null } | null = null;
  private readonly injector = inject(EnvironmentInjector);

  protected readonly busy = signal(false);

  protected readonly text = computed(() => {
    const language = this.config.language ? runInInjectionContext(this.injector, this.config.language) : 'en';
    return signInWords(language, this.config.words, this.config.translate ? (key) => runInInjectionContext(this.injector, () => this.config.translate?.(key)) : undefined);
  });

  /** What went wrong: a failure to say, or a sign-in that cannot be set up; null while signing in. */
  protected readonly failure = computed(() => (this.auth.state() === 'unavailable' ? { code: 'unavailable', returnTo: null } : this.auth.signInFailure()));
  protected readonly message = computed(() => {
    const failure = this.failure();
    return failure === null ? null : failureText(failure.code, this.text().words);
  });

  ngOnInit(): void {
    const tag = this.document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (tag) {
      this.robots = { tag, before: tag.content };
      tag.content = 'noindex';
    } else {
      const added = this.document.createElement('meta');
      added.name = 'robots';
      added.content = 'noindex';
      this.document.head.appendChild(added);
      this.robots = { tag: added, before: null };
    }
    if (this.failure() === null && this.auth.state() !== 'starting') {
      // Opened by hand: there is nothing to finish here.
      void this.router.navigateByUrl('/', { replaceUrl: true });
    }
  }

  ngOnDestroy(): void {
    if (this.robots?.before === null) {
      this.robots.tag.remove();
    } else if (this.robots) {
      this.robots.tag.content = this.robots.before;
    }
    this.robots = null;
  }

  protected async retry(): Promise<void> {
    if (this.auth.state() === 'unavailable') {
      this.browser.reload();
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.signIn({ returnTo: this.failure()?.returnTo ?? '/' });
    } finally {
      this.busy.set(false);
    }
  }

  protected back(): void {
    const returnTo = this.failure()?.returnTo ?? '/';
    this.auth.dismissFailure();
    void this.router.navigateByUrl(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/', { replaceUrl: true });
  }
}
