import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminSite, adminProviders, adminSite, choose, click, draw, expectOne, refuse, settle, type, words } from '../../../parts/src/testing';
import { AdminPage, AdminSiteSettings } from '../models';
import { SiteSettingsPageComponent } from './site-settings-page.component';

const BASE = '/api/admin/site-settings';
const NOBODY = { updated_at: null, updated_by: null, updated_by_name: null };

function page(overrides: Partial<AdminPage> = {}): AdminPage {
  return { id: 1, path: '/quizzes', visibility: 'PUBLIC', blocked: false, api_paths: [], sort_order: 10, refused: null, ...NOBODY, ...overrides };
}

function whole(overrides: Partial<AdminSiteSettings> = {}): AdminSiteSettings {
  return {
    parts: ['getting_in', 'announcement', 'page_access'],
    settings: {
      maintenance_mode: { value: false, ...NOBODY },
      maintenance_message: { value: {}, ...NOBODY },
      announcement_enabled: { value: true, updated_at: '2026-10-24T08:00:00.000Z', updated_by: 7, updated_by_name: 'Mira' },
      announcement_level: { value: 'warning', ...NOBODY },
      announcement_message: { value: { en: 'Down tonight' }, ...NOBODY },
    },
    pages: [page(), page({ id: 2, path: '/members', visibility: 'USER', api_paths: ['/api/members'] }), page({ id: 3, path: '/old', blocked: true })],
    levels: ['info', 'warning', 'danger'],
    visibilities: ['PUBLIC', 'USER', 'EDITOR', 'ADMIN'],
    reserved: { pages: ['/auth', '/staff', '/admin'], api_paths: ['/api/site-status', '/api/me'] },
    limits: { message: 2000, message_languages: 30, api_paths: 20, pages: 500 },
    ...overrides,
  };
}

