import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { provideTestAnotokiAuth, testAnotokiAuth } from './provide-test-auth';

describe("@anotoki/lib/auth/testing: the module in a site's specs, without an IAM", () => {
  it('somebody signed in, with the roles the test gives; another tab signs out', async () => {
    const handle = testAnotokiAuth();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), ...provideTestAnotokiAuth({ user: { sub: '7', preferred_username: 'alice' }, roles: ['MEMBER', 'ADMIN'] }, handle)],
    });
    const auth = TestBed.inject(AnotokiAuth);
    await auth.init();

    expect(auth.state()).toBe('signed-in');
    expect(auth.isAdmin()).toBe(true);
    expect(auth.displayName()).toBe('alice');
    expect(await auth.token()).toBe('token-1');

    handle.client?.signOut();
    expect(auth.state()).toBe('signed-out');
  });

  it('a visitor, where the site lets visitors in; a sign-in recorded, never sent', async () => {
    const handle = testAnotokiAuth();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), ...provideTestAnotokiAuth({ loginRequired: false }, handle)] });
    const auth = TestBed.inject(AnotokiAuth);
    await auth.init();

    expect(auth.state()).toBe('visitor');
    expect(await auth.signIn({ returnTo: '/x' })).toBe(true);
    expect(handle.client?.logins).toEqual([{ returnTo: '/x' }]);
    expect(handle.browser.navigations).toEqual([]);
  });

  it('the hint, when the test gives the cookie: one hop, recorded', async () => {
    const handle = testAnotokiAuth('anotoki_signed_in=aaaaaaaaaaaaaaaaaaaaaa');
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), ...provideTestAnotokiAuth({ loginRequired: false, cookie: handle.browser.cookies }, handle)] });
    void TestBed.inject(AnotokiAuth).init();
    await new Promise((done) => setTimeout(done, 10));
    expect(handle.client?.logins.map((login) => login.prompt)).toEqual(['none']);
  });
});
