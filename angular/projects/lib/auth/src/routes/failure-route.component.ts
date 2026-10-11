import { ChangeDetectionStrategy, Component, ViewContainerRef, viewChild } from '@angular/core';
import { loadScreen } from './load-screen';

/**
 * The screen of a sign-in that failed, as a route of the site's own names it from @anotoki/lib/auth - `component:
 * SignInFailureComponent` (the module's `failureRoute`): it loads the screen itself (@anotoki/lib/auth/screens)
 * as it is shown, so the screen's code is never in the first load. A route may load the screen directly as well:
 * `loadComponent: () => import('@anotoki/lib/auth/screens').then((m) => m.SignInFailureComponent)`.
 */
@Component({
  selector: 'anotoki-sign-in-failure-route',
  templateUrl: './failure-route.component.html',
  styleUrl: './failure-route.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInFailureComponent {
  private readonly slot = viewChild.required('screen', { read: ViewContainerRef });

  constructor() {
    loadScreen(
      () => this.slot(),
      (screens) => screens.SignInFailureComponent,
    );
  }
}
