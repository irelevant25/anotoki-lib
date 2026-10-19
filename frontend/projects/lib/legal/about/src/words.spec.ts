import { ABOUT_LIBRARY_WORDS } from '@anotoki/lib/words/about';
import { ANOTOKI_PROJECTS, sentenceParts } from './projects';
import { BUILT_IN_ABOUT_WORDS, aboutKey, aboutWordNames, aboutWords } from './words';

describe("aboutWords(): the About page's words in the page's language", () => {
  it("are the library's own words, every name of them, in English and Slovak", () => {
    expect(aboutWordNames().map(aboutKey)).toEqual(Object.keys(ABOUT_LIBRARY_WORDS.en));
    expect(BUILT_IN_ABOUT_WORDS.en.title).toBe('About anotoki');
    expect(BUILT_IN_ABOUT_WORDS.sk.title).toBe('O projekte anotoki');
    // Every project's name and text, by the project's id.
    for (const project of ANOTOKI_PROJECTS) {
      expect(aboutWordNames()).toContain(`${project.id}Name`);
      expect(aboutWordNames()).toContain(`${project.id}Text`);
    }
  });

  it('address nobody in Slovak - no "ty", no "Vy" - the owner speaking of himself', () => {
    const secondPerson = /^(ty|tvoj\w*|teba|tebe|tebou|vy|váš|vaš\w*|vám|vás|vami)$/;
    // A verb of the second person (môžeš, napíšte, máte).
    const verb = /(íš|eš|áš|íte|ete|áte)$/;
    for (const name of aboutWordNames()) {
      const text = BUILT_IN_ABOUT_WORDS.sk[name].replace(/\{[A-Za-z]+\}/g, ' ').toLowerCase();
      for (const word of text.match(/\p{L}+/gu) ?? []) {
        expect(secondPerson.test(word) || verb.test(word), `${name}: "${word}"`).toBe(false);
      }
    }
  });

  it("hold no address: every link is the code's (the projects' sites, the Support page's path)", () => {
    for (const language of ['en', 'sk'] as const) {
      for (const name of aboutWordNames()) {
        expect(BUILT_IN_ABOUT_WORDS[language][name], `${language} ${name}`).not.toMatch(/https?:|anotoki\.eu|\/about|\/support/);
      }
    }
    expect(ANOTOKI_PROJECTS.map((project) => project.url)).toEqual([
      'https://japanese.anotoki.eu',
      'https://piano.anotoki.eu',
      'https://genshin.anotoki.eu',
      'https://builder.anotoki.eu',
      'https://survey.anotoki.eu',
    ]);
  });

  it("takes the language, its base, or English - and an owner's rewording over the built-in words, never a key", () => {
    expect(aboutWords('sk')).toEqual({ lang: 'sk', words: BUILT_IN_ABOUT_WORDS.sk });
    expect(aboutWords('SK-sk').words.projectsTitle).toBe('Projekty');
    expect(aboutWords('de')).toEqual({ lang: 'en', words: BUILT_IN_ABOUT_WORDS.en });
    const reworded = aboutWords('sk', (key) => (key === 'anotoki.about.title' ? 'O nás' : key === 'anotoki.about.nameTitle' ? key : null));
    expect([reworded.lang, reworded.words.title, reworded.words.nameTitle]).toEqual(['sk', 'O nás', 'Názov']);
    const czech = aboutWords('cs', (key) => (key === 'anotoki.about.title' ? 'O projektu anotoki' : null));
    expect([czech.lang, czech.words.title, czech.words.nameTitle]).toEqual(['cs', 'O projektu anotoki', 'The name']);
  });

  it('cuts a sentence at the placeholders named - text, never markup', () => {
    expect(sentenceParts('a {word} ({reading}): b', ['word', 'reading'])).toEqual([{ text: 'a ' }, { name: 'word' }, { text: ' (' }, { name: 'reading' }, { text: '): b' }]);
    expect(sentenceParts('{support}.', ['support'])).toEqual([{ name: 'support' }, { text: '.' }]);
    expect(sentenceParts('no place {other}', ['support'])).toEqual([{ text: 'no place {other}' }]);
    expect(sentenceParts('<b>bold</b>', ['word'])).toEqual([{ text: '<b>bold</b>' }]);
  });
});
