import { Injectable, Signal, computed, inject } from '@angular/core';
import { ANOTOKI_UI_CONFIG } from './config';
import { AnotokiWordKey, BUILT_IN_WORDS } from './words';

/** The parameters a word's {placeholders} are filled from. */
export type WordParams = Readonly<Record<string, string | number | null | undefined>>;

/** '{first}-{last}' with { first: 1, last: 50 } -> '1-50'. A placeholder with no value stays as it is. */
export function fillWords(text: string, params?: WordParams): string {
  if (!params) {
    return text;
  }
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? whole : String(value);
  });
}

/**
 * The kit's words in the page's language.
 *
 * For each key: the site's `lookup` (when it answers), then the site's `words`
 * for the language (or its primary subtag: sk-SK -> sk), then the built-in
 * words of the language, then the built-in English - so a page never shows a
 * key, with no strings loaded or no configuration at all.
 *
 * `t()` reads the configured language (and whatever `lookup` reads) as
 * signals: a template or a computed() that calls it follows a change of
 * language without being made again.
 */
@Injectable({ providedIn: 'root' })
export class AnotokiWords {
  private readonly config = inject(ANOTOKI_UI_CONFIG, { optional: true });

  /** The page's language, as the site says it ('en' when it does not). */
  readonly language: Signal<string> = computed(() => normalise(this.config?.language?.()));

  /**
   * The language the kit's words are in: the page's, when the kit or the site
   * has words for it (or the site's lookup answers for it); 'en' otherwise.
   */
  readonly lang: Signal<string> = computed(() => {
    const code = this.language();
    const primary = code.split('-')[0];
    const words = this.config?.words;
    const known = !!(BUILT_IN_WORDS[code] || BUILT_IN_WORDS[primary] || words?.[code] || words?.[primary] || this.config?.lookup);
    return known ? code : 'en';
  });

  /** The language of the kit's words where it is not the page's ('en' on a page in a language nobody wrote words for), for a `lang` attribute; null otherwise. */
  readonly foreignLang: Signal<string | null> = computed(() => (this.lang() === this.language() ? null : this.lang()));

  /** One word, its {placeholders} filled. */
  t(key: AnotokiWordKey, params?: WordParams): string {
    return fillWords(this.raw(key), params);
  }

  private raw(key: AnotokiWordKey): string {
    const looked = this.config?.lookup?.(key);
    if (typeof looked === 'string' && looked !== '') {
      return looked;
    }
    const code = this.language();
    const primary = code.split('-')[0];
    const words = this.config?.words;
    for (const table of [words?.[code], words?.[primary], BUILT_IN_WORDS[code], BUILT_IN_WORDS[primary]]) {
      const word = table?.[key];
      if (typeof word === 'string' && word !== '') {
        return word;
      }
    }
    return BUILT_IN_WORDS['en'][key];
  }
}

function normalise(language: string | null | undefined): string {
  const code = (language ?? '').trim().toLowerCase();
  return code === '' ? 'en' : code;
}
