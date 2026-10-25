import { LEGAL_LIBRARY_WORDS } from '@anotoki/lib/words/legal';
import { BUILT_IN_LEGAL_WORDS, LEGAL_TEXTS_UPDATED, legalKey, legalWordNames, legalWords } from './words';

describe("legalWords(): the legal pages' words in the page's language", () => {
  it("are the library's own words, every name of them, in English and Slovak", () => {
    expect(legalWordNames().map(legalKey)).toEqual(Object.keys(LEGAL_LIBRARY_WORDS.en));
    // 118 of 0.6.0, and 0.11.0's storage line for the announcement bar's mark.
    expect(legalWordNames()).toHaveLength(119);
    expect(BUILT_IN_LEGAL_WORDS.en.privacyTitle).toBe('Privacy policy');
    expect(BUILT_IN_LEGAL_WORDS.sk.privacyTitle).toBe('Ochrana osobných údajov');
    expect(BUILT_IN_LEGAL_WORDS.sk.backupsKept).toContain('{beforeRestore}');
    expect(LEGAL_TEXTS_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("say the owner's decisions: under 16 with permission, Code Hero's Slovakia, the fan clause, the answer within days", () => {
    expect(BUILT_IN_LEGAL_WORDS.en.termsAgeText).toBe("Someone under 16 needs a parent's or guardian's permission to make an anotoki account.");
    expect(BUILT_IN_LEGAL_WORDS.en.termsLawText).toContain('Slovak Republic');
    expect(BUILT_IN_LEGAL_WORDS.en.fanHoyoverse).toBe(
      'This site is a fan-made project and is not affiliated with or endorsed by HoYoverse. Genshin Impact and its names, images and content belong to their respective owners.',
    );
    expect(BUILT_IN_LEGAL_WORDS.en.contactResponseText).toBe('We aim to reply within a few days.');
    expect(BUILT_IN_LEGAL_WORDS.en.contactLead).toBe('Every message is read.');
    expect(BUILT_IN_LEGAL_WORDS.sk.authority).toBe('Úrad na ochranu osobných údajov Slovenskej republiky');
  });

  it('address nobody in Slovak - no "ty", no "Vy" - so that they fit the informal sites and the formal survey', () => {
    const secondPerson = /^(ty|tvoj\w*|teba|tebe|tebou|vy|váš|vaš\w*|vám|vás|vami)$/;
    // A verb of the second person (môžeš, napíšte, máte) - not a noun in the locative (v štáte, vo formáte).
    const verb = /(íš|eš|áš|íte|ete|áte)$/;
    for (const name of legalWordNames()) {
      const text = BUILT_IN_LEGAL_WORDS.sk[name].replace(/\{[A-Za-z]+\}/g, ' ').toLowerCase();
      for (const word of text.match(/\p{L}+/gu) ?? []) {
        expect(secondPerson.test(word) || (verb.test(word) && !['štáte', 'formáte'].includes(word)), `${name}: "${word}"`).toBe(false);
      }
    }
  });

  it('takes the language, its base, or English - and says which it is in', () => {
    expect(legalWords('sk')).toEqual({ lang: 'sk', words: BUILT_IN_LEGAL_WORDS.sk });
    expect(legalWords('SK-sk').words.contactTitle).toBe('Kontakt');
    expect(legalWords('de')).toEqual({ lang: 'en', words: BUILT_IN_LEGAL_WORDS.en });
    expect(legalWords(null).lang).toBe('en');
  });

  it("puts the site's database's words (an owner's rewording) over the built-in ones - never a key", () => {
    const reworded = legalWords('sk', (key) => (key === 'anotoki.legal.contactLead' ? 'Každú správu si prečítame.' : key === 'anotoki.legal.contactTitle' ? key : null));
    expect([reworded.lang, reworded.words.contactLead, reworded.words.contactTitle]).toEqual(['sk', 'Každú správu si prečítame.', 'Kontakt']);

    const czech = legalWords('cs', (key) => (key === 'anotoki.legal.contactTitle' ? 'Kontakt' : null));
    expect([czech.lang, czech.words.contactTitle, czech.words.contactLead]).toEqual(['cs', 'Kontakt', 'Every message is read.']);
  });
});
