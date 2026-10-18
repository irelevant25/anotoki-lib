import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationParams } from './language';
import { TranslationService } from './translation.service';

/**
 * `{{ 'nav.home' | translate }}`, and with its placeholders filled:
 * `{{ 'signIn.failed' | translate: { code: c } }}`.
 *
 * Impure on purpose: the argument is a constant key, and a pure pipe would
 * keep its first answer when the language changes. The signals t() reads mark
 * the page for another look; being impure lets the pipe answer again then. The
 * cost is one map lookup per binding per change detection.
 *
 * The key is a string. A site with typed keys (a compiled English) declares
 * its own two-line pipe over TranslationService with its key type - the IAM's
 * `t` - and imports that one instead.
 */
@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(TranslationService);

  transform(key: string, params?: TranslationParams): string {
    return this.i18n.t(key, params);
  }
}
