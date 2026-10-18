import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input, model } from '@angular/core';
import { AdminTools } from '@anotoki/lib/admin/parts';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { PasswordFieldComponent } from '@anotoki/lib/ui/forms';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { ProofKind } from '../models';

/** A refusal that asks for a newer sign-in: the sites' (a token's auth_time), the IAM's (its session's). */
export const SIGN_IN_AGAIN = ['reauth_required', 'reauthentication_required'];
/** A refusal of the password typed. */
export const WRONG_PASSWORD = ['wrong_password'];

/**
 * The proof a backup asks for before it is made, downloaded, deleted or
 * restored - as the site asks it (GET {backups}/proof): the person's password
 * (the IAM, where the account has one), or a sign-in of the last few minutes
 * (the sites, from the token): nothing to type until the server says the
 * sign-in is older - then "Sign in again", which goes through the IAM's
 * sign-in and back to this page, where the person does it once more. Nothing
 * carries over the trip: a restore that set itself off after a redirect would
 * be the accident all of this is here to stop.
 */
@Component({
  selector: 'anotoki-backup-proof',
  imports: [AlertComponent, ButtonComponent, IconComponent, PasswordFieldComponent],
  templateUrl: './proof.component.html',
  styleUrl: './proof.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-backup-proof' },
})
export class BackupProofComponent {
  private readonly tools = inject(AdminTools);

  readonly kind = input<ProofKind | null>(null);
  /** The server said the sign-in is too old. */
  readonly signInNeeded = input(false, { transform: booleanAttribute });
  readonly password = model('');
  /** Why the password was refused. */
  readonly error = input<string | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });

  protected readonly canSignIn = typeof this.tools.config?.signInAgain === 'function';

  protected signIn(): void {
    this.tools.config?.signInAgain?.();
  }
}
