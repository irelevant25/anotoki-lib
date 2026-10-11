import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AnotokiAuth } from '../auth.service';
import { SignInFailureComponent } from '../failure/sign-in-failure.component';
import { noIndexWhileShown, shownFailure, signInText } from '../screen';

/**
 * The callback route's page (/auth/callback) - the one thing of signing in a
 * visitor may see on the site itself:
 *
 * - "Signing you in…", and on to the home page: init() finishes a callback
 *   before the router starts, so the route is reached only when it is opened
 *   by hand;
 * - or the failure's screen (<anotoki-sign-in-failure>) - why a sign-in came
 *   back without one, or could not start, or cannot be set up at all
 *   (personGuard sends the browser here then, unless the module's
 *   `failureRoute` names a route of the site's own) - worded from the code
 *   alone, with Try again and Back.
 *
 * The page asks search engines not to index it (noindex); a site keeps
 * crawlers off /auth/ in its robots.txt too. Drawn in the status page's frame;
 * its words are the library's `anotoki.signIn.*`.
 */
@Component({
  selector: 'anotoki-auth-callback',
  imports: [SignInFailureComponent],
  templateUrl: './auth-callback.component.html',
  styleUrl: './auth-callback.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-auth-callback', '[class.anotoki-auth-callback--failed]': 'failed()' },
})
export class AuthCallbackComponent implements OnInit {
  private readonly auth = inject(AnotokiAuth);
  private readonly router = inject(Router);

  protected readonly text = signInText();
  private readonly failure = shownFailure(this.auth);
  /** A failure to show, or a sign-in that cannot be set up: the failure's screen in this page's place. */
  protected readonly failed = computed(() => this.failure() !== null);

  constructor() {
    noIndexWhileShown();
  }

  ngOnInit(): void {
    if (this.failure() === null && this.auth.state() !== 'starting') {
      // Opened by hand: there is nothing to finish here.
      void this.router.navigateByUrl('/', { replaceUrl: true });
    }
  }
}
