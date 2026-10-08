import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationGrid, TranslationService, TranslationsAdminConfig } from '@anotoki/lib/translations';
import { API, AdminSite, CZECH, adminProviders, adminSite, grid, refusal, settle, type, words } from '../testing';
import { TranslationsPageComponent } from './translations-page.component';

describe('<anotoki-translations-page>: the site’s words in every language', () => {
  let site: AdminSite;
  let http: HttpTestingController;
  let fixture: ComponentFixture<TranslationsPageComponent>;
  let host: HTMLElement;

  function setUp(admin: Partial<TranslationsAdminConfig> = {}): void {
    TestBed.configureTestingModule({ providers: adminProviders(site, admin) });
    http = TestBed.inject(HttpTestingController);
  }

  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(TranslationsPageComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle(fixture);
  }

  /** The grid the server answers - or its refusal, `{ status, error }` - and the page drawn with it. */
  async function answer(body: TranslationGrid | { status: number; error: Record<string, string> } = grid()): Promise<void> {
    const request = http.expectOne({ method: 'GET', url: `${API}/translations` });
    if ('status' in body) {
      request.flush(body.error, { status: body.status, statusText: 'Refused' });
    } else {
      request.flush(body);
    }
    await settle(fixture);
  }

  async function open(admin: Partial<TranslationsAdminConfig> = {}): Promise<void> {
    setUp(admin);
    await draw();
    await answer();
  }

  const box = (key: string, language = 'Slovak') => host.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${language}: ${key}"]`)!;
  const blocks = () => Array.from(host.querySelectorAll<HTMLElement>('[data-block]')).map((block) => block.dataset['block']);
  const bar = () => words(host.querySelector('[data-save-state]'));
  const button = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!;
  const question = () => document.querySelector('[data-question]');

  async function edit(key: string, text: string, language = 'Slovak'): Promise<void> {
    type(box(key, language), text);
    await settle(fixture);
  }

  async function answerQuestion(yes: boolean): Promise<void> {
    document.querySelector<HTMLButtonElement>(yes ? '[data-question-yes]' : '[data-question-no]')!.click();
    await settle(fixture);
  }

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    site = adminSite();
  });

  afterEach(() => {
    http.verify();
    host?.remove();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('is the people the site allows’ alone: anybody else is told, and nothing is asked of the server', async () => {
    site.strings.set(false);
    setUp();
    await draw();
    expect(words(host)).toBe('The translations are for the people the site lets change its words.');
    expect(host.getAttribute('lang')).toBe('en');
  });

  describe('the grid', () => {
    it('shows each language - how much of it is written, its tags - and every key, a block each', async () => {
      await open();
      expect(words(host.querySelector('h1'))).toBe('Translations');
      expect(words(host.querySelector('.counts'))).toBe('8 keys 2 languages');
      const languages = Array.from(host.querySelectorAll('.language')).map((language) => [
        ...Array.from(language.querySelector('.language-name')!.children).map(words),
        words(language.querySelector('.coverage-count')),
      ]);
      expect(languages).toEqual([
        ['English', 'en', 'Fallback', '8 / 8'],
        ['Slovak', 'sk', '6 / 8'],
      ]);
      expect(host.querySelector('[data-language="sk"] .coverage-count')?.getAttribute('aria-label')).toBe('6 of 8 keys have a string in Slovak');
      expect(blocks()).toEqual(['greeting.named', 'mail.reset.greeting', 'mail.reset.subject', 'reviews.due', 'sessions.ended.other', 'theme.label']);
      expect(box('theme.label').value).toBe('Vzhľad');
      expect(box('theme.label').getAttribute('lang')).toBe('sk');
      expect(box('mail.reset.greeting').placeholder).toBe('Falls back to English');
      expect(box('mail.reset.greeting', 'English').placeholder).toBe('Required');
      // The Languages page is linked for whoever may use it.
      expect(host.querySelector('[data-languages-link]')?.getAttribute('href')).toBe('/admin/languages');
    });

    it('shows a plural family as one block: the numbers each form is for, and the family as the site says it for 1, 3 and 12', async () => {
      await open();
      const family = host.querySelector('[data-block="reviews.due"]')!;
      expect(Array.from(family.querySelector('.block-head')!.children).map(words)).toEqual(['reviews.due', 'Plural: one text for each kind of number']);
      const numbers = Array.from(family.querySelectorAll('.numbers')).map(words);
      expect(numbers).toEqual([
        'For the numbers: 1',
        'For the numbers: 1',
        'For the numbers: not used in English - the fallback for other languages',
        'For the numbers: 2-4',
        'For the numbers: everything else',
        'For the numbers: 0, 5 and more',
      ]);
      expect(Array.from(family.querySelectorAll('.sample')).map((sample) => Array.from(sample.querySelectorAll('li')).map(words))).toEqual([
        ['1 review due', '3 reviews due', '12 reviews due'],
        ['1 review due', '3 opakovania', '12 opakovaní'],
      ]);
      // A lone `.other` is a key, not a family.
      expect(words(host.querySelector('[data-block="sessions.ended.other"] .block-head'))).toBeNull();
    });

    it('puts the keys only the server reads in blocks of their own, in their own part, in the order and words the site gives', async () => {
      await open({
        groups: [
          {
            prefix: 'mail.',
            heading: 'Mails',
            lead: 'One line each, no address.',
            parts: ['subject', 'greeting'],
            about: { 'mail.reset': { title: 'The password reset mail', text: 'Sent from "Forgotten password".' } },
            icon: 'mail',
          },
        ],
      });
      expect(Array.from(host.querySelectorAll('.part-title')).map(words)).toEqual(['Mails', 'Pages']);
      expect(blocks()).toEqual(['mail.reset', 'greeting.named', 'reviews.due', 'sessions.ended.other', 'theme.label']);
      const mail = host.querySelector('[data-block="mail.reset"]')!;
      expect(Array.from(mail.querySelector('.block-head')!.children).map(words)).toEqual(['', 'The password reset mail', 'mail.reset', 'Sent from "Forgotten password".']);
      // The pages' own icons are registered as they come: the mail is drawn.
      expect(mail.querySelector('.block-head anotoki-icon svg path')).not.toBeNull();
      expect(Array.from(mail.querySelectorAll('.key-name')).map(words)).toEqual(['mail.reset.subject', 'mail.reset.greeting']);
      expect(words(host.querySelector('.part-lead'))).toBe('One line each, no address.');
    });

    it('stacks the languages under one another above three of them', async () => {
      setUp();
      await draw();
      const many = grid();
      many.languages = [...many.languages, CZECH, { ...CZECH, code: 'de', name: 'German', native_name: 'Deutsch' }];
      await answer(many);
      expect(host.querySelector('.grid')?.classList).toContain('is-stacked');
    });
  });

  describe('finding a key', () => {
    it('by its name, its description or its text in any language - diacritics and case aside - and says how many are shown', async () => {
      await open();
      const search = host.querySelector<HTMLInputElement>('input[type=search]')!;
      type(search, 'VZHLAD');
      await settle(fixture);
      expect(blocks()).toEqual(['theme.label']);
      expect(words(host.querySelector('.shown'))).toBe('1 of 8 keys');

      type(search, 'nothing like it');
      await settle(fixture);
      expect(words(host.querySelector('.empty'))).toContain('No key matches');
      button('.empty button').click();
      await settle(fixture);
      expect(blocks()).toHaveLength(6);
    });

    it('missing in a language: the keys it has no string of its own for - by what is saved', async () => {
      await open();
      const select = host.querySelector<HTMLSelectElement>('.missing select')!;
      expect(Array.from(select.options).map((option) => option.text)).toEqual(['Every key', 'Missing in Slovak']);
      select.value = 'sk';
      select.dispatchEvent(new Event('change'));
      await settle(fixture);
      expect(blocks()).toEqual(['mail.reset.greeting', 'reviews.due']);

      // Filled in: the row stays while it is typed in, and goes with the next look.
      await edit('mail.reset.greeting', 'Ahoj {username},');
      expect(blocks()).toEqual(['mail.reset.greeting', 'reviews.due']);
    });
  });

  describe('saving', () => {
    it('marks what is changed, sends only that, and says what was saved - the site’s pages read the words again', async () => {
      await open();
      const reload = vi.spyOn(TestBed.inject(TranslationService), 'reload');
      expect(bar()).toBe('Everything is saved');
      await edit('theme.label', 'Farba');
      expect(words(box('theme.label').parentElement?.querySelector('.mark'))).toBe('Changed');
      expect(bar()).toBe('1 string changed, not saved yet');

      // Typed back: no change.
      await edit('theme.label', 'Vzhľad');
      expect(bar()).toBe('Everything is saved');
      expect(button('[data-save]').disabled).toBe(true);

      await edit('theme.label', 'Farba');
      await edit('mail.reset.greeting', 'Ahoj {username},');
      button('[data-save]').click();
      const request = http.expectOne({ method: 'PUT', url: `${API}/translations` });
      expect(request.request.body).toEqual({ values: { 'theme.label': { sk: 'Farba' }, 'mail.reset.greeting': { sk: 'Ahoj {username},' } } });
      const saved = grid();
      saved.keys[7].values = { en: 'Theme', sk: 'Farba' };
      saved.keys[1].values = { en: 'Hello {username},', sk: 'Ahoj {username},' };
      request.flush(saved);
      await settle(fixture);

      expect(bar()).toBe('2 strings are saved.');
      expect(box('theme.label').parentElement?.querySelector('.mark')).toBeNull();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('keeps what is typed while a save is on its way', async () => {
      await open();
      await edit('theme.label', 'Farba');
      button('[data-save]').click();
      const request = http.expectOne({ method: 'PUT', url: `${API}/translations` });
      await edit('greeting.named', 'Čau, {name}!');
      const saved = grid();
      saved.keys[7].values = { en: 'Theme', sk: 'Farba' };
      request.flush(saved);
      await settle(fixture);
      expect(bar()).toBe('1 string changed, not saved yet');
      expect(box('greeting.named').value).toBe('Čau, {name}!');
    });

    it('says a refusal beside the key it is about, brings it into view and puts the focus in its box', async () => {
      await open();
      await edit('greeting.named', 'Ahoj!');
      // The row is out of the search's way: the refusal brings it back.
      type(host.querySelector<HTMLInputElement>('input[type=search]')!, 'vzhlad');
      await settle(fixture);
      button('[data-save]').click();
      http
        .expectOne({ method: 'PUT', url: `${API}/translations` })
        .flush(
          { code: 'placeholder_changed', message: 'The English string keeps {name}; another language may leave it out.', key: 'greeting.named', language: 'sk' },
          { status: 422, statusText: 'Unprocessable' },
        );
      await settle(fixture);

      expect(blocks()).toContain('greeting.named');
      expect(words(host.querySelector('[data-block="greeting.named"] .field-error'))).toBe('Nothing was saved. The English string keeps {name}; another language may leave it out.');
      expect(box('greeting.named').getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(box('greeting.named'));
      expect(bar()).toBe('Nothing was saved: see greeting.named');

      // Changing the box is the answer to it.
      await edit('greeting.named', 'Ahoj, {name}!!');
      expect(host.querySelector('.field-error')).toBeNull();
    });

    it('reads the grid again when a key or a language went meanwhile, lets go of what was typed for it and keeps the rest', async () => {
      await open();
      await edit('theme.label', 'Farba');
      await edit('greeting.named', 'Čau, {name}!');
      button('[data-save]').click();
      http
        .expectOne({ method: 'PUT', url: `${API}/translations` })
        .flush({ code: 'unknown_key', message: 'There is no key "theme.label".', key: 'theme.label' }, { status: 422, statusText: 'Unprocessable' });
      await settle(fixture);
      const without = grid();
      without.keys = without.keys.filter((key) => key.name !== 'theme.label');
      await answer(without);

      expect(bar()).toBe('Nothing was saved. There is no key "theme.label". What was typed for it could not be kept. Save again for the rest.');
      expect(box('greeting.named').value).toBe('Čau, {name}!');
    });

    it('says in the bar a failure that is about no key', async () => {
      await open();
      await edit('theme.label', 'Farba');
      button('[data-save]').click();
      http.expectOne({ method: 'PUT', url: `${API}/translations` }).error(new ProgressEvent('error'), { status: 0 });
      await settle(fixture);
      expect(bar()).toBe('Nothing was saved. The server could not be reached. Check the connection and try again.');
      expect(box('theme.label').value).toBe('Farba');
    });

    it('discards every change after asking - the focus on the safe answer', async () => {
      await open();
      await edit('theme.label', 'Farba');
      button('[data-discard]').click();
      await settle(fixture);
      expect(words(question()?.querySelector('h2'))).toBe('Discard the change?');
      expect(document.activeElement).toBe(document.querySelector('[data-question-no]'));
      await answerQuestion(false);
      expect(box('theme.label').value).toBe('Farba');

      button('[data-discard]').click();
      await settle(fixture);
      await answerQuestion(true);
      expect(box('theme.label').value).toBe('Vzhľad');
      expect(bar()).toBe('Everything is saved');
    });
  });

  describe('leaving', () => {
    it('asks first while something is not saved - "Stay here" keeps it, "Leave" gives it up', async () => {
      await open();
      expect(fixture.componentInstance.canLeave()).toBe(true);
      await edit('theme.label', 'Farba');

      let leaving = fixture.componentInstance.canLeave() as Promise<boolean>;
      await settle(fixture);
      expect(words(question()?.querySelector('h2'))).toBe('Leave without saving?');
      expect(words(question()?.querySelector('.description'))).toBe('1 changed string is not saved yet, and leaving loses it.');
      await answerQuestion(false);
      expect(await leaving).toBe(false);
      expect(box('theme.label').value).toBe('Farba');

      leaving = fixture.componentInstance.canLeave() as Promise<boolean>;
      await settle(fixture);
      await answerQuestion(true);
      expect(await leaving).toBe(true);
      expect(JSON.parse(sessionStorage.getItem('test-site:localization-drafts') ?? 'null')).toBeNull();
    });

    it('keeps what was typed for when the page is back - a sign-in that ended takes it away with no question', async () => {
      await open();
      await edit('theme.label', 'Farba');
      fixture.destroy();
      host.remove();
      await draw();
      await answer();
      expect(box('theme.label').value).toBe('Farba');
      expect(bar()).toBe('1 string changed, not saved yet');
    });
  });

  describe('a language as a file', () => {
    beforeEach(() => {
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:words'), revokeObjectURL: vi.fn() });
    });

    it('exports a language’s own strings as the server’s file, under the name it gives', async () => {
      await open();
      const clicked: HTMLAnchorElement[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });
      await edit('theme.label', 'Farba');
      button('[data-language="sk"] [data-export]').click();
      const request: TestRequest = http.expectOne({ method: 'GET', url: `${API}/translations/sk/export` });
      expect(request.request.responseType).toBe('text');
      request.flush('{\n    "greeting.named": "Ahoj, {name}!",\n    "theme.label": "Vzhľad"\n}\n', { headers: { 'Content-Disposition': 'attachment; filename="translations-sk.json"' } });
      await settle(fixture);

      expect(clicked.map((link) => link.download)).toEqual(['translations-sk.json']);
      expect(words(host.querySelector('[data-happened]'))).toBe('2 strings of Slovak are downloaded as translations-sk.json. What you have not saved yet is not in the file.');
    });

    async function choose(file: File, language = 'sk'): Promise<void> {
      const input = host.querySelector<HTMLInputElement>(`[data-language="${language}"] input[type=file]`)!;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle(fixture);
    }

    it('imports a file into a language after asking - with the count of the strings it holds - all of it or none', async () => {
      await open();
      await choose(new File(['﻿{"theme.label": "Farba", "greeting.named": "  ", "reviews.due.one": "{count} opakovanie"}'], 'sk.json', { type: 'application/json' }));
      expect(words(question()?.querySelector('h2'))).toBe('Import 2 strings into Slovak?');
      await answerQuestion(true);

      const request = http.expectOne({ method: 'PUT', url: `${API}/translations/sk/import` });
      expect(request.request.body).toEqual({ 'theme.label': 'Farba', 'greeting.named': '  ', 'reviews.due.one': '{count} opakovanie' });
      const imported = grid();
      imported.keys[7].values = { en: 'Theme', sk: 'Farba' };
      request.flush(imported);
      await settle(fixture);
      expect(words(host.querySelector('[data-happened]'))).toBe('The strings of Slovak are imported.');
      expect(box('theme.label').value).toBe('Farba');
    });

    it('says why a file was not imported: too large, not a language’s strings, nothing in it, refused by the server', async () => {
      setUp({ importMaxBytes: 64 });
      await draw();
      await answer();
      const notice = () => words(host.querySelector('[data-notice]'));

      await choose(new File(['x'.repeat(65)], 'big.json'));
      expect(notice()).toContain('"big.json" was not imported');
      expect(notice()).toContain('The file is larger than 0 kB');

      await choose(new File(['["a"]'], 'list.json'));
      expect(notice()).toContain('It is not a language’s strings');

      await choose(new File(['{"a": " "}'], 'blank.json'));
      expect(notice()).toContain('It holds no string: every value in it is empty.');

      await choose(new File(['{"nope": "x"}'], 'unknown.json'));
      await answerQuestion(true);
      http
        .expectOne({ method: 'PUT', url: `${API}/translations/sk/import` })
        .flush({ code: 'unknown_key', message: 'There is no key "nope".', keys: ['nope'] }, { status: 422, statusText: 'Unprocessable' });
      await settle(fixture);
      expect(notice()).toContain('There is no key "nope".');
    });
  });

  describe('before the tables are there', () => {
    it('says a database update waits, and points at Migrations', async () => {
      setUp();
      await draw();
      await answer({ status: 503, error: { code: 'translations_unavailable', message: 'Not yet.' } });
      expect(words(host.querySelector('[data-unavailable] .heading'))).toBe('Apply the pending database update first');
      expect(host.querySelector('[data-migrations-link]')?.getAttribute('href')).toBe('/admin/migrations');
    });

    it('says what else went wrong, with a way to try again', async () => {
      setUp();
      await draw();
      await answer({ status: 500, error: { code: 'server_error', message: 'The database is down.' } });
      expect(words(host.querySelector('anotoki-error-state'))).toContain('The database is down.');
      button('anotoki-error-state button').click();
      await answer();
      expect(blocks()).toHaveLength(6);
    });

    it('words a failure the site’s way, when it says how', async () => {
      setUp({ failureText: (failure) => (failure.code === 'server_error' ? `Our server: ${failure.message}` : null) });
      await draw();
      await answer({ status: 500, error: { code: 'server_error', message: 'down' } });
      expect(words(host.querySelector('anotoki-error-state'))).toContain('Our server: down');
    });
  });
});
