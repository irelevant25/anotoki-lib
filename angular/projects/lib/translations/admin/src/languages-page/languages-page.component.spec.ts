import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminLanguage, TranslationService, TranslationsAdminConfig } from '@anotoki/lib/translations';
import { API, AdminSite, CZECH, ENGLISH, SLOVAK, adminProviders, adminSite, settle, type, words } from '../testing';
import { LanguagesPageComponent } from './languages-page.component';

describe('<anotoki-languages-page>: the languages the site can be read in', () => {
  let site: AdminSite;
  let http: HttpTestingController;
  let fixture: ComponentFixture<LanguagesPageComponent>;
  let host: HTMLElement;

  const LANGUAGES: AdminLanguage[] = [CZECH, SLOVAK, ENGLISH];

  function setUp(admin: Partial<TranslationsAdminConfig> = {}): void {
    TestBed.configureTestingModule({ providers: adminProviders(site, admin) });
    http = TestBed.inject(HttpTestingController);
  }

  async function open(admin: Partial<TranslationsAdminConfig> = {}, languages: AdminLanguage[] = LANGUAGES): Promise<void> {
    setUp(admin);
    fixture = TestBed.createComponent(LanguagesPageComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle(fixture);
    http.expectOne({ method: 'GET', url: `${API}/languages` }).flush({ languages });
    await settle(fixture);
  }

  const row = (code: string) => host.querySelector<HTMLElement>(`[data-language="${code}"]`)!;
  const field = (code: string, label: string) =>
    Array.from(row(code).querySelectorAll<HTMLElement>('anotoki-text-field'))
      .find((element) => words(element.querySelector('label')) === label)!
      .querySelector<HTMLInputElement>('input')!;
  const happened = () => words(host.querySelector('[data-happened]'));
  const question = () => document.querySelector('[data-question]');

  async function answerQuestion(yes: boolean): Promise<void> {
    document.querySelector<HTMLButtonElement>(yes ? '[data-question-yes]' : '[data-question-no]')!.click();
    await settle(fixture);
  }

  beforeEach(() => {
    sessionStorage.clear();
    site = adminSite();
  });

  afterEach(() => {
    http.verify();
    host?.remove();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('is the people the site allows’ alone: anybody else is told, and nothing is asked of the server', async () => {
    site.languages.set(false);
    setUp();
    fixture = TestBed.createComponent(LanguagesPageComponent);
    host = fixture.nativeElement;
    await settle(fixture);
    expect(words(host)).toBe('The languages are for the people the site lets change them.');
  });

  it('lists every language in the server’s order, with what it is: the fallback, released with the site, hidden - and the site’s own words for its fields', async () => {
    await open({ siteName: 'the IAM', languageNotes: { row: (language) => `${language['accounts']} accounts have it` } });
    expect(Array.from(host.querySelectorAll('[data-language]')).map((element) => (element as HTMLElement).dataset['language'])).toEqual(['en', 'sk', 'cs']);
    const head = (code: string) => Array.from(row(code).querySelector('.head')!.children).map(words);
    expect(head('en')).toEqual(['en', 'English', 'English', 'Fallback', '7 strings · 12 accounts have it']);
    expect(head('sk')).toEqual(['sk', 'Slovak', 'Slovenčina', 'Released with the IAM', '4 strings · 3 accounts have it']);
    expect(row('cs').classList).toContain('is-hidden');
    expect(row('sk').querySelector('.native')?.getAttribute('lang')).toBe('sk');
    expect(words(host.querySelector('.counts'))).toBe('3 languages 2 offered');
    // English is always offered; a released language is never deleted.
    expect(row('en').querySelector<HTMLInputElement>('[data-offered] input')!.disabled).toBe(true);
    expect(row('en').querySelector('[data-delete]')).toBeNull();
    expect(row('sk').querySelector('[data-delete]')).toBeNull();
    expect(row('cs').querySelector('[data-delete]')).not.toBeNull();
    expect(host.querySelector('[data-translations-link]')?.getAttribute('href')).toBe('/admin/translations');
  });

  describe('a row', () => {
    it('saves only what changed of its names and its place - Undo puts them back - and the site reads its languages again', async () => {
      await open();
      const reload = vi.spyOn(TestBed.inject(TranslationService), 'reload');
      type(field('cs', 'Name as its speakers write it'), 'Česky');
      await settle(fixture);
      row('cs').querySelector<HTMLButtonElement>('[data-undo]')!.click();
      await settle(fixture);
      expect(field('cs', 'Name as its speakers write it').value).toBe('Čeština');
      expect(row('cs').querySelector<HTMLButtonElement>('[data-save]')!.disabled).toBe(true);

      type(field('cs', 'Name in English'), 'Czech (Czechia)');
      type(field('cs', 'Order'), '0');
      await settle(fixture);
      row('cs').querySelector<HTMLButtonElement>('[data-save]')!.click();
      const request = http.expectOne({ method: 'PUT', url: `${API}/languages/cs` });
      expect(request.request.body).toEqual({ name: 'Czech (Czechia)', sort_order: 0 });
      request.flush({ language: { ...CZECH, name: 'Czech (Czechia)', sort_order: 0 } });
      await settle(fixture);

      expect(happened()).toBe('Czech (Czechia) is saved.');
      // Its new place: first.
      expect((host.querySelector('[data-language]') as HTMLElement).dataset['language']).toBe('cs');
      expect(row('cs').querySelector('[data-undo]')).toBeNull();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('refuses an order that is no whole number from 0 to 1000 before asking the server - and says the server’s refusal beside the row', async () => {
      await open();
      type(field('cs', 'Order'), '1001');
      await settle(fixture);
      row('cs').querySelector<HTMLButtonElement>('[data-save]')!.click();
      await settle(fixture);
      expect(words(row('cs').querySelector('.field-error'))).toBe('The order is a whole number from 0 to 1000.');

      type(field('cs', 'Order'), '9');
      type(field('cs', 'Name in English'), '');
      await settle(fixture);
      row('cs').querySelector<HTMLButtonElement>('[data-save]')!.click();
      http.expectOne({ method: 'PUT', url: `${API}/languages/cs` }).flush({ code: 'invalid_language', message: 'A language needs a name.' }, { status: 422, statusText: 'Unprocessable' });
      await settle(fixture);
      expect(words(row('cs').querySelector('.field-error'))).toBe('A language needs a name.');
      // What was typed stays.
      expect(field('cs', 'Order').value).toBe('9');
    });

    it('offers or hides a language the moment the switch is flipped - and puts it back when the server refuses', async () => {
      await open();
      const offered = () => row('cs').querySelector<HTMLInputElement>('[data-offered] input')!;
      offered().click();
      await settle(fixture);
      const request = http.expectOne({ method: 'PUT', url: `${API}/languages/cs` });
      expect(request.request.body).toEqual({ enabled: true });
      request.flush({ language: { ...CZECH, enabled: true } });
      await settle(fixture);
      expect(happened()).toBe('Czech is offered to readers now.');
      expect(offered().checked).toBe(true);
      expect(row('cs').classList).not.toContain('is-hidden');

      offered().click();
      await settle(fixture);
      http.expectOne({ method: 'PUT', url: `${API}/languages/cs` }).error(new ProgressEvent('error'), { status: 0 });
      await settle(fixture);
      expect(offered().checked).toBe(true);
      expect(words(row('cs').querySelector('.field-error'))).toBe('The server could not be reached. Check the connection and try again.');
    });

    it('keeps what is typed in a row for when the page is back', async () => {
      await open();
      type(field('cs', 'Name in English'), 'Czech!');
      await settle(fixture);
      fixture.destroy();
      host.remove();
      fixture = TestBed.createComponent(LanguagesPageComponent);
      host = fixture.nativeElement;
      await settle(fixture);
      http.expectOne({ method: 'GET', url: `${API}/languages` }).flush({ languages: LANGUAGES });
      await settle(fixture);
      expect(field('cs', 'Name in English').value).toBe('Czech!');

      let leaving = fixture.componentInstance.canLeave() as Promise<boolean>;
      await settle(fixture);
      expect(words(question()?.querySelector('.description'))).toBe('1 language has changes that are not saved yet, and leaving loses them.');
      await answerQuestion(true);
      expect(await leaving).toBe(true);
      leaving = Promise.resolve(fixture.componentInstance.canLeave() as boolean);
      expect(await leaving).toBe(true);
    });
  });

  describe('deleting a language', () => {
    beforeEach(() => {
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:words'), revokeObjectURL: vi.fn() });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    it('offers to export its strings first, then asks - naming them and what the site says goes with them - and says what went', async () => {
      await open({
        languageNotes: {
          beforeDelete: (language) => (language['accounts'] ? null : 'No account has it.'),
          afterDelete: (_language, answer) => (answer['copy'] ? `A copy was kept: ${answer['copy']}.` : null),
        },
      });
      row('cs').querySelector<HTMLButtonElement>('[data-delete]')!.click();
      await settle(fixture);
      expect(words(question()?.querySelector('h2'))).toBe('Export the 2 strings of Czech first?');
      await answerQuestion(true);
      http
        .expectOne({ method: 'GET', url: `${API}/translations/cs/export` })
        .flush('{\n    "a": "A",\n    "b": "B"\n}\n', { headers: { 'Content-Disposition': 'attachment; filename="translations-cs.json"' } });
      await settle(fixture);

      expect(words(question()?.querySelector('h2'))).toBe('Delete Czech (cs)?');
      expect(words(question()?.querySelector('.description'))).toBe('Its 2 strings go with it, and none of them can be brought back. No account has it.');
      expect(document.activeElement).toBe(document.querySelector('[data-question-no]'));
      await answerQuestion(true);
      http.expectOne({ method: 'DELETE', url: `${API}/languages/cs` }).flush({ strings: 2, copy: 'academy-before-language-delete-cs.json' });
      await settle(fixture);
      // The others are read again: their fields may follow (the IAM: English has the accounts now).
      http.expectOne({ method: 'GET', url: `${API}/languages` }).flush({ languages: [SLOVAK, ENGLISH] });
      await settle(fixture);

      expect(host.querySelector('[data-language="cs"]')).toBeNull();
      expect(happened()).toBe('Czech is deleted, and its 2 strings with it. A copy was kept: academy-before-language-delete-cs.json.');
    });

    it('deletes nothing when the export it was asked for fails - or when the question is answered no', async () => {
      await open();
      row('cs').querySelector<HTMLButtonElement>('[data-delete]')!.click();
      await settle(fixture);
      await answerQuestion(true);
      http.expectOne({ method: 'GET', url: `${API}/translations/cs/export` }).error(new ProgressEvent('error'), { status: 0 });
      await settle(fixture);
      expect(question()).toBeNull();
      expect(words(row('cs').querySelector('.field-error'))).toBe('The strings could not be exported, so nothing was deleted. The server could not be reached. Check the connection and try again.');

      row('cs').querySelector<HTMLButtonElement>('[data-delete]')!.click();
      await settle(fixture);
      await answerQuestion(false);
      await answerQuestion(false);
      expect(row('cs')).not.toBeNull();
    });
  });

  describe('adding a language', () => {
    it('checks the code as it is typed, adds it hidden unless asked otherwise, and puts it in its place', async () => {
      await open();
      const form = host.querySelector('form.add')!;
      const input = (label: string) =>
        Array.from(form.querySelectorAll<HTMLElement>('anotoki-text-field'))
          .find((element) => words(element.querySelector('label')) === label)!
          .querySelector<HTMLInputElement>('input')!;
      const add = () => host.querySelector<HTMLButtonElement>('[data-add]')!;

      type(input('Code'), 'German');
      type(input('Name in English'), 'German');
      type(input('Name as its speakers write it'), 'Deutsch');
      await settle(fixture);
      expect(words(form.querySelector('.error'))).toContain('A language’s code is two small letters');
      expect(add().disabled).toBe(true);

      type(input('Code'), 'DE');
      await settle(fixture);
      expect(add().disabled).toBe(false);
      add().click();
      const request = http.expectOne({ method: 'POST', url: `${API}/languages` });
      expect(request.request.body).toEqual({ code: 'de', name: 'German', native_name: 'Deutsch', enabled: false });
      request.flush({ language: { code: 'de', name: 'German', native_name: 'Deutsch', enabled: false, sort_order: 4, seeded: false, strings: 0 } }, { status: 201, statusText: 'Created' });
      await settle(fixture);

      expect(happened()).toBe('German is added, hidden. Write its strings, then offer it.');
      expect(Array.from(host.querySelectorAll('[data-language]')).map((element) => (element as HTMLElement).dataset['language'])).toEqual(['en', 'sk', 'cs', 'de']);
      expect(input('Code').value).toBe('');
    });

    it('says the server’s refusal under the form', async () => {
      await open();
      const form = host.querySelector('form.add')!;
      const fields = Array.from(form.querySelectorAll<HTMLInputElement>('anotoki-text-field input'));
      type(fields[0], 'sk');
      type(fields[1], 'Slovak');
      type(fields[2], 'Slovenčina');
      await settle(fixture);
      host.querySelector<HTMLButtonElement>('[data-add]')!.click();
      http.expectOne({ method: 'POST', url: `${API}/languages` }).flush({ code: 'language_exists', message: 'There is a language "sk" already.' }, { status: 409, statusText: 'Conflict' });
      await settle(fixture);
      expect(words(host.querySelector('.add-error'))).toBe('There is a language "sk" already.');
    });
  });

  it('says a database update waits, and points at Migrations', async () => {
    setUp();
    fixture = TestBed.createComponent(LanguagesPageComponent);
    host = fixture.nativeElement;
    await settle(fixture);
    http.expectOne({ method: 'GET', url: `${API}/languages` }).flush({ code: 'translations_unavailable', message: 'Not yet.' }, { status: 503, statusText: 'Unavailable' });
    await settle(fixture);
    expect(words(host.querySelector('[data-unavailable] .heading'))).toBe('Apply the pending database update first');
    expect(host.querySelector('[data-migrations-link]')?.getAttribute('href')).toBe('/admin/migrations');
  });
});
