import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationParams } from './language';
import { TranslationService } from './translation.service';

/**
 * `{{ 'reviews.due' | translatePlural: n }}`: the form of a plural family
 * (`.one`, `.few`, `.other`) the number asks for in the language on the page,
 * with the number - written as the language writes numbers - as `{count}`. A
 * second argument carries more placeholders.
 *
 * Impure for the reason the translate pipe is: the language changes under a
 * constant key.
 */
@Pipe({ name: 'translatePlural', pure: false })
export class TranslatePluralPipe implements PipeTransform {
  private readonly i18n = inject(TranslationService);

  transform(key: string, count: number, params?: TranslationParams): string {
    return this.i18n.plural(key, count, params);
  }
}
