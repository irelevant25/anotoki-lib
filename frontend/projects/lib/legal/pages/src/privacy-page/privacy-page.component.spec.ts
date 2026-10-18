import { TestBed } from '@angular/core/testing';
import { DrawnPage, drawPage, headingLevels, inOrder, settle, words } from '../testing';
import { PrivacyPageComponent } from './privacy-page.component';

describe("<anotoki-privacy-page>: the family's privacy policy around the site's facts", () => {
  let drawn: DrawnPage<PrivacyPageComponent>;
  const host = () => drawn.host;
  const section = (name: string) => host().querySelector(`[data-section="${name}"]`);
  const kept = () => Array.from(host().querySelectorAll('[data-kept]')).map((part) => part.getAttribute('data-kept'));

  afterEach(() => {
    drawn?.fixture.destroy();
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
  });

  it('names who runs the site - the operator, linked, from Slovakia - and the address to write to', async () => {
    drawn = await drawPage(PrivacyPageComponent);
    expect(words(host().querySelector('h1'))).toBe('Privacy policy');
    const operator = section('who')?.querySelector('[data-operator]');
    expect(words(operator)).toBe('Piano Academy is run from Slovakia by Code Hero s.r.o., the controller in the words of the GDPR: it decides what the site keeps and why.');
    expect(operator?.querySelector('a')?.getAttribute('href')).toBe('https://codehero.sk');
    expect(section('who')?.querySelector('[data-email] a')?.getAttribute('href')).toBe('mailto:support@anotoki.eu');
    expect(section('who')?.querySelector('[data-operator-details]')).toBeNull();
  });

  it('names another operator where the site does, with its registered details, and links nothing it has no site for', async () => {
    drawn = await drawPage(PrivacyPageComponent, {
      config: { operator: { name: 'Another s.r.o.', url: null, email: ['hello', 'example.test'], details: ['Street 1, 811 01 Bratislava', 'ID 12 345 678'] } },
    });
    const operator = section('who')?.querySelector('[data-operator]');
    expect(words(operator)).toContain('run from Slovakia by Another s.r.o.');
    expect(operator?.querySelector('a')).toBeNull();
    expect(Array.from(section('who')?.querySelectorAll('address span') ?? []).map((line) => words(line))).toEqual(['Street 1, 811 01 Bratislava', 'ID 12 345 678']);
    expect(section('who')?.querySelector('[data-email] a')?.getAttribute('href')).toBe('mailto:hello@example.test');
  });

  it("lists what the site keeps - its own, its visitors', then the library's modules it runs - each a heading with what it is for", async () => {
    drawn = await drawPage(PrivacyPageComponent);
    expect(kept()).toEqual(['data-0', 'data-1', 'visitors', 'feedback', 'error-log', 'audit-log', 'backups']);
    const progress = host().querySelector('[data-kept="data-1"]');
    expect(words(progress?.querySelector('h3'))).toBe('Your progress');
    expect(words(progress)).toContain('The lessons you did, your scores and when.');
    expect(words(progress?.querySelector('dl'))).toBe('What for To show your progress and plan what comes next.');
    expect(words(host().querySelector('[data-kept="visitors"] h3'))).toBe('Using the site without an account');
    expect(words(host().querySelector('[data-kept="feedback"]'))).toContain('a reply address only if the sender leaves one');
    expect(words(host().querySelector('[data-kept="error-log"]'))).toContain('In place of the IP address it keeps a code made from it with a secret key, never the address itself.');
    expect(words(host().querySelector('[data-kept="backups"]'))).toContain("The copies are kept on the site's server, out of public reach; an administrator may also keep a downloaded copy elsewhere.");
  });

  it("leaves out feedback where the site takes none, says the backups are encrypted where they are, and takes the site's own words for a module", async () => {
    drawn = await drawPage(PrivacyPageComponent, {
      facts: { feedback: undefined, visitors: null, backups: { encrypted: true }, auditLog: { what: 'What administrators change, and your own security changes, with the address they came from.' } },
    });
    expect(kept()).toEqual(['data-0', 'data-1', 'error-log', 'audit-log', 'backups']);
    expect(words(host().querySelector('[data-kept="backups"]'))).toContain('out of public reach, and are encrypted; an administrator may also keep a downloaded copy, encrypted the same way, elsewhere.');
    expect(words(host().querySelector('[data-kept="audit-log"]'))).toContain('your own security changes, with the address they came from.');

    drawn.facts.update((facts) => ({ ...facts, errorLog: false, auditLog: false, backups: false }));
    await settle(drawn.fixture);
    expect(kept()).toEqual(['data-0', 'data-1']);
  });

  it("says how long each part stays, the library's numbers where the site changed nothing", async () => {
    drawn = await drawPage(PrivacyPageComponent, { facts: { feedback: { resolvedDays: 90 } } });
    const duration = (id: string) => words(host().querySelector(`[data-duration="${id}"] dd`));
    expect(Array.from(host().querySelectorAll('[data-duration] dt')).map((name) => words(name))).toEqual([
      'Your record here',
      'Your progress',
      'Using the site without an account',
      'Feedback',
      'The error log',
      'The audit log',
      'Backups',
    ]);
    expect(duration('data-1')).toBe('Until you delete it, or your account is deleted.');
    expect(duration('visitors')).toBe('30 days after your last visit.');
    expect(duration('feedback')).toContain('then 90 days after it is resolved, or 30 days after it is marked as spam');
    expect(duration('error-log')).toBe('30 days.');
    expect(duration('audit-log')).toBe('With no set time limit.');
    expect(duration('backups')).toContain('The 14 newest daily copies (a daily copy is made on a day the site is used); the 5 newest made before an update and the 5 newest made before a restore');
    expect(duration('backups')).toContain('What is deleted on the site stays in the copies made before, until they go.');
  });

  it("sends a site's people to the anotoki account's own privacy policy, and says what the site keeps of the account", async () => {
    drawn = await drawPage(PrivacyPageComponent);
    expect(words(section('account'))).toContain("The account itself - your e-mail address, your password, how you sign in - is kept by the anotoki account's own site, not by Piano Academy");
    expect(section('account')?.querySelector('[data-account-privacy]')?.getAttribute('href')).toBe('https://iam.example.test/privacy');
    expect(words(section('account'))).toContain("Piano Academy never sees your password, and it keeps your account's e-mail address only as the reply address of a feedback message you send, if you leave it in the form (on a site that takes feedback).");
    expect(words(section('account'))).toContain('takes your name and any reply address out of what it keeps');

    drawn.facts.update((facts) => ({ ...facts, account: { isIam: true, deleteUrl: '/account/security' } }));
    await settle(drawn.fixture);
    expect(words(section('account'))).toBe(
      'Your anotoki account This site is the anotoki account itself: one account for every anotoki site. What it keeps is listed above. Each anotoki site you sign in to keeps its own record of you, and its own privacy policy says what; when you delete your account, every site takes your name out of what it keeps.',
    );
    expect(section('account')?.querySelector('[data-account-privacy]')).toBeNull();
  });

  it("lists the cookies and browser storage by name - the family's in its words, the site's own in the site's", async () => {
    drawn = await drawPage(PrivacyPageComponent);
    drawn.facts.update((facts) => ({ ...facts, storage: [...facts.storage, { name: 'piano-academy:metronome', kind: 'session', purpose: "The metronome's speed.", kept: 'Until the tab closes.' }] }));
    await settle(drawn.fixture);
    const items = Array.from(host().querySelectorAll('[data-stored]'));
    expect(items.map((item) => words(item.querySelector('code')))).toEqual([
      'anotoki_signed_in',
      'anotoki-auth:piano',
      'piano-academy:theme',
      'piano-academy:language',
      'piano-academy:visitor',
      'piano-academy:metronome',
    ]);
    expect(words(items[0])).toContain(
      'cookie Set by the anotoki account when you sign in, for every anotoki site: it says only that somebody is signed in in this browser - a random value, never who',
    );
    expect(words(items[2])).toContain('local storage The look you chose: light or dark.');
    expect(words(items[4])).toContain('How long Until you sign in, or 30 days after your last visit.');
    expect(words(items[5])).toBe("piano-academy:metronome session storage The metronome's speed. How long Until the tab closes.");
    expect(words(section('storage'))).toContain('The site uses no cookies for advertising or tracking.');
  });

  it("counts visits with the family's Umami - no cookie, no IP address - or says it counts none", async () => {
    drawn = await drawPage(PrivacyPageComponent);
    const analytics = () => words(host().querySelector('[data-analytics]'));
    expect(analytics()).toContain('The site counts its visits with Umami, which runs on our own server (umami.anotoki.eu).');
    expect(analytics()).toContain('It sets no cookie, stores nothing in your browser, and keeps no IP address and nothing that names you.');

    drawn.facts.update((facts) => ({ ...facts, analytics: false }));
    await settle(drawn.fixture);
    expect(analytics()).toBe('The site counts no visits and uses no analytics.');
  });

  it('names who else handles data: the hosting company "to be named" until the site names it, Cloudflare, Google, the mail service', async () => {
    drawn = await drawPage(PrivacyPageComponent);
    const recipients = () => Array.from(host().querySelectorAll('[data-recipient]'));
    expect(words(recipients()[0])).toBe('The hosting company (to be named) Runs the server the site and its database are on.');
    expect(recipients()[1].querySelector('a')?.getAttribute('href')).toBe('https://www.cloudflare.com/privacypolicy/');
    expect(words(recipients()[1])).toContain('Cloudflare, Inc. Carries every request to the site and back');

    drawn.facts.update((facts) => ({
      ...facts,
      processors: [{ preset: 'hosting', name: 'Hosting Company s.r.o.' }, { preset: 'google' }, { preset: 'mail' }, { name: 'A font service', role: 'Serves the fonts.' }],
    }));
    drawn.language.set('sk');
    await settle(drawn.fixture);
    expect(recipients().map((recipient) => words(recipient.querySelector('.anotoki-legal-page__item-name')))).toEqual([
      'Hosting Company s.r.o.',
      'Google',
      'Služba na odosielanie e-mailov (názov bude doplnený)',
      'A font service',
    ]);
    expect(recipients()[1].querySelector('a')?.getAttribute('href')).toBe('https://policies.google.com/privacy');
  });

  it("says a person's rights: the address to ask, the account deleted on its page in 30 days, a complaint to Slovakia's authority", async () => {
    drawn = await drawPage(PrivacyPageComponent);
    const rights = section('rights');
    expect(words(rights)).toContain('Under the GDPR you may ask us to show you what we keep about you, to correct it, to delete it');
    expect(rights?.querySelector('a[href="mailto:support@anotoki.eu"]')).not.toBeNull();
    expect(words(rights?.querySelector('[data-delete]'))).toBe(
      'You can delete your anotoki account yourself on its account page: it closes at once and is deleted 30 days later, and until then you can cancel. Open the account page',
    );
    expect(rights?.querySelector('[data-account-page]')?.getAttribute('href')).toBe('https://iam.example.test/account/security');
    const authority = rights?.querySelector('[data-authority] a');
    expect(authority?.getAttribute('href')).toBe('https://dataprotection.gov.sk/');
    expect(words(authority)).toBe('Office for Personal Data Protection of the Slovak Republic (Úrad na ochranu osobných údajov Slovenskej republiky)');

    // On the IAM itself the account page is a path of its own: the router follows it.
    drawn.facts.update((facts) => ({ ...facts, account: { isIam: true, deleteUrl: '/account/security', deletionDays: 30 } }));
    await settle(drawn.fixture);
    expect(section('rights')?.querySelector('[data-account-page]')?.getAttribute('href')).toBe('/account/security');
  });

  it('keeps its headings in order - one h1, a section an h2, each part an h3 - and lists its sections at the top', async () => {
    drawn = await drawPage(PrivacyPageComponent);
    expect(inOrder(headingLevels(host()))).toBe(true);
    expect(headingLevels(host()).filter((level) => level === 3)).toHaveLength(7);
    const links = Array.from(host().querySelectorAll<HTMLAnchorElement>('nav a'));
    expect(links).toHaveLength(10);
    links[7].click();
    expect(document.activeElement).toBe(section('rights')?.querySelector('h2'));
  });

  it('speaks Slovak without addressing anybody', async () => {
    drawn = await drawPage(PrivacyPageComponent, { language: 'sk' });
    expect(host().getAttribute('lang')).toBe('sk');
    expect(words(host().querySelector('h1'))).toBe('Ochrana osobných údajov');
    expect(words(section('who')?.querySelector('[data-operator]'))).toBe(
      'Stránku Piano Academy prevádzkuje zo Slovenska Code Hero s.r.o., prevádzkovateľ v zmysle GDPR: rozhoduje o tom, čo stránka uchováva a prečo.',
    );
    expect(words(section('rights')?.querySelector('h2'))).toBe('Práva dotknutých osôb');
    expect(words(host().querySelector('[data-updated]'))).toBe('Naposledy aktualizované: 20. októbra 2026');
  });
});
