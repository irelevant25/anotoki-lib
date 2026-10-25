/*
 * @anotoki/lib/words/html-editor - the anotoki library's own words of `anotoki.htmlEditor.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the kit's HTML editor
 * (@anotoki/lib/ui/html-editor), which reads them itself, never registered - never by the kit's core nor by the
 * translations module, so they reach a site with the editor alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.htmlEditor.toolbar': '{field}: formatting',
  'anotoki.htmlEditor.heading': 'Heading {level}',
  'anotoki.htmlEditor.highlight': 'Highlight',
  'anotoki.htmlEditor.size': 'Text size',
  'anotoki.htmlEditor.sizeChosen': 'Text size: {size}',
  'anotoki.htmlEditor.size1': 'Very small',
  'anotoki.htmlEditor.size2': 'Small',
  'anotoki.htmlEditor.size3': 'Normal',
  'anotoki.htmlEditor.size4': 'Large',
  'anotoki.htmlEditor.size5': 'Very large',
  'anotoki.htmlEditor.size6': 'Huge',
  'anotoki.htmlEditor.size7': 'Largest',
  'anotoki.htmlEditor.font': 'Font',
  'anotoki.htmlEditor.fontChosen': 'Font: {font}',
  'anotoki.htmlEditor.textColor': 'Text colour',
  'anotoki.htmlEditor.highlightColor': 'Highlight colour',
  'anotoki.htmlEditor.apply': 'Apply',
  'anotoki.htmlEditor.noColor': 'No colour',
  'anotoki.htmlEditor.source': 'HTML source',
  'anotoki.htmlEditor.sourceField': '{field}: HTML source',
  'anotoki.htmlEditor.preview': 'Preview',
  'anotoki.htmlEditor.linkAdd': 'Add a link',
  'anotoki.htmlEditor.linkChange': 'Change the link',
  'anotoki.htmlEditor.linkAddress': 'Address',
  'anotoki.htmlEditor.linkHint': 'A web address (https://…) or a mail address (mailto:…).',
  'anotoki.htmlEditor.linkInvalid': 'That cannot be a link: write a web address (https://…) or a mail address (mailto:…).',
  'anotoki.htmlEditor.linkSubmit': 'Add the link',
  'anotoki.htmlEditor.linkRemove': 'Remove the link',
} as const;

/** A key of these words. */
export type HtmlEditorLibraryKey = keyof typeof EN;

const SK: Readonly<Record<HtmlEditorLibraryKey, string>> = {
  'anotoki.htmlEditor.toolbar': '{field}: formátovanie',
  'anotoki.htmlEditor.heading': 'Nadpis {level}',
  'anotoki.htmlEditor.highlight': 'Zvýraznenie',
  'anotoki.htmlEditor.size': 'Veľkosť písma',
  'anotoki.htmlEditor.sizeChosen': 'Veľkosť písma: {size}',
  'anotoki.htmlEditor.size1': 'Veľmi malé',
  'anotoki.htmlEditor.size2': 'Malé',
  'anotoki.htmlEditor.size3': 'Normálne',
  'anotoki.htmlEditor.size4': 'Veľké',
  'anotoki.htmlEditor.size5': 'Veľmi veľké',
  'anotoki.htmlEditor.size6': 'Obrovské',
  'anotoki.htmlEditor.size7': 'Najväčšie',
  'anotoki.htmlEditor.font': 'Písmo',
  'anotoki.htmlEditor.fontChosen': 'Písmo: {font}',
  'anotoki.htmlEditor.textColor': 'Farba textu',
  'anotoki.htmlEditor.highlightColor': 'Farba zvýraznenia',
  'anotoki.htmlEditor.apply': 'Použiť',
  'anotoki.htmlEditor.noColor': 'Bez farby',
  'anotoki.htmlEditor.source': 'Zdrojový kód HTML',
  'anotoki.htmlEditor.sourceField': '{field}: zdrojový kód HTML',
  'anotoki.htmlEditor.preview': 'Ukážka',
  'anotoki.htmlEditor.linkAdd': 'Pridať odkaz',
  'anotoki.htmlEditor.linkChange': 'Zmeniť odkaz',
  'anotoki.htmlEditor.linkAddress': 'Adresa',
  'anotoki.htmlEditor.linkHint': 'Webová adresa (https://…) alebo e-mailová adresa (mailto:…).',
  'anotoki.htmlEditor.linkInvalid': 'Toto nemôže byť odkaz: treba zadať webovú adresu (https://…) alebo e-mailovú adresu (mailto:…).',
  'anotoki.htmlEditor.linkSubmit': 'Pridať odkaz',
  'anotoki.htmlEditor.linkRemove': 'Odstrániť odkaz',
};

/** These words, per language: English and Slovak, each with every key. */
export const HTML_EDITOR_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<HtmlEditorLibraryKey, string>>>> = { en: EN, sk: SK };
