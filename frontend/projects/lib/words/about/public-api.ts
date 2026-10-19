/*
 * @anotoki/lib/words/about - the anotoki library's own words of `anotoki.about.*`, in English and in
 * Slovak (impersonal: no "ty", no "Vy" - it fits every site). Imported by the About page (@anotoki/lib/legal/about),
 * which reads them itself, never registered - never by the kit nor by the translations module, so they reach a site
 * with that page alone.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then `bun run words`.
 */

const EN = {
  'anotoki.about.title': 'About anotoki',
  'anotoki.about.nameTitle': 'The name',
  'anotoki.about.nameText': 'anotoki comes from the Japanese {word} ({reading}): "back then" – that time you look back on with a smile. I chose it for the nostalgic feeling I wanted the Genshin Impact project to carry, and the name stayed with everything that grew from it: the Build Analyzer, Japanese Academy and Piano Academy.',
  'anotoki.about.authorTitle': 'Made by one person',
  'anotoki.about.authorText': 'Every anotoki project is designed, built and run by me alone. I worked on the Genshin Impact project for almost two years and expected another year before it was done. Once Claude Code became part of the development, it was finished in a couple of months – and the other projects followed.',
  'anotoki.about.projectsTitle': 'The projects',
  'anotoki.about.japaneseName': 'Japanese Academy',
  'anotoki.about.japaneseText': 'I wanted the daily habit of Duolingo and the careful kanji teaching of WaniKani in one place, but aimed at the JLPT exams. Kanji and vocabulary come in lessons, return in reviews just before you would forget them, and can be practised without limits; an exam of more than 11,000 questions, with listening, shows how much has stuck.',
  'anotoki.about.pianoName': 'Piano Academy',
  'anotoki.about.pianoText': 'Something made for the piano itself: a simple learning path from the very first notes, in the browser with nothing to install. Plug a digital piano or MIDI keyboard into the computer, and the page shows the music, listens to what you play and keeps your progress.',
  'anotoki.about.genshinName': 'Genshin Impact',
  'anotoki.about.genshinText': 'Simple databases of characters, weapons, materials and banners with filters that are easy to use, plus a daily quiz, more quizzes and small games – without the wall of ads that crowds most fan sites.',
  'anotoki.about.builderName': 'Build Analyzer',
  'anotoki.about.builderText': 'I wanted to import my own characters\' current builds automatically instead of typing them in, and then see where to go next: suggestions drawn from community builds and clear target stats for every character, for Genshin Impact and Honkai: Star Rail.',
  'anotoki.about.surveyName': 'Surveys',
  'anotoki.about.surveyText': 'A place to ask the people who use these projects what they think, in one coordinated way – like the surveys games run at the end of a patch – so that what comes next is shaped by real feedback.',
  'anotoki.about.fanLine': 'A fan-made project, not affiliated with or endorsed by HoYoverse.',
  'anotoki.about.closing': 'anotoki is free to use. If it helps you or you simply enjoy it, you can {support}.',
  'anotoki.about.closingLink': 'support it',
} as const;

/** A key of these words. */
export type AboutLibraryKey = keyof typeof EN;

const SK: Readonly<Record<AboutLibraryKey, string>> = {
  'anotoki.about.title': 'O projekte anotoki',
  'anotoki.about.nameTitle': 'Názov',
  'anotoki.about.nameText': 'anotoki pochádza z japonského {word} ({reading}): „vtedy" – čas, na ktorý sa spomína s úsmevom. Zvolil som ho pre nostalgický pocit, ktorý mal mať projekt Genshin Impact, a názov zostal všetkému, čo z neho vyrástlo: Build Analyzeru, Japanese Academy a Piano Academy.',
  'anotoki.about.authorTitle': 'Robí to jeden človek',
  'anotoki.about.authorText': 'Každý projekt anotoki navrhujem, tvorím a prevádzkujem sám. Na projekte Genshin Impact som pracoval takmer dva roky a čakal som, že dokončiť ho potrvá ešte rok. Keď sa súčasťou vývoja stal Claude Code, bol hotový za pár mesiacov – a ďalšie projekty nasledovali.',
  'anotoki.about.projectsTitle': 'Projekty',
  'anotoki.about.japaneseName': 'Japanese Academy',
  'anotoki.about.japaneseText': 'Chcel som na jednom mieste spojiť každodenný návyk z Duolinga a starostlivé učenie kandži z WaniKani, no so zameraním na skúšky JLPT. Kandži a slovná zásoba prichádzajú v lekciách, vracajú sa v opakovaniach tesne predtým, než by sa zabudli, a dajú sa precvičovať bez obmedzenia; test s viac ako 11 000 otázkami aj s počúvaním ukáže, koľko sa toho naozaj naučilo.',
  'anotoki.about.pianoName': 'Piano Academy',
  'anotoki.about.pianoText': 'Niečo priamo pre klavír: jednoduchá cesta učenia od úplne prvých nôt, v prehliadači a bez inštalovania. Stačí pripojiť digitálny klavír alebo MIDI klávesnicu k počítaču – stránka ukáže noty, počúva, čo sa hrá, a ukladá pokrok.',
  'anotoki.about.genshinName': 'Genshin Impact',
  'anotoki.about.genshinText': 'Jednoduché databázy postáv, zbraní, materiálov a bannerov s filtrami, ktoré sa ľahko používajú, k tomu denný kvíz, ďalšie kvízy a malé hry – bez záplavy reklám, ktorá zahlcuje väčšinu fanúšikovských stránok.',
  'anotoki.about.builderName': 'Build Analyzer',
  'anotoki.about.builderText': 'Chcel som svoje aktuálne buildy postáv importovať automaticky namiesto ich prepisovania a potom vidieť, kam ďalej: návrhy z buildov komunity a jasné cieľové štatistiky pre každú postavu, pre Genshin Impact aj Honkai: Star Rail.',
  'anotoki.about.surveyName': 'Prieskumy',
  'anotoki.about.surveyText': 'Miesto, kde sa dá jednotne opýtať ľudí, ktorí tieto projekty používajú, čo si myslia – ako prieskumy, ktoré hry robia na konci patchu – aby to, čo príde ďalej, vychádzalo zo skutočnej spätnej väzby.',
  'anotoki.about.fanLine': 'Fanúšikovský projekt, nie je prepojený so spoločnosťou HoYoverse ani ňou schválený.',
  'anotoki.about.closing': 'anotoki je zadarmo. Ak pomáha alebo jednoducho teší, dá sa {support}.',
  'anotoki.about.closingLink': 'podporiť',
};

/** These words, per language: English and Slovak, each with every key. */
export const ABOUT_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<AboutLibraryKey, string>>>> = { en: EN, sk: SK };
