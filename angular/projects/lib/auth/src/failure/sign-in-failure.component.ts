import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AnotokiAuth } from '../auth.service';
import { ANOTOKI_AUTH_BROWSER } from '../browser';
import { ANOTOKI_AUTH_CONFIG, DEFAULT_REDIRECT_PATH } from '../config';
import { noIndexWhileShown, shownFailure, signInText } from '../screen';
import { failureText } from '../words';

let nextId = 0;

/**
 * The screen of a sign-in that came back without one, could not start, or
 * cannot be set up at all - in the visitor's language, worded from the
 * failure's code alone (never the IAM's sentence): "Signing in did not work",
 * why, and Try again (the sign-in once more, back to where it started; a
 * sign-in that cannot be set up loads the page afresh) and Back (to the page
 * the sign-in started on, without signing in).
 *
 * The callback page shows it in its place (<anotoki-auth-callback>), and so
 * can any route of the site - in its frame, under its bar: the module's
 * `failureRoute`, where the guards then send the browser instead of the
 * callback route, or a route a site that lets visitors in sends a visitor to
 * when `signInFailure()` says a sign-in of theirs failed:
 *
 *   { path: 'sign-in-failed', component: SignInFailureComponent }      // provideAnotokiAuth: failureRoute: '/sign-in-failed'
 *
 * With nothing to say - opened by hand, or the failure put away - it goes on to
 * the home page. Search engines are asked not to index it while it shows.
 * Drawn as the family's status page is (a heading, a sentence, the kit's
 * buttons), whatever the site's own styles say.
 */
@Component({
  selector: 'anotoki-sign-in-failure',
  imports: [ButtonComponent],
  templateUrl: './sign-in-failure.component.html',
  styleUrl: './sign-in-failure.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-sign-in-failure' },
})
export class SignInFailureComponent implements OnInit {
  private readonly auth = inject(AnotokiAuth);
  private readonly config = inject(ANOTOKI_AUTH_CONFIG);
  private readonly router = inject(Router);
  private readonly browser = inject(ANOTOKI_AUTH_BROWSER);

  protected readonly id = `anotoki-sign-in-failure-${++nextId}`;
  protected readonly busy = signal(false);
  protected readonly text = signInText();
  /** What went wrong: a failure to say, or a sign-in that cannot be set up; null when there is nothing to say. */
  protected readonly failure = shownFailure(this.auth);
  protected readonly message = computed(() => {
    const failure = this.failure();
    return failure === null ? null : failureText(failure.code, this.text().words);
  });

  constructor() {
    noIndexWhileShown();
  }

  ngOnInit(): void {
    if (this.failure() === null && this.auth.state() !== 'starting') {
      // Opened by hand, or the failure was put away: there is nothing to say here.
      void this.router.navigateByUrl('/', { replaceUrl: true });
    }
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

  /** Back where the sign-in started - a path of this site, never the callback or this screen again - without signing in. */
  protected back(): void {
    const returnTo = this.failure()?.returnTo ?? '/';
    const path = returnTo.split(/[?#]/)[0];
    const here = [this.config.redirectPath ?? DEFAULT_REDIRECT_PATH, this.config.failureRoute ?? null];
    this.auth.dismissFailure();
    void this.router.navigateByUrl(returnTo.startsWith('/') && !returnTo.startsWith('//') && !here.includes(path) ? returnTo : '/', { replaceUrl: true });
  }
}
