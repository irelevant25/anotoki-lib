import { FEEDBACK_LIBRARY_WORDS } from '@anotoki/lib/words/feedback';
import { BUILT_IN_FEEDBACK_WORDS, FEEDBACK_WORD_NAMES, feedbackKey, feedbackWords } from './words';

describe("feedbackWords(): the form's words in the page's language", () => {
  it("reads the library's own words, every name of them, in English and informal Slovak", () => {
    expect(FEEDBACK_WORD_NAMES.map(feedbackKey)).toEqual(Object.keys(FEEDBACK_LIBRARY_WORDS.en));
    expect(BUILT_IN_FEEDBACK_WORDS.en.title).toBe('Send feedback');
    expect(BUILT_IN_FEEDBACK_WORDS.sk.title).toBe('Pošli nám spätnú väzbu');
    expect(BUILT_IN_FEEDBACK_WORDS.sk.tooLong).toContain('{max}');
  });

  it('takes the language, its base, or English - and says which it is in', () => {
    expect(feedbackWords('sk')).toEqual({ lang: 'sk', words: BUILT_IN_FEEDBACK_WORDS.sk });
    expect(feedbackWords('SK-sk').words.send).toBe('Poslať');
    expect(feedbackWords('de')).toEqual({ lang: 'en', words: BUILT_IN_FEEDBACK_WORDS.en });
    expect(feedbackWords(null).lang).toBe('en');
  });

  it("puts the site's words over the built-in ones, and its database's over both", () => {
    const de = feedbackWords('de', { de: { title: 'Rückmeldung', send: '' } });
    expect([de.lang, de.words.title, de.words.send]).toEqual(['de', 'Rückmeldung', 'Send']);

    const translated = feedbackWords('sk', { sk: { title: 'Napíš nám' } }, (key) => (key === 'anotoki.feedback.title' ? 'Kontakt' : key === 'anotoki.feedback.send' ? key : null));
    expect([translated.words.title, translated.words.send]).toEqual(['Kontakt', 'Poslať']);

    const czech = feedbackWords('cs', undefined, (key) => (key === 'anotoki.feedback.title' ? 'Napište nám' : null));
    expect([czech.lang, czech.words.title, czech.words.lead]).toEqual(['cs', 'Napište nám', BUILT_IN_FEEDBACK_WORDS.en.lead]);
  });
});
