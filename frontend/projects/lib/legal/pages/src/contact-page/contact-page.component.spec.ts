import { TestBed } from '@angular/core/testing';
import { DrawnPage, drawPage, headingLevels, inOrder, settle, words } from '../testing';
import { ContactPageComponent } from './contact-page.component';

describe('<anotoki-contact-page>: every message is read - feedback, the address, deleting the account, who runs it', () => {
  let drawn: DrawnPage<ContactPageComponent>;
  const host = () => drawn.host;
  const section = (name: string) => host().querySelector(`[data-section="${name}"]`);
  const sections = () => Array.from(host().querySelectorAll('[data-section]')).map((each) => each.getAttribute('data-section'));

  afterEach(() => {
    drawn?.fixture.destroy();
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
  });

  it('offers the feedback form first on a site that takes feedback, then the address for everything else', async () => {
    drawn = await drawPage(ContactPageComponent);
    expect(words(host().querySelector('h1'))).toBe('Contact');
    expect(words(host().querySelector('.anotoki-page-header__lead'))).toBe('Every message is read.');
    expect(sections()).toEqual(['feedback', 'email', 'delete', 'response', 'about']);
    expect(words(section('feedback')?.querySelector('h2'))).toBe('Found a bug or have an idea?');
    expect(words(section('feedback'))).toContain('The feedback form is the quickest way: it goes straight to the people who look after Piano Academy.');
    expect(words(section('email')?.querySelector('h2'))).toBe('Everything else');
    expect(words(section('email')?.querySelector('[data-email]'))).toBe('A privacy question, a copy of your data, anything else: write to support@anotoki.eu.');
    expect(words(section('response'))).toBe('Response time We aim to reply within a few days.');
    expect(inOrder(headingLevels(host()))).toBe(true);
  });

  it('gives the address alone on a site without feedback (the IAM, the survey)', async () => {
    drawn = await drawPage(ContactPageComponent, { facts: { feedback: undefined } });
    expect(sections()).toEqual(['email', 'delete', 'response', 'about']);
    expect(host().querySelector('[data-open-feedback]')).toBeNull();
    expect(words(section('email')?.querySelector('h2'))).toBe('By e-mail');
    expect(words(section('email')?.querySelector('[data-email]'))).toBe('A bug, an idea, a privacy question, a copy of your data, anything at all: write to support@anotoki.eu.');
  });

  it("links the address - joined only in the page - copies it, and asks for the account's own address", async () => {
    drawn = await drawPage(ContactPageComponent);
    const email = section('email')?.querySelector<HTMLAnchorElement>('[data-email] a');
    expect(email?.getAttribute('href')).toBe('mailto:support@anotoki.eu');
    expect(words(email)).toBe('support@anotoki.eu');
    expect(words(section('email')?.querySelector('[data-copy-address] button'))).toBe('Copy the address');
    expect(words(section('email'))).toContain('If it is about your account, write from the address your anotoki account uses, or name it in the message.');
  });

  it("sends a person to the anotoki account's page to delete their account - 30 days, cancellable - and says what the site keeps then", async () => {
    drawn = await drawPage(ContactPageComponent);
    expect(words(section('delete'))).toContain(
      'No need to write: you can delete your anotoki account yourself on its account page. It closes at once and is deleted 30 days later; until then you can cancel it there.',
    );
    expect(words(section('delete'))).toContain('The account is one for every anotoki site, so it goes for all of them; Piano Academy then keeps what you did here without your name.');
    const link = section('delete')?.querySelector('[data-account-page]');
    expect(link?.getAttribute('href')).toBe('https://iam.example.test/account/security');
    expect(words(link)).toBe('Open the account page');

    drawn.facts.update((facts) => ({ ...facts, account: { isIam: true, deleteUrl: '/account/security' } }));
    await settle(drawn.fixture);
    expect(words(section('delete'))).toContain('each site then keeps what you did there without your name.');
    expect(section('delete')?.querySelector('[data-account-page]')?.getAttribute('href')).toBe('/account/security');
  });

  it('says who runs the site, linked - and the fan clause only where the site asks for it', async () => {
    drawn = await drawPage(ContactPageComponent);
    const operator = section('about')?.querySelector('[data-operator]');
    expect(words(operator)).toBe('Piano Academy is run by Code Hero s.r.o., from Slovakia.');
    expect(operator?.querySelector('a')?.getAttribute('href')).toBe('https://codehero.sk');
    expect(section('about')?.querySelector('[data-fan]')).toBeNull();

    drawn.facts.update((facts) => ({ ...facts, fanDisclaimer: 'hoyoverse' }));
    await settle(drawn.fixture);
    expect(words(section('about')?.querySelector('[data-fan]'))).toContain('is not affiliated with or endorsed by HoYoverse');
  });

  it("opens the library's feedback form in the kit's dialog - its code fetched with the press - named by the dialog, its buttons in the dialog's footer", async () => {
    drawn = await drawPage(ContactPageComponent);
    expect(host().querySelector('anotoki-feedback-form')).toBeNull();

    const open = async (): Promise<Element | null> => {
      host().querySelector<HTMLButtonElement>('[data-open-feedback]')!.click();
      for (let i = 0; i < 20 && !host().querySelector('anotoki-feedback-form'); i++) {
        await settle(drawn.fixture);
      }
      // Made at once when its code is here already: drawn with the next render.
      await settle(drawn.fixture);
      return host().querySelector('[data-feedback-dialog]');
    };
    let dialog = await open();
    expect(words(dialog?.querySelector('.anotoki-dialog__title, h2'))).toBe('Send feedback');
    expect(dialog?.querySelector('.anotoki-dialog__body anotoki-feedback-form')).not.toBeNull();
    expect(dialog?.querySelector('anotoki-feedback-form h2, anotoki-feedback-form h3')).toBeNull();
    // The footer's dialog (0.8.0): Clear, Cancel and Send in the dialog's own footer (in the form's language - here the
    // document's, as the page configures no form).
    expect(Array.from(dialog?.querySelectorAll<HTMLElement>('.anotoki-dialog__footer button') ?? []).map((button) => Object.keys(button.dataset))).toEqual([['clear'], ['cancel'], ['send']]);
    expect(host().querySelector('[data-feedback-failed]')).toBeNull();

    // Closed, the focus is back on the button - which was busy, and so disabled, while the form's code came.
    const message = dialog!.querySelector<HTMLTextAreaElement>('[data-message] textarea')!;
    message.value = 'A question about my data.';
    message.dispatchEvent(new Event('input', { bubbles: true }));
    dialog?.querySelector<HTMLButtonElement>('.anotoki-dialog__close')!.click();
    await settle(drawn.fixture);
    expect(host().querySelector('[data-feedback-dialog]')).toBeNull();
    expect(document.activeElement).toBe(host().querySelector('[data-open-feedback]'));

    // Opened again: what was typed is still there; Cancel closes it too.
    dialog = await open();
    expect(dialog?.querySelector<HTMLTextAreaElement>('[data-message] textarea')?.value).toBe('A question about my data.');
    dialog?.querySelector<HTMLButtonElement>('.anotoki-dialog__footer [data-cancel]')!.click();
    await settle(drawn.fixture);
    expect(host().querySelector('[data-feedback-dialog]')).toBeNull();
    expect(document.activeElement).toBe(host().querySelector('[data-open-feedback]'));
  });

  it('speaks Slovak without addressing anybody', async () => {
    drawn = await drawPage(ContactPageComponent, { language: 'sk' });
    expect(host().getAttribute('lang')).toBe('sk');
    expect(words(host().querySelector('h1'))).toBe('Kontakt');
    expect(words(host().querySelector('.anotoki-page-header__lead'))).toBe('Čítame každú správu.');
    expect(words(section('feedback')?.querySelector('h2'))).toBe('Chyba alebo nápad?');
    expect(words(section('feedback')?.querySelector('[data-open-feedback]'))).toBe('Poslať spätnú väzbu');
    expect(words(section('about')?.querySelector('[data-operator]'))).toBe('Stránku Piano Academy prevádzkuje Code Hero s.r.o. zo Slovenska.');
  });
});
