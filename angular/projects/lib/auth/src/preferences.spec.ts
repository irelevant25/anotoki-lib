import { TestBed } from '@angular/core/testing';
import { AnotokiPreferences, SitePreferences } from '@anotoki/lib/auth/core';
import { AnotokiAuth } from './auth.service';
import { AccountPreferences } from './preferences';
import { SpecSite, provideSpecAuth, settle, specSite, user } from './testing';

const AUTO: AnotokiPreferences = { theme: 'auto', date_format: null, time_format: null };

describe("AccountPreferences: the account's theme, dates, clock and language, followed and saved", () => {
  let site: SpecSite;
  let applied: [AnotokiPreferences | null, string | null][];
  let preferences: AccountPreferences;

  async function start(signedIn = true, kept: AnotokiPreferences | null = AUTO): Promise<void> {
    site = specSite();
    applied = [];
    if (signedIn) {
      site.prepare = (client) => client.hold(user('7', ['MEMBER'], { preferences: kept, locale: 'sk' }), null);
    }
    const page: SitePreferences = { apply: (prefs, locale) => applied.push([prefs, locale]) };
    TestBed.configureTestingModule({ providers: provideSpecAuth(site, { preferences: () => page }) });
    await TestBed.inject(AnotokiAuth).init();
    preferences = TestBed.inject(AccountPreferences);
    TestBed.tick();
  }

  it("the page shows the account's choices while somebody is signed in, and its own otherwise", async () => {
    await start();
    expect(applied.at(-1)).toEqual([AUTO, 'sk']);
    site.client!.change(null);
    TestBed.tick();
    expect(applied.at(-1)).toEqual([null, null]);
  });

  it("no account, or an IAM that keeps none: the choice stays the device's", async () => {
    await start(false);
    expect(await preferences.save('theme', 'dark')).toEqual({ outcome: 'device' });
    TestBed.resetTestingModule();
    await start(true, null);
    expect(await preferences.save('theme', 'dark')).toEqual({ outcome: 'device' });
    expect(site.client?.saved).toEqual([]);
  });

  it('saved: shown at once, kept by the account', async () => {
    await start();
    const saving = preferences.save('theme', 'dark');
    TestBed.tick();
    expect(applied.at(-1)?.[0]?.theme).toBe('dark');
    expect(preferences.saving('theme')).toBe(true);
    expect(await saving).toEqual({ outcome: 'saved' });
    TestBed.tick();
    expect(applied.at(-1)?.[0]?.theme).toBe('dark');
    expect(preferences.saving('theme')).toBe(false);
    expect(site.client?.saved).toEqual([{ theme: 'dark' }]);
  });

  it('one at a time, the latest choice last: an earlier one is superseded', async () => {
    await start();
    const results = await Promise.all([preferences.save('theme', 'dark'), preferences.save('theme', 'light'), preferences.save('time_format', '24'), preferences.save('theme', 'auto')]);
    // dark went first, and its answer came after auto was chosen: auto's fate is the news, dark's and light's are not.
    expect(results).toEqual([{ outcome: 'superseded' }, { outcome: 'superseded' }, { outcome: 'saved' }, { outcome: 'saved' }]);
    expect(site.client?.saved).toEqual([{ theme: 'dark' }, { theme: 'auto' }, { time_format: '24' }]);
    TestBed.tick();
    expect(applied.at(-1)).toEqual([{ theme: 'auto', date_format: null, time_format: '24' }, 'sk']);
  });

  it("refused: said by its code, and the account's value shown again", async () => {
    await start();
    site.client!.preferencesError = 'network';
    expect(await preferences.save('theme', 'dark')).toEqual({ outcome: 'refused', code: 'network' });
    TestBed.tick();
    expect(applied.at(-1)?.[0]?.theme).toBe('auto');
  });

  it("a language the IAM does not offer, or refuses as invalid, stays the site's own for the visit - and says nothing", async () => {
    await start();
    site.client!.offered = ['en', 'sk'];
    expect(await preferences.save('language', 'de')).toEqual({ outcome: 'device' });
    TestBed.tick();
    expect(applied.at(-1)?.[1]).toBe('de');
    expect(site.client?.saved).toEqual([]);

    expect(await preferences.save('language', 'sk-SK')).toEqual({ outcome: 'saved' });
    TestBed.tick();
    expect(applied.at(-1)?.[1]).toBe('sk-SK');

    site.client!.preferencesError = 'invalid_request';
    expect(await preferences.save('language', 'en-GB')).toEqual({ outcome: 'refused', code: 'invalid_request' });
    TestBed.tick();
    expect(applied.at(-1)?.[1]).toBe('en-GB');
    await settle();
  });
});
