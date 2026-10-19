import { Component, WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AnotokiLegalConfig, provideAnotokiLegal } from '@anotoki/lib/legal';
import { headingLevels, inOrder, settle, words } from '../../../pages/src/testing';
import { AboutPageComponent } from './about-page.component';

@Component({ selector: 'anotoki-test-support', template: '' })
class SupportStandInComponent {}

describe("<anotoki-about-page>: the owner's words, the same on every anotoki site", () => {
  let fixture: ComponentFixture<AboutPageComponent>;
  let host: HTMLElement;
  let language: WritableSignal<string>;

  /** The page, with the legal configuration (null: none) - which reads none of the site's facts. */
  async function draw(config: Partial<AnotokiLegalConfig> | null = {}): Promise<void> {
    language = signal('en');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'support', component: SupportStandInComponent },
          { path: 'help/support', component: SupportStandInComponent },
        ]),
        ...(config === null
          ? []
          : [
              provideAnotokiLegal(() => ({
                language: () => language(),
                facts: () => {
                  throw new Error('The About page reads none of the facts: the legal pages alone do.');
                },
                ...config,
              })),
            ]),
      ],
    });
    fixture = TestBed.createComponent(AboutPageComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle(fixture);
  }

  const text = (selector: string) => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const projects = () => Array.from(host.querySelectorAll('[data-project]')).map((project) => [words(project.querySelector('h3')), project.querySelector('h3 a')?.getAttribute('href')]);

  afterEach(() => {
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it("says where the name comes from - the Japanese in Japanese, its reading in italics - and who makes the projects, in the owner's words", async () => {
    await draw();
    expect(host.getAttribute('lang')).toBe('en');
    expect(words(host.querySelector('h1'))).toBe('About anotoki');
    expect(Array.from(host.querySelectorAll('h2')).map((heading) => words(heading))).toEqual(['The name', 'Made by one person', 'The projects']);
    expect(inOrder(headingLevels(host))).toBe(true);

    expect(text('[data-name-origin]')).toBe(
      'anotoki comes from the Japanese あの時 (ano toki): "back then" – that time you look back on with a smile. I chose it for the nostalgic feeling I wanted the Genshin Impact project to carry, and the name stayed with everything that grew from it: the Build Analyzer, Japanese Academy and Piano Academy.',
    );
    const word = host.querySelector('[data-word]')!;
    expect([word.textContent, word.getAttribute('lang')]).toEqual(['あの時', 'ja']);
    const reading = host.querySelector('[data-reading]')!;
    expect([reading.tagName, reading.textContent, reading.getAttribute('lang')]).toEqual(['I', 'ano toki', 'ja-Latn']);
    expect(words(host.querySelector('[data-section="author"] p'))).toBe(
      'Every anotoki project is designed, built and run by me alone. I worked on the Genshin Impact project for almost two years and expected another year before it was done. Once Claude Code became part of the development, it was finished in a couple of months – and the other projects followed.',
    );
  });

  it("lists the projects in the owner's order, each name a link to its site - the fan line under the two about HoYoverse's games", async () => {
    await draw();
    expect(projects()).toEqual([
      ['Japanese Academy', 'https://japanese.anotoki.eu'],
      ['Piano Academy', 'https://piano.anotoki.eu'],
      ['Genshin Impact', 'https://genshin.anotoki.eu'],
      ['Build Analyzer', 'https://builder.anotoki.eu'],
      ['Surveys', 'https://survey.anotoki.eu'],
    ]);
    expect(host.querySelectorAll('[data-project] h3')).toHaveLength(5);
    expect(words(host.querySelector('[data-project="japanese"] p'))).toContain('aimed at the JLPT exams');
    expect(words(host.querySelector('[data-project="survey"] p'))).toBe(
      'A place to ask the people who use these projects what they think, in one coordinated way – like the surveys games run at the end of a patch – so that what comes next is shaped by real feedback.',
    );
    expect(Array.from(host.querySelectorAll('[data-fan]')).map((line) => line.closest('[data-project]')?.getAttribute('data-project'))).toEqual(['genshin', 'builder']);
    expect(words(host.querySelector('[data-fan]'))).toBe('A fan-made project, not affiliated with or endorsed by HoYoverse.');
  });

  it("ends with its last line, whose link goes to the site's Support page - its path the legal configuration's", async () => {
    await draw();
    expect(text('[data-closing]')).toBe('anotoki is free to use. If it helps you or you simply enjoy it, you can support it.');
    const link = host.querySelector<HTMLAnchorElement>('[data-closing] a[data-support-link]')!;
    expect([words(link), link.getAttribute('href')]).toEqual(['support it', '/support']);
    // A link of the site's own: the router follows it, the page stays the site's.
    link.click();
    await settle(fixture);
    expect(TestBed.inject(Router).url).toBe('/support');
    fixture.destroy();
    document.body.innerHTML = '';
    TestBed.resetTestingModule();

    await draw({ paths: { support: '/help/support' } });
    expect(host.querySelector('[data-support-link]')?.getAttribute('href')).toBe('/help/support');
  });

  it('speaks Slovak - the owner of himself, addressing nobody - and says its language where the page has another', async () => {
    await draw();
    language.set('sk');
    await settle(fixture);
    expect(host.getAttribute('lang')).toBe('sk');
    expect(words(host.querySelector('h1'))).toBe('O projekte anotoki');
    expect(Array.from(host.querySelectorAll('h2')).map((heading) => words(heading))).toEqual(['Názov', 'Robí to jeden človek', 'Projekty']);
    expect(text('[data-name-origin]')).toContain('anotoki pochádza z japonského あの時 (ano toki): „vtedy"');
    expect(projects().map(([name]) => name)).toEqual(['Japanese Academy', 'Piano Academy', 'Genshin Impact', 'Build Analyzer', 'Prieskumy']);
    expect(text('[data-closing]')).toBe('anotoki je zadarmo. Ak pomáha alebo jednoducho teší, dá sa podporiť.');
    expect(words(host.querySelector('[data-support-link]'))).toBe('podporiť');

    language.set('de');
    await settle(fixture);
    expect(host.getAttribute('lang')).toBe('en');
    expect(words(host.querySelector('h1'))).toBe('About anotoki');
  });

  it("puts an owner's rewording first - a last line reworded without its link's place keeps its words, the link after them", async () => {
    await draw({
      translate: (key) => ({ 'anotoki.about.title': 'About us', 'anotoki.about.closing': 'anotoki costs nothing.', 'anotoki.about.surveyName': 'The survey' })[key] ?? null,
    });
    expect(words(host.querySelector('h1'))).toBe('About us');
    expect(projects()[4]).toEqual(['The survey', 'https://survey.anotoki.eu']);
    expect(text('[data-closing]')).toBe('anotoki costs nothing. support it');
    expect(host.querySelector('[data-closing] > :last-child')?.matches('a[data-support-link]')).toBe(true);
  });

  it("works without the legal configuration: the page's own language and the default paths", async () => {
    document.documentElement.lang = 'sk';
    await draw(null);
    expect(words(host.querySelector('h1'))).toBe('O projekte anotoki');
    expect(host.querySelector('[data-support-link]')?.getAttribute('href')).toBe('/support');
    document.documentElement.lang = 'en';
  });
});