describe("<anotoki-site-settings-page>: the administrators' site settings", () => {
  let site: AdminSite;
  let http: HttpTestingController;
  let fixture: ComponentFixture<SiteSettingsPageComponent>;
  let host: HTMLElement;

  async function open(data: AdminSiteSettings = whole(), config = {}): Promise<void> {
    site = adminSite();
    TestBed.configureTestingModule({ providers: adminProviders(site, config) });
    http = TestBed.inject(HttpTestingController);
    fixture = await draw(SiteSettingsPageComponent);
    host = fixture.nativeElement;
    expectOne(http, 'GET', BASE).flush(data);
    await settle(fixture);
  }

  const card = (part: string) => host.querySelector<HTMLButtonElement>(`[data-card="${part}"]`);
  const lines = (part: string) => Array.from(card(part)?.querySelectorAll('.anotoki-site-settings-page__card-line') ?? []).map(words);

  afterEach(() => {
    http.verify();
    fixture?.nativeElement.remove();
  });

  it('is for the ADMIN alone: anybody else is told so, and nothing is asked', async () => {
    site = adminSite();
    site.admin.set(false);
    TestBed.configureTestingModule({ providers: adminProviders(site) });
    http = TestBed.inject(HttpTestingController);
    fixture = await draw(SiteSettingsPageComponent);
    expect(words(fixture.nativeElement)).toBe('Site settings are for the administrators of the site.');
    http.expectNone(BASE);
  });

  it('a card a part, each saying what it is doing - something in force in the warning ink', async () => {
    await open();
    expect(Array.from(host.querySelectorAll('[data-card]')).map((element) => element.getAttribute('data-card'))).toEqual(['getting_in', 'announcement', 'page_access']);
    expect(lines('getting_in')).toEqual(['Maintenance mode Off', 'The maintenance page says the built-in sentence']);
    expect(lines('announcement')).toEqual(['Shown On', 'Kind Warning', 'Message 1 language']);
    expect(lines('page_access')).toEqual(['Pages governed 3', 'Switched off 1', 'For some readers alone 1', 'Refusing their API paths too 1']);
    expect(card('announcement')?.querySelectorAll('.anotoki-site-settings-page__card-state--on').length).toBe(1);
    expect(card('getting_in')?.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('the IAM: the announcement alone', async () => {
    await open(
      whole({
        parts: ['announcement'],
        settings: { announcement_enabled: { value: false, ...NOBODY }, announcement_level: { value: 'info', ...NOBODY }, announcement_message: { value: {}, ...NOBODY } },
        pages: [],
      }),
    );
    expect(Array.from(host.querySelectorAll('[data-card]')).map((element) => element.getAttribute('data-card'))).toEqual(['announcement']);
    expect(lines('announcement')).toEqual(['Shown Off', 'Kind Information', 'Message not written']);
  });

  it('while the tables wait for their update: said, with Migrations', async () => {
    site = adminSite();
    TestBed.configureTestingModule({ providers: adminProviders(site, { migrationsRoute: '/admin/migrations' }) });
    http = TestBed.inject(HttpTestingController);
    fixture = await draw(SiteSettingsPageComponent);
    host = fixture.nativeElement;
    refuse(expectOne(http, 'GET', BASE), 503, 'feature_unavailable', 'The site settings are not there yet.');
    await settle(fixture);
    expect(words(host.querySelector('[data-unavailable]'))).toContain('Apply the pending database update first');
    expect(host.querySelector('[data-migrations-link]')?.getAttribute('href')).toBe('/admin/migrations');
  });

  describe('Getting in', () => {
    it("switches maintenance on with a message per language - the site's languages, and any other the words have - and saves what changed", async () => {
      await open(whole({ settings: { ...whole().settings, maintenance_message: { value: { de: 'Gleich zurück' }, ...NOBODY } } }), {
        languages: () => [
          { code: 'en', name: 'English' },
          { code: 'sk', name: 'Slovenčina' },
        ],
      });
      click(card('getting_in'));
      await settle(fixture);

      const dialog = host.querySelector('[data-switches="getting_in"]')!;
      expect(Array.from(dialog.querySelectorAll('[data-language]')).map((field) => field.getAttribute('data-language'))).toEqual(['en', 'sk', 'de']);
      expect(words(dialog.querySelector('[data-count]'))).toBe('Nothing changed');
      expect(dialog.querySelector<HTMLButtonElement>('[data-save]')?.disabled).toBe(true);
      expect(words(dialog)).toContain('/staff');

      click(dialog.querySelector('[data-enabled] input'));
      type(dialog.querySelector('[data-language="en"] textarea'), '  Back at six  ');
      await settle(fixture);
      expect(words(dialog.querySelector('[data-count]'))).toBe('2 unsaved');

      click(dialog.querySelector('[data-save]'));
      const saving = expectOne(http, 'PUT', BASE);
      expect(saving.request.body).toEqual({ settings: { maintenance_mode: true, maintenance_message: { de: 'Gleich zurück', en: 'Back at six' } } });
      saving.flush(whole({ settings: { ...whole().settings, maintenance_mode: { value: true, updated_at: '2026-10-25T09:00:00.000Z', updated_by: 7, updated_by_name: 'Mira' } } }));
      await settle(fixture);

      expect(host.querySelector('[data-switches]')).toBeNull();
      expect(words(host.querySelector('[data-happened]'))).toBe('Getting in: saved.');
      expect(lines('getting_in')[0]).toBe('Maintenance mode On');
    });

    it("a refused save keeps the dialog and says the server's sentence", async () => {
      await open();
      click(card('getting_in'));
      await settle(fixture);
      click(host.querySelector('[data-enabled] input'));
      await settle(fixture);
      click(host.querySelector('[data-save]'));
      refuse(expectOne(http, 'PUT', BASE), 422, 'invalid_setting', 'maintenance_message (en) is longer than 2000 characters.');
      await settle(fixture);
      expect(words(host.querySelector('[data-refusal]'))).toContain('maintenance_message (en) is longer than 2000 characters.');
      expect(host.querySelector('[data-switches]')).not.toBeNull();
    });
  });

  describe('Announcement', () => {
    it('its kind and a preview in that kind, its history - and Cancel saves nothing', async () => {
      await open();
      click(card('announcement'));
      await settle(fixture);

      const dialog = host.querySelector('[data-switches="announcement"]')!;
      expect(words(dialog)).toContain('Last changed');
      expect(words(dialog)).toContain('by Mira');
      expect(dialog.querySelector('[data-preview]')?.getAttribute('data-tone')).toBe('warning');
      expect(words(dialog.querySelector('[data-preview]'))).toBe('Down tonight');

      choose(dialog.querySelector('[data-level] select'), 'danger');
      await settle(fixture);
      expect(dialog.querySelector('[data-preview]')?.getAttribute('data-tone')).toBe('danger');
      expect(words(dialog.querySelector('[data-count]'))).toBe('1 unsaved');

      click(dialog.querySelector('[data-cancel]'));
      await settle(fixture);
      expect(host.querySelector('[data-switches]')).toBeNull();
      http.expectNone(BASE);
    });
  });

  describe('Page access', () => {
    it('a row a page: who sees it, off, the API paths refused with it - the changed rows saved together', async () => {
      await open();
      click(card('page_access'));
      await settle(fixture);

      const dialog = host.querySelector('[data-pages-dialog]')!;
      expect(Array.from(dialog.querySelectorAll('tr[data-page]')).map((row) => row.getAttribute('data-page'))).toEqual(['/quizzes', '/members', '/old']);
      choose(dialog.querySelector('[data-page="/quizzes"] select'), 'EDITOR');
      click(dialog.querySelector('[data-page="/members"] anotoki-checkbox input'));
      click(dialog.querySelector('[data-page="/members"] [data-api-toggle]'));
      await settle(fixture);
      type(dialog.querySelector('[data-api-row] [data-api-path] input'), '/api/members-extra/');
      await settle(fixture);
      click(dialog.querySelector('[data-api-row] button[type="submit"]'));
      await settle(fixture);
      expect(words(dialog.querySelector('[data-count]'))).toBe('2 unsaved');

      click(dialog.querySelector('[data-save]'));
      const saving = expectOne(http, 'PUT', `${BASE}/pages`);
      expect(saving.request.body).toEqual({
        pages: [
          { id: 1, visibility: 'EDITOR', blocked: false, api_paths: [] },
          { id: 2, visibility: 'USER', blocked: true, api_paths: ['/api/members', '/api/members-extra'] },
        ],
      });
      saving.flush(whole());
      await settle(fixture);
      expect(host.querySelector('[data-pages-dialog]')).toBeNull();
      expect(words(host.querySelector('[data-happened]'))).toBe('Page access: 2 pages saved.');
    });

    it("adds a page, administrators only unless said; a reserved one is refused in the server's words", async () => {
      await open();
      click(card('page_access'));
      await settle(fixture);
      click(host.querySelector('[data-start-adding]'));
      await settle(fixture);
      expect(words(host.querySelector('[data-pages-dialog]'))).toContain('/staff');

      type(host.querySelector('[data-new-path] input'), '/staff');
      await settle(fixture);
      click(host.querySelector('[data-add]'));
      const refused = expectOne(http, 'POST', `${BASE}/pages`);
      expect(refused.request.body).toEqual({ path: '/staff', visibility: 'ADMIN', blocked: false, api_paths: [] });
      refuse(refused, 422, 'invalid_page', "'/staff' would govern /staff, which stays everybody's.");
      await settle(fixture);
      expect(words(host.querySelector('[data-refusal]'))).toContain("'/staff' would govern /staff");

      type(host.querySelector('[data-new-path] input'), '/beta');
      await settle(fixture);
      click(host.querySelector('[data-add]'));
      expectOne(http, 'POST', `${BASE}/pages`).flush(whole({ pages: [...whole().pages, page({ id: 4, path: '/beta', visibility: 'ADMIN' })] }));
      await settle(fixture);
      expect(host.querySelector('[data-page="/beta"]')).not.toBeNull();
      expect(host.querySelector('[data-pages-dialog]')).not.toBeNull();
    });

    it('stops governing a page after a question whose focus starts on the no', async () => {
      await open();
      click(card('page_access'));
      await settle(fixture);
      click(host.querySelector('[data-page="/old"] [data-remove]'));
      await settle(fixture);
      expect(words(host.querySelector('[data-question] h2'))).toBe('Stop governing /old?');
      expect(document.activeElement?.hasAttribute('data-question-no')).toBe(true);

      click(host.querySelector('[data-question-yes]'));
      await settle(fixture);
      expectOne(http, 'DELETE', `${BASE}/pages/3`).flush(whole({ pages: whole().pages.slice(0, 2) }));
      await settle(fixture);
      expect(host.querySelector('[data-page="/old"]')).toBeNull();
      expect(words(host.querySelector('[data-happened]'))).toBe('Page access: /old is no longer governed.');
    });

    it('a row a rule passes over (a reserved page put in by hand) says why, and can only be removed', async () => {
      await open(whole({ pages: [page({ id: 9, path: '/staff', refused: "'/staff' would govern /staff, which stays everybody's." })] }));
      click(card('page_access'));
      await settle(fixture);
      expect(words(host.querySelector('[data-refused]'))).toContain('Passed over');
      expect(host.querySelector<HTMLSelectElement>('[data-page="/staff"] select')?.disabled).toBe(true);
      expect(lines('page_access')[0]).toBe('Pages governed 0');
    });
  });
});
