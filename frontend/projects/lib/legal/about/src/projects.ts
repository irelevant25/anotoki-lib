/** One of the anotoki projects the About page lists. */
export interface AboutProject {
  /** Its words' names: `anotoki.about.<id>Name` (a link to its site) and `anotoki.about.<id>Text`. */
  readonly id: 'japanese' | 'piano' | 'genshin' | 'builder' | 'survey';
  /** Its site. */
  readonly url: string;
  /** The fan clause under it, smaller: a project about HoYoverse's games. */
  readonly fan: boolean;
}

/**
 * The anotoki projects, in the owner's order, each with its site's address. The addresses are the library's code,
 * never a string of a site's database: a rewording on a Translations page never moves a link.
 */
export const ANOTOKI_PROJECTS: readonly AboutProject[] = [
  { id: 'japanese', url: 'https://japanese.anotoki.eu', fan: false },
  { id: 'piano', url: 'https://piano.anotoki.eu', fan: false },
  { id: 'genshin', url: 'https://genshin.anotoki.eu', fan: true },
  { id: 'builder', url: 'https://builder.anotoki.eu', fan: true },
  { id: 'survey', url: 'https://survey.anotoki.eu', fan: false },
];

/**
 * The Japanese the name comes from, and how it is read - the same in every language, so the code's: the page draws
 * them in the places of `{word}` and `{reading}`, each in its own language (`ja`, and `ja-Latn` in italics).
 */
export const ANOTOKI_NAME_ORIGIN = { word: 'あの時', reading: 'ano toki' } as const;

/** A sentence's parts: its words, or the place of one of its placeholders. */
export type SentencePart = { readonly text: string; readonly name?: undefined } | { readonly name: string; readonly text?: undefined };

/**
 * A sentence cut at the placeholders named - each part drawn as text, or as what stands in its place (a word in
 * another language, a link): never as markup.
 */
export function sentenceParts(text: string, names: readonly string[]): SentencePart[] {
  const parts: SentencePart[] = [];
  const placeholder = new RegExp(`\\{(${names.join('|')})\\}`, 'g');
  let at = 0;
  for (const match of text.matchAll(placeholder)) {
    if (match.index > at) {
      parts.push({ text: text.slice(at, match.index) });
    }
    parts.push({ name: match[1] });
    at = match.index + match[0].length;
  }
  if (at < text.length) {
    parts.push({ text: text.slice(at) });
  }
  return parts;
}
