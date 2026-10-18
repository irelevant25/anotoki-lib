import { inject } from '@angular/core';
import { ANOTOKI_UI_CONFIG, AnotokiWordKey, AnotokiWords, WordParams, fillWords } from '@anotoki/lib/ui/config';

/** A piece's own words, as its @anotoki/lib/words/<namespace> holds them: English and Slovak, by library key. */
export type PieceWordTable<Key extends string> = Readonly<Record<'en' | 'sk', Readonly<Record<Key, string>>>>;

/** One of them, read: its words, and their language where it is not the page's (for a `lang` attribute), else null. */
export interface PieceWord {
  readonly text: string;
  readonly lang: string | null;
}

const PREFIX = 'anotoki.';

/**
 * The words of a kit piece that has words of its own - a remove button's name, a progress bar's "3 of 10" - read the
 * way the kit reads its own (AnotokiWords): the site's string for the library key first (provideAnotokiUi's `lookup`:
 * with the translations module, the database's string - an owner's rewording - or the site's own words), then the
 * site's `words` for the page's language, then the piece's built-in words of that language (or its primary subtag:
 * sk-SK -> sk), then their English - never a key.
 *
 * Such a piece is an entry point of its own and reads its words itself, never registering them: it has no provide*()
 * function, and provideAnotokiUi's is in every first load - a registration would bring every piece's words there.
 *
 * Call it in an injection context (a field of the component); what it returns reads signals - the page's language,
 * the strings `lookup` reads - so a template or a computed() that calls it follows a change of language.
 */
export function pieceWords<Key extends string>(table: PieceWordTable<Key>): (key: Key, params?: WordParams) => PieceWord {
  const config = inject(ANOTOKI_UI_CONFIG, { optional: true });
  const kit = inject(AnotokiWords);
  return (key, params) => {
    const word = key.slice(PREFIX.length);
    const language = kit.language();
    const primary = language.split('-')[0];
    const own = config?.words as Readonly<Record<string, Readonly<Record<string, string>> | undefined>> | undefined;
    const builtIn = table as Readonly<Record<string, Readonly<Record<string, string>> | undefined>>;
    for (const found of [config?.lookup?.(word as AnotokiWordKey), own?.[language]?.[word], own?.[primary]?.[word], builtIn[language]?.[key], builtIn[primary]?.[key]]) {
      if (typeof found === 'string' && found !== '') {
        return { text: fillWords(found, params), lang: null };
      }
    }
    return { text: fillWords(table.en[key], params), lang: primary === 'en' ? null : 'en' };
  };
}
