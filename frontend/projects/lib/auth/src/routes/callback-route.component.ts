import { ChangeDetectionStrategy, Component, ViewContainerRef, viewChild } from '@angular/core';
import { loadScreen } from './load-screen';

/**
 * The callback page (/auth/callback) as a route names it from @anotoki/lib/auth - `component:
 * AuthCallbackComponent`: it loads the page itself (@anotoki/lib/auth/screens) as it is shown, so the page's
 * code is never in the first load. A route may load the page directly as well:
 * `loadComponent: () => import('@anotoki/lib/auth/screens').then((m) => m.AuthCallbackComponent)`.
 */
@Component({
  selector: 'anotoki-auth-callback-route',
  templateUrl: './callback-route.component.html',
  styleUrl: './callback-route.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackComponent {
  private readonly slot = viewChild.required('screen', { read: ViewContainerRef });

  constructor() {
    loadScreen(
      () => this.slot(),
      (screens) => screens.AuthCallbackComponent,
    );
  }
}
