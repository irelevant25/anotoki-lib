import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { provideAnotokiMigrations, SiteStatus } from '@anotoki/lib/migrations';
import { AnotokiAuth } from './auth.service';
import { authError } from './client/oidc-client';
import { adminGuard, personGuard, personOrVisitorGuard, staffGuard } from './guards';
import { SpecSite, provideSpecAuth, settle, specSite, user } from './testing';

@Component({ selector: 'anotoki-spec-page', template: 'page' })
class PageComponent {}

describe('the guards', () => {
  let site: SpecSite;

  async function start(options: { loginRequired?: boolean; roles?: string[] | null; blocked?: boolean; failure?: string } = {}): Promise<Router> {
    site = specSite({ login_required: options.loginRequired ?? true });
    if (options.roles) {
      site.prepare = (client) => client.hold(user('7', options.roles ?? []), null);
    }
    if (options.failure) {
      const prepare = site.prepare;
      site.prepare = (client) => {
        prepare(client);
        client.initResult = { returnTo: '/learn', error: authError(options.failure ?? 'x', 'no'), silent: false };
      };
    }
    TestBed.configureTestingModule({
      providers: [
        ...provideSpecAuth(site, { forbiddenRoute: '/sorry' }, [
          { path: 'learn', component: PageComponent, canActivate: [personGuard] },
          { path: 'take', component: PageComponent, canActivate: [personOrVisitorGuard] },
          { path: 'admin', component: PageComponent, canActivate: [staffGuard] },
          { path: 'admin/people', component: PageComponent, canActivate: [adminGuard] },
          { path: 'auth/callback', component: PageComponent },
          { path: 'sorry', component: PageComponent },
          { path: '', component: PageComponent },
        ]),
        provideAnotokiMigrations(() => ({
          statusUrl: '/api/site-status',
          apiBase: '/api/admin/migrations',
          migrationsRoute: '/admin/migrations',
          isAdmin: () => false,
          isSignedIn: () => false,
          signIn: () => undefined,
          language: () => 'en',
        })),
      ],
    });
    if (options.blocked) {
      TestBed.inject(SiteStatus).report('update_pending');
    }
    await TestBed.inject(AnotokiAuth).init();
    return TestBed.inject(Router);
  }

  async function go(router: Router, url: string): Promise<string> {
    await router.navigateByUrl(url);
    await settle();
    return router.url;
  }

  it('somebody signed in passes', async () => {
    const router = await start({ roles: ['MEMBER'] });
    expect(await go(router, '/learn')).toBe('/learn');
  });

  it('nobody signed in goes to the IAM, coming back to the page asked for', async () => {
    const router = await start();
    expect(await go(router, '/learn?x=1')).toBe('/');
    expect(site.client?.logins).toEqual([{ returnTo: '/learn?x=1' }]);
  });

  it('a visitor passes where visitors are welcome, and only there', async () => {
    const router = await start({ loginRequired: false });
    expect(await go(router, '/take')).toBe('/take');
    expect(await go(router, '/learn')).toBe('/take');
    expect(site.client?.logins).toEqual([{ returnTo: '/learn' }]);
  });

  it('a sign-in that came back without one: its words on the callback page, never the IAM again', async () => {
    const router = await start({ failure: 'access_denied' });
    expect(await go(router, '/learn')).toBe('/auth/callback');
    expect(site.client?.logins).toEqual([]);
  });

  it('every page while the site is blocked: the status page stands in front, with a sign-in of its own', async () => {
    const router = await start({ blocked: true });
    expect(await go(router, '/learn')).toBe('/learn');
    expect(site.client?.logins).toEqual([]);
  });

  it("the admin area by the token's roles; without the role, the site's own page", async () => {
    const editor = await start({ roles: ['MEMBER', 'EDITOR'] });
    expect(await go(editor, '/admin')).toBe('/admin');
    expect(await go(editor, '/admin/people')).toBe('/sorry');

    TestBed.resetTestingModule();
    const member = await start({ roles: ['MEMBER'] });
    expect(await go(member, '/admin')).toBe('/sorry');

    TestBed.resetTestingModule();
    const admin = await start({ roles: ['MEMBER', 'ADMIN'] });
    expect(await go(admin, '/admin/people')).toBe('/admin/people');

    TestBed.resetTestingModule();
    const visitor = await start({ loginRequired: false });
    expect(await go(visitor, '/admin')).toBe('/');
    expect(site.client?.logins).toEqual([{ returnTo: '/admin' }]);
  });
});
