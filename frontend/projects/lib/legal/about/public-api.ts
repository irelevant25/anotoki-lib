/*
 * @anotoki/lib/legal/about - <anotoki-about-page> (0.8.0), the About page every anotoki site shows, the same on each,
 * in the owner's own words (`anotoki.about.*`, which the page reads itself: a page of text, in no first load): where
 * the name anotoki comes from, who makes the projects, each project linked to its site, and a last line linking to
 * the Support page. Configured by the legal configuration (provideAnotokiLegal, @anotoki/lib/legal: the language, an
 * owner's rewording, the paths). An entry point of its own, on a lazy route of the site's - anybody's, in the frame
 * its legal pages are in:
 *
 *   { path: 'about', loadComponent: () => import('@anotoki/lib/legal/about').then((m) => m.AboutPageComponent) }
 */

export { AboutPageComponent } from './src/about-page/about-page.component';
export type { AboutProject, SentencePart } from './src/projects';
export { ANOTOKI_NAME_ORIGIN, ANOTOKI_PROJECTS, sentenceParts } from './src/projects';
export type { AboutWordName, AboutWords } from './src/words';
export { BUILT_IN_ABOUT_WORDS, aboutKey, aboutWordNames, aboutWords } from './src/words';
