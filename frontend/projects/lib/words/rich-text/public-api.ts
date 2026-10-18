/*
 * @anotoki/lib/words/rich-text - the anotoki library's own words of `anotoki.richText.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's rich-text toolbar
 * (@anotoki/lib/ui/rich-text), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the toolbar alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.richText.toolbar': 'Formatting',
  'anotoki.richText.bold': 'Bold',
  'anotoki.richText.italic': 'Italic',
  'anotoki.richText.underline': 'Underline',
  'anotoki.richText.strike': 'Strikethrough',
  'anotoki.richText.bulletList': 'Bulleted list',
  'anotoki.richText.orderedList': 'Numbered list',
  'anotoki.richText.indent': 'Indent more',
  'anotoki.richText.outdent': 'Indent less',
  'anotoki.richText.link': 'Link',
  'anotoki.richText.clear': 'Clear formatting',
  'anotoki.richText.undo': 'Undo',
  'anotoki.richText.redo': 'Redo',
} as const;

/** A key of these words. */
export type RichTextLibraryKey = keyof typeof EN;

const SK: Readonly<Record<RichTextLibraryKey, string>> = {
  'anotoki.richText.toolbar': 'Formátovanie',
  'anotoki.richText.bold': 'Tučné',
  'anotoki.richText.italic': 'Kurzíva',
  'anotoki.richText.underline': 'Podčiarknuté',
  'anotoki.richText.strike': 'Prečiarknuté',
  'anotoki.richText.bulletList': 'Odrážky',
  'anotoki.richText.orderedList': 'Číslovaný zoznam',
  'anotoki.richText.indent': 'Zväčšiť odsadenie',
  'anotoki.richText.outdent': 'Zmenšiť odsadenie',
  'anotoki.richText.link': 'Odkaz',
  'anotoki.richText.clear': 'Zrušiť formátovanie',
  'anotoki.richText.undo': 'Späť',
  'anotoki.richText.redo': 'Znova',
};

/** These words, per language: English and Slovak, each with every key. */
export const RICH_TEXT_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<RichTextLibraryKey, string>>>> = { en: EN, sk: SK };
