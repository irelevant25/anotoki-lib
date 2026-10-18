/*
 * @anotoki/lib/words/footer - the anotoki library's own words of `anotoki.footer.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the family's footer (@anotoki/lib/footer),
 * which reads them itself, never registered - it has no provide*() of its own - never by the kit's core nor by the
 * translations module, so they reach a site with the footer alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.footer.version': 'Version {version}',
  'anotoki.footer.whatsNew': 'What\'s new',
  'anotoki.footer.feedback': 'Feedback',
  'anotoki.footer.fanHoyoverse': 'This site is a fan-made project and is not affiliated with or endorsed by HoYoverse.',
} as const;

/** A key of these words. */
export type FooterLibraryKey = keyof typeof EN;

const SK: Readonly<Record<FooterLibraryKey, string>> = {
  'anotoki.footer.version': 'Verzia {version}',
  'anotoki.footer.whatsNew': 'Čo je nové',
  'anotoki.footer.feedback': 'Spätná väzba',
  'anotoki.footer.fanHoyoverse': 'Táto stránka je fanúšikovský projekt a nie je prepojená so spoločnosťou HoYoverse ani ňou schválená.',
};

/** These words, per language: English and Slovak, each with every key. */
export const FOOTER_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<FooterLibraryKey, string>>>> = { en: EN, sk: SK };
