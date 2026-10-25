import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { kitProviders, settle, words } from '../../ui/src/testing';
import { AnnouncementComponent, announcementMark } from './announcement/announcement.component';
import { provideAnotokiSiteSettings } from './config';
import { pageAccessGuard } from './page-access.guard';
import { PageNoticeComponent } from './page-notice/page-notice.component';
import { SiteSettings, pageMatches } from './site-settings.service';

const URL = '/api/site-settings';
const KEY = 'anotoki-test:announcement';

@Component({ selector: 'anotoki-test-page', template: '<p id="page">{{ name }}</p>' })
class TestPageComponent {
  name = 'page';
}

@Component({ selector: 'anotoki-test-missing', template: '<p id="missing">Not found</p>' })
class MissingPageComponent {}

@Component({
  selector: 'anotoki-test-frame',
  imports: [AnnouncementComponent, PageNoticeComponent],
  template: '<anotoki-announcement /><anotoki-page-notice />',
})
class FrameComponent {}

describe('The site settings on the pages', () => {
  const roles = signal<string[]>([]);
  const signedIn = signal(false);
  const language = signal('en');
  let http: HttpTestingController;
  let settings: SiteSettings;

  function setUp(): void {
    roles.set([]);
    signedIn.set(false);
    language.set('en');
    TestBed.configureTestingModule({
      providers: kitProviders(
        () => ({ language: () => language() }),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'quizzes', canMatch: [pageAccessGuard], children: [{ path: '**', component: TestPageComponent }] },
          { path: '', canMatch: [pageAccessGuard], children: [{ path: '**', component: TestPageComponent }] },
          { path: '**', component: MissingPageComponent },
        ]),
        provideAnotokiSiteSettings(() => ({ roles, signedIn, storageKey: KEY })),
      ),
    });
    http = TestBed.inject(HttpTestingController);
    settings = TestBed.inject(SiteSettings);
  }

  async function load(body: object): Promise<void> {
    const loading = settings.load();
    http.expectOne(URL).flush(body);
    await loading;
  }

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  describe('SiteSettings', () => {
    it('reads what every page is told - defensively: what is no announcement or no page is nothing', async () => {
      setUp();
      await load({
        maintenance: 'yes',
        announcement: { level: 'shout', message: { en: 'Down tonight', sk: '   ', de: 5 } },
        pages: [{ path: '/quizzes', visibility: 'USER', blocked: false }, { path: 'no-slash', visibility: 'PUBLIC' }, { path: '/odd', visibility: 'NONSENSE', blocked: 'yes' }, 7],
      });

      expect(settings.maintenance()).toBe(false);
      expect(settings.announcement()).toEqual({ level: 'info', message: { en: 'Down tonight' } });
      expect(settings.pages()).toEqual([
        { path: '/quizzes', visibility: 'USER', blocked: false },
        { path: '/odd', visibility: 'ADMIN', blocked: false },
      ]);
    });

    it("a read that fails leaves every page anybody's and nothing to say - never rejects", async () => {
      setUp();
      const loading = settings.load();
      http.expectOne(URL).flush('down', { status: 503, statusText: 'Service Unavailable' });
      await expect(loading).resolves.toBeUndefined();
      expect(settings.announcement()).toBeNull();
      expect(settings.mayNavigate('/quizzes')).toBe(true);
    });

    it("who may have a page: its row's visibility, switched off for all but the administrators - who keep every page", async () => {
      setUp();
      await load({
        announcement: null,
        pages: [
          { path: '/members', visibility: 'USER', blocked: false },
          { path: '/drafts', visibility: 'EDITOR', blocked: false },
          { path: '/old/:id', visibility: 'PUBLIC', blocked: true },
        ],
      });
      const may = () => ['/members', '/drafts', '/old/7', '/elsewhere'].map((path) => settings.mayNavigate(path));

      expect(may()).toEqual([false, false, false, true]);
      signedIn.set(true);
      expect(may()).toEqual([true, false, false, true]);
      roles.set(['MEMBER', 'EDITOR']);
      expect(may()).toEqual([true, true, false, true]);
      roles.set(['MEMBER', 'admin']);
      expect(may()).toEqual([true, true, true, true]);
    });

    it('tells the administrators alone which pages are off or limited', async () => {
      setUp();
      await load({
        announcement: null,
        pages: [
          { path: '/members', visibility: 'USER', blocked: false },
          { path: '/old', visibility: 'ADMIN', blocked: true },
          { path: '/open', visibility: 'PUBLIC', blocked: false },
        ],
      });
      expect(settings.noticeFor('/members')).toBeNull();
      roles.set(['ADMIN']);
      expect(settings.noticeFor('/members')).toEqual({ kind: 'limited', visibility: 'USER' });
      expect(settings.noticeFor('/old')).toEqual({ kind: 'off' });
      expect(settings.noticeFor('/open')).toBeNull();
      expect(settings.noticeFor('/nowhere')).toBeNull();
    });

    it('a row matches its page segment by segment, a placeholder any one', () => {
      expect(pageMatches('/database/characters/:id', '/database/characters/12?tab=talents')).toBe(true);
      expect(pageMatches('/database/characters', '/database/characters/12')).toBe(false);
      expect(pageMatches('/', '/')).toBe(true);
      expect(pageMatches('/quizzes', '/quizzes-old')).toBe(false);
    });
  });

  describe('pageAccessGuard', () => {
    it('a page the reader may not have does not match: the router goes on to the not-found page at the address they typed', async () => {
      setUp();
      await load({ announcement: null, pages: [{ path: '/quizzes/music', visibility: 'USER', blocked: false }] });
      const router = TestBed.inject(Router);
      const fixture = TestBed.createComponent(FrameComponent);

      expect(await router.navigateByUrl('/quizzes/music')).toBe(true);
      expect(router.url).toBe('/quizzes/music');
      expect(router.routerState.snapshot.root.firstChild?.routeConfig?.path).toBe('**');
      expect(await router.navigateByUrl('/quizzes/voice')).toBe(true);
      expect(router.routerState.snapshot.root.firstChild?.routeConfig?.path).toBe('quizzes');

      signedIn.set(true);
      await router.navigateByUrl('/quizzes/music');
      expect(router.routerState.snapshot.root.firstChild?.routeConfig?.path).toBe('quizzes');
      fixture.destroy();
    });
  });

  describe('<anotoki-announcement>', () => {
    let fixture: ComponentFixture<FrameComponent>;
    const bar = () => fixture.nativeElement.querySelector('[data-announcement]') as HTMLElement | null;

    async function draw(): Promise<void> {
      fixture = TestBed.createComponent(FrameComponent);
      document.body.appendChild(fixture.nativeElement);
      await settle(fixture);
    }

    afterEach(() => fixture?.nativeElement.remove());

    it("says the message in the page's language, its kind heard first, in the kind's colours", async () => {
      setUp();
      language.set('sk');
      await load({ announcement: { level: 'warning', message: { en: 'Down tonight', sk: 'Dnes v noci mimo.\nPrepáč.' } }, pages: [] });
      await draw();

      expect(bar()?.getAttribute('aria-label')).toBe('Oznámenie');
      expect(bar()?.classList).toContain('anotoki-announcement__bar--warning');
      expect(words(bar()?.querySelector('.anotoki-visually-hidden'))).toBe('Upozornenie:');
      expect(bar()?.querySelector('.anotoki-announcement__message')?.textContent).toBe('Dnes v noci mimo.\nPrepáč.');
      expect(bar()?.querySelector('.anotoki-announcement__message')?.getAttribute('lang')).toBeNull();
      const hide = bar()!.querySelector<HTMLButtonElement>('[data-hide]')!;
      expect(words(hide)).toBe('Skryť');
      expect(hide.getAttribute('aria-label')).toBe('Skryť oznámenie');
    });

    it("English where the page's language has none, marked so; nothing where neither is written", async () => {
      setUp();
      language.set('sk');
      await load({ announcement: { level: 'danger', message: { en: 'Down tonight' } }, pages: [] });
      await draw();
      expect(bar()?.querySelector('.anotoki-announcement__message')?.getAttribute('lang')).toBe('en');
      expect(words(bar()?.querySelector('.anotoki-visually-hidden'))).toBe('Dôležité:');

      await load({ announcement: { level: 'info', message: { de: 'Heute Nacht' } }, pages: [] });
      await settle(fixture);
      expect(bar()).toBeNull();
    });

    it('Hide hides it until its words change - remembered as a mark, never the words', async () => {
      setUp();
      await load({ announcement: { level: 'info', message: { en: 'Down tonight' } }, pages: [] });
      await draw();
      bar()!.querySelector<HTMLButtonElement>('[data-hide]')!.click();
      await settle(fixture);

      expect(bar()).toBeNull();
      expect(localStorage.getItem(KEY)).toMatch(/^v1:[0-9a-f]{8}$/);
      expect(localStorage.getItem(KEY)).not.toContain('Down');

      // A page loaded again: still hidden.
      fixture.destroy();
      await draw();
      expect(bar()).toBeNull();

      // Reworded - or made graver - it shows again.
      await load({ announcement: { level: 'info', message: { en: 'Down tonight, at ten' } }, pages: [] });
      await settle(fixture);
      expect(bar()).not.toBeNull();
      expect(announcementMark({ level: 'info', message: { en: 'x' } })).not.toBe(announcementMark({ level: 'danger', message: { en: 'x' } }));
    });

    it("a browser that keeps nothing hides it for the page's life, and never throws", async () => {
      setUp();
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      await load({ announcement: { level: 'info', message: { en: 'Down tonight' } }, pages: [] });
      await draw();
      bar()!.querySelector<HTMLButtonElement>('[data-hide]')!.click();
      await settle(fixture);
      expect(bar()).toBeNull();
      vi.restoreAllMocks();
    });
  });

  describe('<anotoki-page-notice>', () => {
    let fixture: ComponentFixture<FrameComponent>;
    const notices = () => Array.from(fixture.nativeElement.querySelectorAll('anotoki-page-notice anotoki-alert')).map((alert) => (alert as HTMLElement).getAttribute('data-notice'));

    it('tells an administrator the site is closed and the page is off or limited - and nobody else, ever', async () => {
      setUp();
      const pages = [
        { path: '/members', visibility: 'USER', blocked: false },
        { path: '/old', visibility: 'PUBLIC', blocked: true },
      ];
      await load({ maintenance: true, announcement: null, pages });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/members');
      fixture = TestBed.createComponent(FrameComponent);
      await settle(fixture);
      expect(notices()).toEqual([]);

      roles.set(['ADMIN']);
      await settle(fixture);
      expect(notices()).toEqual(['maintenance', 'limited']);
      expect(words(fixture.nativeElement.querySelector('[data-notice="limited"]'))).toContain('It is shown to people who are signed in.');

      await router.navigateByUrl('/old');
      await settle(fixture);
      expect(notices()).toEqual(['maintenance', 'off']);

      // Opened again (the administrators' page refreshes what the pages were told after its save).
      await load({ maintenance: false, announcement: null, pages });
      await router.navigateByUrl('/elsewhere');
      await settle(fixture);
      expect(notices()).toEqual([]);
    });

    it('in Slovak, the audience as the sentence takes it', async () => {
      setUp();
      language.set('sk');
      roles.set(['ADMIN']);
      await load({ announcement: null, pages: [{ path: '/drafts', visibility: 'EDITOR', blocked: false }] });
      await TestBed.inject(Router).navigateByUrl('/drafts');
      fixture = TestBed.createComponent(FrameComponent);
      await settle(fixture);
      expect(notices()).toEqual(['limited']);
      expect(words(fixture.nativeElement.querySelector('[data-notice="limited"]'))).toContain('Zobrazuje sa editorom a administrátorom.');
    });
  });
});
